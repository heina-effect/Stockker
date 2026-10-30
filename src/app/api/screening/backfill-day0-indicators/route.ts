import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { kisConfig } from "@/server/kis/config";
import { getDomesticStockDailyEndingAt } from "@/server/kis/rest-client";
import { getSupabaseAdmin } from "@/lib/supabase/client";
import { computeIndicatorSeries } from "@/server/screening/indicators";
import { fetchAllRows } from "@/server/screening/paginate";
import { withRateLimitRetry } from "@/server/screening/rate-limit-retry";
import { isQuantSignal } from "@/server/screening/quant-signal";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * day0 지표 백필(2026-10-30, 1회성) — 10/8 이후 발견 건의 day0 지표가 다음 날 재계산에서 null로
 * 덮인 것(indicators.ts 입력 부족 가드 참고)을, 스크리닝과 같은 방식으로 다시 계산해 채운다.
 *
 * 스크리닝과 동일한 계산 경로:
 *   - KIS 일봉 수정주가(FID_ORG_ADJ_PRC=0), 130봉 목표·최대 3페이지(getDomesticStockDaily와 같은 조건)
 *   - computeIndicatorSeries에 종가·거래량만 전달(고가·저가 없음 → 스토캐스틱·윌리엄스는 null)
 *   - 발견일까지의 봉만으로 계산한 시계열의 마지막 값 = day0 지표
 *
 * 안전장치:
 *   - UPDATE는 지표 컬럼만. 가격(open/high/low/close/volume)·is_halted·days_after는 쓰지 않는다.
 *   - 계산값이 null인 지표는 쓰지 않는다(기존 값 유지).
 *   - 대조군: 아직 지표가 남아 있는 같은 기간 day0 행을 같은 방식으로 재계산해 저장값과 비교한다.
 *     종가 파생 지표(RSI·MACD·볼린저·MA)는 소수점 4자리까지 일치해야 하고, 하나라도 다르면 아무것도
 *     쓰지 않고 중단한다(계산 경로가 스크리닝과 다르다는 뜻). 거래량 파생 지표(거래량비)는 차이를
 *     보고만 한다 — 저장값은 스크리닝 시점(장중) 거래량, 재계산은 시간외 포함 확정 거래량이라
 *     원인이 알려진 차이이고 확정값이 더 정확하다(2026-10-30 dry-run에서 확인).
 *   - KIS 발견일 종가가 저장된 day0 종가와 다르면(수정주가 반영 등) 그 행은 쓰지 않는다.
 *   - apply 시 대상 행 전체를 JSON으로 먼저 덤프하고, 쓰기 직전·직후 가격 컬럼을 스냅샷과 비교한다.
 *
 * body: { apply?: boolean (기본 false = dry-run), from?: "YYYYMMDD" (기본 20261006) }
 */

const INDICATOR_COLUMNS = [
  "rsi14", "macd", "macd_signal", "macd_hist", "bb_upper", "bb_mid", "bb_lower", "bb_pct_b",
  "ma5", "ma20", "ma60", "vol_ratio_5", "vol_ratio_20", "stoch_slow_k", "stoch_slow_d", "williams_r",
] as const;
const PRICE_COLUMNS = ["open", "high", "low", "close", "volume", "is_halted", "days_after", "return_from_entry"] as const;

// 대조군 비교 대상 — 종가 파생(정확히 일치해야 함) / 거래량 파생(차이 보고만)
const CLOSE_DERIVED = ["rsi14", "macd", "macd_signal", "macd_hist", "bb_upper", "bb_mid", "bb_lower", "bb_pct_b", "ma5", "ma20", "ma60"] as const;
const VOLUME_DERIVED = ["vol_ratio_5", "vol_ratio_20"] as const;

type Row = Record<string, any>;

const IND_KEY: Record<(typeof INDICATOR_COLUMNS)[number], string> = {
  rsi14: "rsi14", macd: "macd", macd_signal: "macdSignal", macd_hist: "macdHist",
  bb_upper: "bbUpper", bb_mid: "bbMid", bb_lower: "bbLower", bb_pct_b: "bbPctB",
  ma5: "ma5", ma20: "ma20", ma60: "ma60", vol_ratio_5: "volRatio5", vol_ratio_20: "volRatio20",
  stoch_slow_k: "stochSlowK", stoch_slow_d: "stochSlowD", williams_r: "williamsR",
};

function samePrices(a: Row, b: Row): boolean {
  return PRICE_COLUMNS.every((c) => String(a[c] ?? "") === String(b[c] ?? ""));
}

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const isAuthorized = kisConfig.cronSecret
    ? authHeader === `Bearer ${kisConfig.cronSecret}`
    : process.env.NODE_ENV === "development";
  if (!isAuthorized) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  let body: { apply?: boolean; from?: string } = {};
  try {
    const text = await request.text();
    if (text) body = JSON.parse(text);
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }
  const apply = body.apply === true;
  const from = body.from ?? "20261006";

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase 미구성" }, { status: 500 });

  const day0Rows = await fetchAllRows<Row>((f, t) =>
    supabase
      .from("stock_trajectory")
      .select("*")
      .eq("days_after", 0)
      .gte("discovery_date", from)
      .order("symbol", { ascending: true })
      .order("discovery_date", { ascending: true })
      .range(f, t)
  );
  const targets = day0Rows.filter((r) => r.rsi14 == null);
  const controls = day0Rows.filter((r) => r.rsi14 != null);

  let backupPath: string | null = null;
  if (apply) {
    const dir = path.join(os.homedir(), "stockker-logs");
    fs.mkdirSync(dir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+/, "");
    backupPath = path.join(dir, `backup-day0-indicators-${stamp}.json`);
    fs.writeFileSync(backupPath, JSON.stringify(targets, null, 2));
  }

  // 종목별 1회 수집 — 그 종목의 가장 늦은 발견일을 끝으로 잡으면 이전 발견일들도 같은 봉에 포함된다.
  const bySymbol = new Map<string, Row[]>();
  for (const r of [...targets, ...controls]) {
    const list = bySymbol.get(r.symbol) ?? [];
    list.push(r);
    bySymbol.set(r.symbol, list);
  }

  type Computed = { row: Row; indicators: Record<string, number | null> | null; reason?: string; kisClose?: number };
  const computed: Computed[] = [];
  let kisFetches = 0;
  for (const [symbol, rows] of bySymbol) {
    const end = rows.map((r) => r.discovery_date).sort().pop()!;
    let candles: any[];
    try {
      candles = await withRateLimitRetry(() => getDomesticStockDailyEndingAt(symbol, end));
      kisFetches++;
    } catch (e: any) {
      for (const row of rows) computed.push({ row, indicators: null, reason: `KIS 조회 실패: ${String(e?.message || e).slice(0, 120)}` });
      continue;
    }
    const ascending = [...candles].reverse();
    for (const row of rows) {
      const idx = ascending.findIndex((c) => c.stck_bsop_date === row.discovery_date);
      if (idx < 0) {
        computed.push({ row, indicators: null, reason: "KIS 일봉에 발견일 없음" });
        continue;
      }
      if (idx + 1 < 15) {
        computed.push({ row, indicators: null, reason: `발견일까지 봉 ${idx + 1}개 — RSI(14) 입력 부족` });
        continue;
      }
      const kisClose = Number(ascending[idx].stck_clpr || 0);
      if (kisClose !== Number(row.close)) {
        computed.push({ row, indicators: null, kisClose, reason: `KIS 종가 ${kisClose} ≠ 저장 종가 ${row.close} (수정주가 반영 가능성)` });
        continue;
      }
      const series = computeIndicatorSeries(
        ascending.slice(0, idx + 1).map((c) => ({
          tradeDate: c.stck_bsop_date || "",
          close: Number(c.stck_clpr || 0),
          volume: Number(c.acml_vol || 0),
        }))
      );
      const last = series[series.length - 1] as unknown as Record<string, number | null>;
      const indicators: Record<string, number | null> = {};
      for (const col of INDICATOR_COLUMNS) indicators[col] = last[IND_KEY[col]] ?? null;
      computed.push({ row, indicators, kisClose });
    }
  }

  // 대조군 비교 — 종가 파생 지표가 하나라도 다르면 쓰지 않고 중단. 거래량 파생은 차이만 보고.
  const controlReport = computed
    .filter((c) => c.row.rsi14 != null)
    .map((c) => {
      const closeMismatch = c.indicators
        ? CLOSE_DERIVED.filter((col) => Number(c.row[col] ?? NaN) !== Number(c.indicators![col] ?? NaN))
            .map((col) => ({ col, stored: c.row[col], recomputed: c.indicators![col] }))
        : [];
      const volumeDiff = c.indicators
        ? VOLUME_DERIVED.map((col) => ({ col, stored: c.row[col], recomputed: c.indicators![col] }))
        : [];
      return { symbol: c.row.symbol, discoveryDate: c.row.discovery_date, ok: !!c.indicators && closeMismatch.length === 0, closeMismatch, volumeDiff, reason: c.reason ?? null };
    });
  const controlMismatch = controlReport.filter((c) => !c.ok);
  const halted = controlReport.length === 0 || controlMismatch.length > 0;

  const targetComputed = computed.filter((c) => c.row.rsi14 == null);
  const results: any[] = [];
  let written = 0;
  let skippedPriceMismatch = 0;
  let postWriteMismatch = 0;
  for (const c of targetComputed) {
    const base = { symbol: c.row.symbol, name: c.row.name, discoveryDate: c.row.discovery_date };
    if (!c.indicators) {
      results.push({ ...base, status: "failed", reason: c.reason });
      continue;
    }
    const update: Record<string, number> = {};
    for (const col of INDICATOR_COLUMNS) if (c.indicators[col] != null) update[col] = c.indicators[col] as number;
    const quant = isQuantSignal(c.indicators.rsi14, c.indicators.vol_ratio_20);
    const before = Object.fromEntries(PRICE_COLUMNS.map((col) => [col, c.row[col]]));
    const plannedAfter = { ...before }; // 가격 컬럼은 쓰지 않으므로 계획상 동일
    const entry = {
      ...base,
      before: { prices: before, rsi14: c.row.rsi14, vol_ratio_20: c.row.vol_ratio_20 },
      after: { prices: plannedAfter, rsi14: update.rsi14 ?? null, vol_ratio_20: update.vol_ratio_20 ?? null },
      quantSignal: quant,
    };

    if (!apply || halted) {
      results.push({ ...entry, status: "dry-run" });
      continue;
    }

    const key = (q: any) =>
      q.eq("symbol", c.row.symbol).eq("discovery_date", c.row.discovery_date).eq("trade_date", c.row.trade_date).eq("days_after", 0);
    const { data: fresh, error: readErr } = await key(supabase.from("stock_trajectory").select("*")).single();
    if (readErr || !fresh || !samePrices(fresh, c.row)) {
      skippedPriceMismatch++;
      results.push({ ...entry, status: "skipped", reason: readErr ? readErr.message : "쓰기 직전 가격 컬럼이 백업과 다름" });
      continue;
    }
    const { error: updErr } = await key(supabase.from("stock_trajectory").update(update));
    if (updErr) {
      results.push({ ...entry, status: "failed", reason: updErr.message });
      continue;
    }
    const { data: after } = await key(supabase.from("stock_trajectory").select("*")).single();
    if (!after || !samePrices(after, c.row)) postWriteMismatch++;
    written++;
    results.push({ ...entry, status: "written", afterRead: after ? { rsi14: after.rsi14, vol_ratio_20: after.vol_ratio_20 } : null });
  }

  return NextResponse.json({
    ok: true,
    mode: apply ? (halted ? "halted" : "apply") : "dry-run",
    haltedReason: halted ? (controlReport.length === 0 ? "대조군 없음" : "대조군 불일치 — 계산 경로가 스크리닝과 다름") : null,
    backupPath,
    counts: {
      targets: targets.length,
      controls: controls.length,
      kisFetches,
      computedOk: targetComputed.filter((c) => c.indicators).length,
      failed: results.filter((r) => r.status === "failed").length,
      written,
      skippedPriceMismatch,
      postWriteMismatch,
      quantSignalAfter: results.filter((r) => r.quantSignal).length,
    },
    controlReport,
    results,
  });
}
