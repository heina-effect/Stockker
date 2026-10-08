import { NextRequest, NextResponse } from "next/server";

import { kisConfig } from "@/server/kis/config";
import { getDomesticStockDailyAround } from "@/server/kis/rest-client";
import { getSupabaseAdmin } from "@/lib/supabase/client";
import { withRateLimitRetry } from "@/server/screening/rate-limit-retry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

// YYYYMMDD + days → YYYYMMDD (KST 기준, UTC 자정 연산으로 충분)
function addDaysToYYYYMMDD(dateStr: string, days: number): string {
  const y = Number(dateStr.slice(0, 4));
  const m = Number(dateStr.slice(4, 6)) - 1;
  const d = Number(dateStr.slice(6, 8));
  const dt = new Date(Date.UTC(y, m, d + days));
  const yyyy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yyyy}${mm}${dd}`;
}

interface DiscoveryRow {
  symbol: string;
  name: string;
  date: string;
}

interface SkippedItem {
  symbol: string;
  discovery_date: string;
  reason: string;
}

interface BackfillRequestBody {
  from?: string;
  to?: string;
  symbols?: string[];
}

/**
 * 발굴 종목 궤적(trajectory) 소급 수집 (관리자/내부 호출용, 조회 전용 — 매매 실행 없음).
 *
 * overnight_screening_items에서 발굴된 (symbol, discovery_date) 조합마다 발굴일 기준
 * -60거래일 ~ +30거래일치 일봉을 KIS에서 조회해 stock_trajectory에 upsert한다. 발굴일
 * 이전 구간(days_after < 0, is_pre_discovery = true)은 RSI(14)/MACD(26+9)/MA60 등
 * 기술지표 계산에 필요한 히스토리 확보 목적이며 실제 보유 구간이 아니다.
 */
export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const isAuthorized = kisConfig.cronSecret
    ? authHeader === `Bearer ${kisConfig.cronSecret}`
    : process.env.NODE_ENV === "development";

  if (!isAuthorized) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  let body: BackfillRequestBody = {};
  try {
    const text = await request.text();
    if (text) body = JSON.parse(text);
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "Supabase 미구성" }, { status: 500 });
  }

  let query = supabase.from("overnight_screening_items").select("symbol,name,date");
  if (body.from) query = query.gte("date", body.from);
  if (body.to) query = query.lte("date", body.to);
  if (body.symbols && body.symbols.length > 0) query = query.in("symbol", body.symbols);

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ ok: false, error: sanitizeError(error.message) }, { status: 500 });
  }

  const seen = new Set<string>();
  const discoveries: DiscoveryRow[] = [];
  for (const row of (data || []) as { symbol: string; name: string; date: string }[]) {
    const key = `${row.symbol}::${row.date}`;
    if (seen.has(key)) continue;
    seen.add(key);
    discoveries.push({ symbol: row.symbol, name: row.name, date: row.date });
  }

  const skipped: SkippedItem[] = [];
  let processed = 0;
  let rowsInserted = 0;

  for (const disc of discoveries) {
    processed++;
    try {
      const anchorDate = addDaysToYYYYMMDD(disc.date, 45);
      const candles = await withRateLimitRetry(() => getDomesticStockDailyAround(disc.symbol, anchorDate));

      const allCandles = (candles || [])
        .slice()
        .sort((a: any, b: any) => String(a.stck_bsop_date).localeCompare(String(b.stck_bsop_date)));

      if (allCandles.length === 0) {
        skipped.push({ symbol: disc.symbol, discovery_date: disc.date, reason: "조회 범위 내 일봉 데이터 없음" });
        continue;
      }

      const discIndex = allCandles.findIndex((c: any) => String(c.stck_bsop_date) === disc.date);
      const baseCandle = discIndex >= 0 ? allCandles[discIndex] : null;
      const basePrice = Number(baseCandle?.stck_clpr || 0);
      if (!baseCandle || basePrice <= 0) {
        skipped.push({ symbol: disc.symbol, discovery_date: disc.date, reason: "발굴일 종가 캔들 없음" });
        continue;
      }

      // 발굴일 -60거래일 ~ +30거래일 (지표 계산용 히스토리 + 기존 추적 구간)
      const startIdx = Math.max(0, discIndex - 60);
      const endIdx = Math.min(allCandles.length, discIndex + 31);

      const rows = [];
      for (let i = startIdx; i < endIdx; i++) {
        const c = allCandles[i];
        const close = Number(c.stck_clpr || 0);
        const daysAfter = i - discIndex;
        rows.push({
          symbol: disc.symbol,
          name: disc.name,
          discovery_date: disc.date,
          trade_date: String(c.stck_bsop_date),
          days_after: daysAfter,
          open: Number(c.stck_oprc || 0),
          high: Number(c.stck_hgpr || 0),
          low: Number(c.stck_lwpr || 0),
          close,
          volume: Number(c.acml_vol || 0),
          return_from_entry: Number((((close - basePrice) / basePrice) * 100).toFixed(2)),
          is_pre_discovery: daysAfter < 0,
        });
      }

      const { error: upsertErr } = await supabase
        .from("stock_trajectory")
        .upsert(rows, { onConflict: "symbol,discovery_date,trade_date" });

      if (upsertErr) throw upsertErr;
      rowsInserted += rows.length;
    } catch (e: any) {
      skipped.push({ symbol: disc.symbol, discovery_date: disc.date, reason: sanitizeError(e?.message || String(e)) });
    }

    if (processed % 10 === 0 || processed === discoveries.length) {
      console.log(`[Trajectory Backfill] ${processed}/${discoveries.length} processed`);
    }
  }

  return NextResponse.json({
    ok: true,
    processed,
    rowsInserted,
    skipped,
  });
}
