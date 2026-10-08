import { NextRequest, NextResponse } from "next/server";

import { kisConfig } from "@/server/kis/config";
import { getSupabaseAdmin } from "@/lib/supabase/client";
import { fetchAllRows } from "@/server/screening/paginate";
import { isQuantSignal } from "@/server/screening/quant-signal";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface BackfillQuantSignalBody {
  recalculate?: boolean;
}

/**
 * 과거 overnight_screening_items에 대해 quant_signal(퀀트 진입 조건)을 소급 계산한다.
 *
 * 로직:
 *   1. overnight_screening_items의 rsi14이 NULL인 행을 찾는다(recalculate=true면 전체 행 대상).
 *   2. stock_trajectory에서 같은 (symbol, discovery_date=screening date, days_after=0)의
 *      rsi14를 가져와 overnight_screening_items.rsi14에 채운다.
 *   3. volume_ratio는 overnight_screening_items에 이미 있는 값을 사용한다.
 *   4. quant_signal 판정은 `@/server/screening/quant-signal`의 `isQuantSignal`(=
 *      overnight/route.ts의 일일 스크리닝과 동일한 QUANT_SIGNAL_CRITERIA)을 그대로 재사용한다.
 *      과거 이 라우트가 자체적으로 하드코딩했던 RSI 55~65 임계값(2026-09-01, EMA 평활 기준
 *      분석)은 2026-09-03 RSI 평활 방식이 Wilder로 교체되며 폐기됐다 — 두 라우트가 서로 다른
 *      기준을 쓰면 이 라우트를 재실행했을 때 일일 스크리닝과 다른 quant_signal 값으로 덮어써
 *      데이터가 어긋나는 문제가 있어 공용 상수로 통합했다(2026-09-10).
 *
 * recalculate=true는 stock_trajectory의 rsi14 계산식이 바뀌었을 때(예: RSI 평활 방식 변경)
 * 이미 채워진 행도 최신 값으로 다시 동기화하기 위한 용도다(기본값 false는 NULL만 채움,
 * backfill-indicators의 recalculate 옵션과 동일한 정책).
 */
export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const isAuthorized = kisConfig.cronSecret
    ? authHeader === `Bearer ${kisConfig.cronSecret}`
    : process.env.NODE_ENV === "development";

  if (!isAuthorized) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  let body: BackfillQuantSignalBody = {};
  try {
    const text = await request.text();
    if (text) body = JSON.parse(text);
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }
  const recalculate = body.recalculate === true;

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "Supabase 미구성" }, { status: 500 });
  }

  // 1. 대상 조회: 기본은 rsi14이 NULL인 행만, recalculate=true면 전체 행
  let items: { date: string; symbol: string; volume_ratio: number | null }[];
  try {
    items = await fetchAllRows<{ date: string; symbol: string; volume_ratio: number | null }>((from, to) => {
      let q = supabase
        .from("overnight_screening_items")
        .select("date,symbol,volume_ratio")
        .order("date", { ascending: true })
        .order("symbol", { ascending: true });
      if (!recalculate) q = q.is("rsi14", null);
      return q.range(from, to);
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 });
  }

  if (items.length === 0) {
    return NextResponse.json({
      ok: true,
      message: recalculate ? "대상 없음 (overnight_screening_items가 비어있음)" : "소급 대상 없음 (rsi14이 모두 채워져 있음)",
      processed: 0,
    });
  }

  console.log(`[Backfill Quant Signal] 소급 대상: ${items.length}건`);

  // 2. stock_trajectory에서 days_after=0 행의 rsi14를 일괄 조회
  //    (symbol, discovery_date) 조합이 screening date와 매칭됨
  //    - stock_trajectory의 discovery_date는 YYYY-MM-DD 형식
  //    - overnight_screening_items의 date는 YYYYMMDD 형식 → 변환 필요
  const symbolSet = [...new Set(items.map((i) => i.symbol))];

  let trajectoryRows: { symbol: string; discovery_date: string; rsi14: number | null }[];
  try {
    trajectoryRows = await fetchAllRows<{ symbol: string; discovery_date: string; rsi14: number | null }>(
      (from, to) =>
        supabase
          .from("stock_trajectory")
          .select("symbol,discovery_date,rsi14")
          .eq("days_after", 0)
          .in("symbol", symbolSet)
          .order("symbol", { ascending: true })
          .order("discovery_date", { ascending: true })
          .range(from, to)
    );
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 });
  }

  // 빠른 조회를 위한 Map: "symbol::YYYYMMDD" -> rsi14
  const trajectoryMap = new Map<string, number | null>();
  for (const row of trajectoryRows) {
    const dateCompact = row.discovery_date.replace(/-/g, "");
    trajectoryMap.set(`${row.symbol}::${dateCompact}`, row.rsi14);
  }

  // 3. 소급 업데이트
  let updated = 0;
  let skipped = 0;
  const errors: { date: string; symbol: string; reason: string }[] = [];

  for (const item of items) {
    const key = `${item.symbol}::${item.date}`;
    const rsi14 = trajectoryMap.get(key);

    if (rsi14 === undefined) {
      // stock_trajectory에 해당 (symbol, discovery_date, days_after=0) 행이 없음
      skipped++;
      continue;
    }

    const volumeRatio = item.volume_ratio != null ? Number(item.volume_ratio) : null;
    const quantSignal = isQuantSignal(rsi14, volumeRatio);

    try {
      const { error } = await supabase
        .from("overnight_screening_items")
        .update({ rsi14, quant_signal: quantSignal })
        .eq("date", item.date)
        .eq("symbol", item.symbol);

      if (error) throw error;
      updated++;
    } catch (e: any) {
      errors.push({ date: item.date, symbol: item.symbol, reason: e?.message || String(e) });
    }

    if (updated % 50 === 0 && updated > 0) {
      console.log(`[Backfill Quant Signal] ${updated}건 업데이트 완료`);
    }
  }

  console.log(`[Backfill Quant Signal] 완료: updated=${updated}, skipped=${skipped}, errors=${errors.length}`);

  return NextResponse.json({
    ok: true,
    totalTargets: items.length,
    updated,
    skipped,
    errors: errors.slice(0, 20), // 에러는 최대 20건만 응답에 포함
  });
}
