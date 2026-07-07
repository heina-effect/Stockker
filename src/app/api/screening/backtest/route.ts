import { NextRequest, NextResponse } from "next/server";

import { getDomesticStockDailyAround } from "@/server/kis/rest-client";
import { getScreeningResult, formatKSTDateCompact } from "@/server/screening/storage";
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
  const singleDate = searchParams.get("date");
  const from = singleDate || searchParams.get("from");
  const to = singleDate || searchParams.get("to") || from;

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

        let nextTrading: { nextOpen: number; nextClose: number; nextLow: number; nextDate: string } | null = null;
        try {
          const dailyCandles = await fetchDailyAround(item.symbol, date);
          nextTrading = findNextTradingDay(dailyCandles, date);
        } catch (e: any) {
          console.warn(`[Backtest API] Failed to fetch daily for ${item.name}(${item.symbol}):`, e?.message || e);
          if (isDebug) throw e;
        }

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

        const openReturn = item.entryClose > 0 ? ((nextTrading.nextOpen - item.entryClose) / item.entryClose) * 100 : 0;

        // nextTrading은 findNextTradingDay가 같은 일봉 배열에서 추출한 nextDate 당일의 OHLCV.
        // anchorDate + 14일 캐시는 anchor > 오늘이면 일 단위로 갱신되므로 stale 없음.
        const nextClose = nextTrading.nextClose > 0 ? nextTrading.nextClose : null;
        const closeReturn = nextClose !== null && item.entryClose > 0
          ? ((nextClose - item.entryClose) / item.entryClose) * 100
          : null;

        const resolved: ResolvedItem = {
          symbol: item.symbol,
          name: item.name,
          classification: item.classification,
          entryClose: item.entryClose,
          nextOpen: nextTrading.nextOpen,
          nextClose,
          openReturn: Number(openReturn.toFixed(2)),
          closeReturn: closeReturn !== null ? Number(closeReturn.toFixed(2)) : null,
          trend: closeReturn !== null ? classifyTrend(openReturn, closeReturn) : "pending",
          success: openReturn > 0,
          hardStopHit: item.entryClose > 0 && nextTrading.nextLow <= item.entryClose * 0.95,
        };
        resolvedForDate.push(resolved);
        allResolved.push({ item: resolved });
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
