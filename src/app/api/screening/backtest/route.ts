// Force recompile
import { NextRequest, NextResponse } from "next/server";

import { getDomesticStockDailyAround, getDomesticStockDailyRawPrice } from "@/server/kis/rest-client";
import { evictCacheByPattern } from "@/server/kis/cache";
import { getScreeningResult, deleteScreeningResult, formatKSTDateCompact, updateScreeningItemBacktest } from "@/server/screening/storage";
import { findNextTradingDay, iterateDateRange, classifyTrend, type TrendLabel } from "@/server/screening/backtest-utils";


export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 헬퍼: EGW00201(초당 거래건수 초과) 등 rate limit 에러 감지 (overnight/route.ts와 동일 정책)
function isRateLimitError(msg: string): boolean {
  const m = String(msg).toLowerCase();
  return m.includes("egw00201") || m.includes("429") || m.includes("건수") || m.includes("초과") || m.includes("limit");
}

// 헬퍼: rate limit 시 backoff 후 1회 재시도 (전역 큐 + 재시도 이중 방어)
async function withRateLimitRetry<T>(fn: () => Promise<T>, retries = 1, backoffMs = 1500): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      const msg = String((e as Error)?.message || e);
      if (attempt < retries && isRateLimitError(msg)) {
        await new Promise((resolve) => setTimeout(resolve, backoffMs));
        continue;
      }
      throw e;
    }
  }
  throw lastErr;
}

function sanitizeError(msg: string | undefined | null): string {
  if (!msg) return "";
  let out = String(msg);
  const patterns: RegExp[] = [
    /(appkey["':=\s]+)[^\s"',}]+/gi,
    /(appsecret["':=\s]+)[^\s"',}]+/gi,
    /(secret["':=\s]+)[^\s"',}]+/gi,
    /(authorization["':=\s]+)[^\s"',}]+/gi,
    /(bearer\s+)[^\s"',}]+/gi,
  ];
  for (const re of patterns) out = out.replace(re, "$1***");
  return out;
}

interface ResolvedItem {
  symbol: string;
  name: string;
  classification: string;
  entryClose: number;
  nextOpen: number;
  // nextDate가 오늘이면 장중 캐시 stale 가능 → null로 미확정 처리, 내일 재조회 시 확정값 반환
  nextClose: number | null;
  openReturn: number;
  closeReturn: number | null;
  trend: TrendLabel | "pending";
  success: boolean;
  hardStopHit: boolean;
}

interface PendingItem {
  date: string;
  symbol: string;
  name: string;
  classification: string;
  entryClose: number;
}

function avg(nums: number[]): number {
  return nums.length === 0 ? 0 : Number((nums.reduce((a, b) => a + b, 0) / nums.length).toFixed(2));
}

function avgClose(items: ResolvedItem[]): number {
  const settled = items.filter((i) => i.closeReturn !== null).map((i) => i.closeReturn as number);
  return avg(settled);
}

function computeWinLossStats(items: ResolvedItem[]) {
  const count = items.length;
  if (count === 0) return { count: 0, winRate: 0, avgReturn: 0, maxReturn: 0, minReturn: 0, avgCloseReturn: 0 };
  const opens = items.map((i) => i.openReturn);
  const wins = items.filter((i) => i.success).length;
  return {
    count,
    winRate: Number(((wins / count) * 100).toFixed(2)),
    avgReturn: avg(opens),
    maxReturn: Number(Math.max(...opens).toFixed(2)),
    minReturn: Number(Math.min(...opens).toFixed(2)),
    avgCloseReturn: avgClose(items),
  };
}

function computeExcludeStats(items: ResolvedItem[]) {
  const count = items.length;
  if (count === 0) return { count: 0, avgReturn: 0, downRate: 0, avgCloseReturn: 0 };
  const opens = items.map((i) => i.openReturn);
  const downs = items.filter((i) => i.openReturn < 0).length;
  return {
    count,
    avgReturn: avg(opens),
    downRate: Number(((downs / count) * 100).toFixed(2)),
    avgCloseReturn: avgClose(items),
  };
}

/**
 * 오버나이트 스크리닝 백테스트 (조회 전용 — 어떤 주문/매매도 실행하지 않음).
 *
 * 저장된 일별 스크리닝 결과(items)를 로드해 각 종목의 "다음 거래일 시가"를
 * KIS 일봉에서 조회하고, 시가 매도 기준 성과를 집계한다.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const isDebug = searchParams.get("debug") === "true";
  const purgeDate = searchParams.get("purge"); // ?purge=YYYYMMDD → 해당 날짜 캐시+레코드 삭제 후 즉시 반환
  const singleDate = searchParams.get("date");
  const from = singleDate || searchParams.get("from");
  const to = singleDate || searchParams.get("to") || from;

  // ?purge=20260703 — 오염된 캐시 + 저장된 레코드를 한번에 무효화
  if (purgeDate) {
    const evicted = evictCacheByPattern(new RegExp(`daily_around_.*_${purgeDate}`));
    await deleteScreeningResult(purgeDate);
    return NextResponse.json({ ok: true, purged: purgeDate, cacheEvicted: evicted });
  }

  if (!from || !to) {
    return NextResponse.json(
      { ok: false, error: "from/to 또는 date 쿼리 파라미터가 필요합니다 (YYYYMMDD)" },
      { status: 400 }
    );
  }

  try {
    const byDate: { date: string; items: ResolvedItem[] }[] = [];
    const pending: PendingItem[] = [];
    const allResolved: { item: ResolvedItem }[] = [];

    // entryDate를 앵커로 페이지네이션한 일봉은 (symbol, date) 단위로 장기 캐시된다.
    const dailyCandlesCache = new Map<string, any[]>();
    const fetchDailyAround = async (symbol: string, date: string): Promise<any[]> => {
      const cacheKey = `${symbol}::${date}`;
      if (dailyCandlesCache.has(cacheKey)) return dailyCandlesCache.get(cacheKey)!;
      const candles = await withRateLimitRetry(() => getDomesticStockDailyAround(symbol, date));
      dailyCandlesCache.set(cacheKey, candles || []);
      return candles || [];
    };

    for (const date of iterateDateRange(from, to)) {
      const record = await getScreeningResult(date);
      if (!record) continue;

      // 미래 날짜(다음 거래일 시가가 아직 없는 당일 저장분)는 자연히 pending으로 빠진다.
      const resolvedForDate: ResolvedItem[] = [];

      for (const item of record.items) {
        // excludedNotice(신규상장 등 구조적 분석 불가)는 백테스트 집계에서 제외
        if (item.classification === "excludedNotice") continue;

        // 이미 확정값(다음 거래일 시가/종가/수익률)이 DB에 저장돼 있으면 재계산 없이 그대로 재사용
        // → KIS 재조회를 생략하고 저장된 확정값을 우선한다.
        if (
          item.nextOpen != null && item.nextClose != null &&
          item.openReturn != null && item.closeReturn != null
        ) {
          const reused: ResolvedItem = {
            symbol: item.symbol,
            name: item.name,
            classification: item.classification,
            entryClose: item.entryClose,
            nextOpen: item.nextOpen,
            nextClose: item.nextClose,
            openReturn: item.openReturn,
            closeReturn: item.closeReturn,
            trend: (item.trend as TrendLabel) ?? classifyTrend(item.openReturn, item.closeReturn),
            success: item.openReturn > 0,
            // nextLow는 별도 컬럼으로 저장하지 않으므로 재사용 경로에선 하드스톱 재판정 불가.
            // (표시용 플래그이며 승률/수익률 집계에는 사용되지 않음)
            hardStopHit: false,
          };
          resolvedForDate.push(reused);
          allResolved.push({ item: reused });
          continue;
        }

        let nextTrading: { nextOpen: number; nextClose: number; nextLow: number; nextDate: string } | null = null;
        let _rawCandlesForDebug: any[] = [];
        let dailyCandles: any[] = [];
        try {
          dailyCandles = await fetchDailyAround(item.symbol, date);
          _rawCandlesForDebug = dailyCandles;
          nextTrading = findNextTradingDay(dailyCandles, date);
        } catch (e: any) {
          console.warn(`[Backtest API] Failed to fetch daily for ${item.name}(${item.symbol}):`, e?.message || e);
          if (isDebug) throw e;
        }

        const _debugInfo = isDebug ? (() => {
          const entryIdx = _rawCandlesForDebug.findIndex((c: any) => String(c.stck_bsop_date) === date);
          return {
            totalCandles: _rawCandlesForDebug.length,
            entryIdx,
            recentDates: _rawCandlesForDebug.slice(0, 6).map((c: any) => c.stck_bsop_date),
            surrounding: _rawCandlesForDebug.slice(Math.max(0, entryIdx - 1), entryIdx + 3).map((c: any) => ({
              date: c.stck_bsop_date,
              open: c.stck_oprc,
              close: c.stck_clpr,
            })),
          };
        })() : undefined;

        if (!nextTrading) {
          pending.push({
            date,
            symbol: item.symbol,
            name: item.name,
            classification: item.classification,
            entryClose: item.entryClose,
          });
          continue;
        }

        // dailyCandles에서 수정주가를 가져오지만, 실제 수익률 산출은 "원주가(실거래가)" 기준이어야 하므로,
        // entryDate(진입일)와 nextTrading.nextDate(청산일) 각각에 대해 1일 단독 KIS API를 호출하여 원주가를 확보한다.
        let rawEntryClose = item.entryClose;
        let rawNextOpen = nextTrading.nextOpen;
        let rawNextClose = nextTrading.nextClose;
        let rawNextLow = nextTrading.nextLow;

        try {
          const entryRawCandle = await withRateLimitRetry(() => getDomesticStockDailyRawPrice(item.symbol, date));
          if (entryRawCandle) rawEntryClose = Number(entryRawCandle.stck_clpr || 0);

          const nextRawCandle = await withRateLimitRetry(() => getDomesticStockDailyRawPrice(item.symbol, nextTrading.nextDate));
          if (nextRawCandle) {
            rawNextOpen = Number(nextRawCandle.stck_oprc || 0);
            rawNextClose = Number(nextRawCandle.stck_clpr || 0);
            rawNextLow = Number(nextRawCandle.stck_lwpr || 0);
          }
        } catch (e: any) {
          console.warn(`[Backtest API] Failed to fetch raw price for ${item.name}(${item.symbol}):`, e?.message || e);
        }

        const entryCloseToUse = rawEntryClose > 0 ? rawEntryClose : item.entryClose;
        const openReturn = entryCloseToUse > 0 ? ((rawNextOpen - entryCloseToUse) / entryCloseToUse) * 100 : 0;

        const nextCloseToUse = rawNextClose > 0 ? rawNextClose : null;
        const closeReturn = nextCloseToUse !== null && entryCloseToUse > 0
          ? ((nextCloseToUse - entryCloseToUse) / entryCloseToUse) * 100
          : null;

        const resolved: ResolvedItem = {
          symbol: item.symbol,
          name: item.name,
          classification: item.classification,
          entryClose: entryCloseToUse,
          nextOpen: rawNextOpen,
          nextClose: nextCloseToUse,
          openReturn: Number(openReturn.toFixed(2)),
          closeReturn: closeReturn !== null ? Number(closeReturn.toFixed(2)) : null,
          trend: closeReturn !== null ? classifyTrend(openReturn, closeReturn) : "pending",
          success: openReturn > 0,
          hardStopHit: entryCloseToUse > 0 && rawNextLow <= entryCloseToUse * 0.95,
          ...(_debugInfo ? { _debug: _debugInfo } : {}),
        } as ResolvedItem;
        resolvedForDate.push(resolved);
        allResolved.push({ item: resolved });

        // 다음 거래일 종가가 확정된 경우에만 DB에 확정값을 채운다.
        // updateScreeningItemBacktest는 next_close가 비어있는(NULL) 행만 갱신하므로
        // 이미 채워진 확정값은 덮어쓰지 않는다.
        if (resolved.nextClose !== null && resolved.closeReturn !== null) {
          await updateScreeningItemBacktest(date, item.symbol, {
            nextOpen: resolved.nextOpen,
            nextClose: resolved.nextClose,
            openReturn: resolved.openReturn,
            closeReturn: resolved.closeReturn,
            trend: resolved.trend as string,
          });
        }
      }

      if (resolvedForDate.length > 0) {
        byDate.push({ date, items: resolvedForDate });
      }
    }

    const normalItems = allResolved.filter((r) => r.item.classification === "normal").map((r) => r.item);
    const aggressiveItems = allResolved.filter((r) => r.item.classification === "aggressive").map((r) => r.item);
    const excludeItems = allResolved.filter((r) => r.item.classification === "exclude").map((r) => r.item);

    const pickedItems = [...normalItems, ...aggressiveItems];
    const pickedWentUp = pickedItems.length > 0
      ? Number(((pickedItems.filter((i) => i.success).length / pickedItems.length) * 100).toFixed(2))
      : 0;
    const excludedWentDown = excludeItems.length > 0
      ? Number(((excludeItems.filter((i) => i.openReturn < 0).length / excludeItems.length) * 100).toFixed(2))
      : 0;

    return NextResponse.json({
      ok: true,
      period: { from, to },
      summary: {
        normal: computeWinLossStats(normalItems),
        aggressive: computeWinLossStats(aggressiveItems),
        exclude: computeExcludeStats(excludeItems),
      },
      verdict: {
        pickedWentUp,
        excludedWentDown,
      },
      byDate,
      pending,
    });
  } catch (err: any) {
    console.error("[Backtest API] Critical error:", err?.stack || err);
    return NextResponse.json(
      {
        ok: false,
        error: sanitizeError(err?.message || String(err)),
        diagnostics: {},
      },
      { status: 500 }
    );
  }
}
