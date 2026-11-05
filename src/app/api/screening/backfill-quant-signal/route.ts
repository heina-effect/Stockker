import { NextRequest, NextResponse } from "next/server";

import { kisConfig } from "@/server/kis/config";
import { getSupabaseAdmin } from "@/lib/supabase/client";
import { fetchAllRows } from "@/server/screening/paginate";
import { isQuantBackfillConfirmed, planQuantSignalBackfill, type QuantBackfillItem } from "@/server/screening/quant-signal-backfill";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface BackfillQuantSignalBody {
  recalculate?: boolean;
  apply?: boolean;
  confirmTargetCount?: number;
}

/**
 * 과거 overnight_screening_items에 대해 quant_signal(퀀트 진입 조건)을 소급 계산한다.
 *
 * 실행 가드(2026-11-04) — 기본은 dry-run 이다. 대상 행 수와 바뀌는 quant_signal·rsi14 건수만 보고하고
 * 쓰지 않는다. 쓰려면 apply=true 와 함께 보고받은 대상 행 수를 confirmTargetCount 로 돌려줘야 한다.
 * 이유: 2026-10-14 recalculate=true 실행이 468행의 quant_signal(false→true 32건)과 rsi14 를 당시 저장
 * 지표로 덮었고, 그때 day0 지표가 비어 있던 34건은 rsi14 가 NULL 로 지워졌다. 그 뒤로 스크리닝 시점 판정이
 * 컬럼에 남지 않아 A트랙 표본의 선정 규칙이 불분명해졌다(docs/release/known-issues.md "quant_signal 컬럼은
 * 스크리닝 당시 판정이 아니다"). 기본 옵션도 rsi14 NULL 행을 대상으로 잡으므로 같은 덮어쓰기를 반복할 수 있다.
 * 재계산 전 값은 overnight_screening_items_backup_20261014 에 있다.
 *
 * 로직:
 *   1. overnight_screening_items의 rsi14이 NULL인 행을 찾는다(recalculate=true면 전체 행 대상).
 *   2. stock_trajectory에서 같은 (symbol, discovery_date=screening date, days_after=0)의
 *      rsi14를 가져와 overnight_screening_items.rsi14에 채운다.
 *   3. quant_signal 판정의 거래량 비율도 stock_trajectory의 vol_ratio_20(당일 포함 20일 평균
 *      기준, indicators.ts 산출)을 쓴다 — overnight_screening_items.volume_ratio(당일 제외
 *      기준, 화면 표시용)는 궤적 추적 화면(tracking/route.ts) A트랙이 쓰는 vol_ratio_20과 정의가
 *      달라 여기서는 사용하지 않는다(overnight_screening_items.volume_ratio 컬럼 자체는 변경
 *      없이 화면 표시용으로만 유지).
 *   4. quant_signal 판정은 `@/server/screening/quant-signal`의 `isQuantSignal`(=
 *      overnight/route.ts의 일일 스크리닝과 동일한 QUANT_SIGNAL_CRITERIA)을 그대로 재사용한다.
 *      과거 이 라우트가 자체적으로 하드코딩했던 RSI 55~65 임계값(2026-09-01, EMA 평활 기준
 *      분석)은 2026-09-03 RSI 평활 방식이 Wilder로 교체되며 폐기됐다 — 두 라우트가 서로 다른
 *      기준을 쓰면 이 라우트를 재실행했을 때 일일 스크리닝과 다른 quant_signal 값으로 덮어써
 *      데이터가 어긋나는 문제가 있어 공용 상수로 통합했다(2026-09-10).
 *
 * 주의: tracking/route.ts의 A트랙(퀀트 신호 트래커)은 이 라우트가 채우는 quant_signal 컬럼을
 * 읽지 않는다. stock_trajectory day0의 rsi14·vol_ratio_20에 같은 범위를 직접 걸어 고른다.
 * 10/14 재실행으로 그때까지의 행은 저장 지표 재계산값이고, 10/15 이후 행만 일일 스크리닝의 실시간
 * 판정이다. 어느 쪽도 A트랙 집합과 같다는 보장은 없다.
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
  let items: QuantBackfillItem[];
  try {
    items = await fetchAllRows<QuantBackfillItem>((from, to) => {
      let q = supabase
        .from("overnight_screening_items")
        .select("date,symbol,rsi14,quant_signal")
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

  let trajectoryRows: { symbol: string; discovery_date: string; rsi14: number | null; vol_ratio_20: number | null }[];
  try {
    trajectoryRows = await fetchAllRows<{ symbol: string; discovery_date: string; rsi14: number | null; vol_ratio_20: number | null }>(
      (from, to) =>
        supabase
          .from("stock_trajectory")
          .select("symbol,discovery_date,rsi14,vol_ratio_20")
          .eq("days_after", 0)
          .in("symbol", symbolSet)
          .order("symbol", { ascending: true })
          .order("discovery_date", { ascending: true })
          .range(from, to)
    );
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 });
  }

  // 빠른 조회를 위한 Map: "symbol::YYYYMMDD" -> { rsi14, vol_ratio_20 }
  const trajectoryMap = new Map<string, { rsi14: number | null; vol_ratio_20: number | null }>();
  for (const row of trajectoryRows) {
    const dateCompact = row.discovery_date.replace(/-/g, "");
    trajectoryMap.set(`${row.symbol}::${dateCompact}`, { rsi14: row.rsi14, vol_ratio_20: row.vol_ratio_20 });
  }

  // 3. 쓰기 전 보고 — 확인 없이는 여기서 끝난다
  const plan = planQuantSignalBackfill(items, trajectoryMap);
  const report = {
    recalculate,
    totalTargets: plan.totalTargets,
    skipped: plan.skipped,
    quantSignalChanged: plan.quantSignalChanged,
    falseToTrue: plan.falseToTrue,
    trueToFalse: plan.trueToFalse,
    rsi14Changed: plan.rsi14Changed,
    rsi14ToNull: plan.rsi14ToNull,
  };
  if (!isQuantBackfillConfirmed(body, plan.totalTargets)) {
    return NextResponse.json({
      ok: true,
      dryRun: true,
      ...report,
      message: `쓰지 않았습니다. 쓰려면 apply=true, confirmTargetCount=${plan.totalTargets} 로 다시 호출하세요.`,
    });
  }

  // 4. 소급 업데이트
  let updated = 0;
  const errors: { date: string; symbol: string; reason: string }[] = [];

  for (const { date, symbol, rsi14, quantSignal } of plan.updates) {
    try {
      const { error } = await supabase
        .from("overnight_screening_items")
        .update({ rsi14, quant_signal: quantSignal })
        .eq("date", date)
        .eq("symbol", symbol);

      if (error) throw error;
      updated++;
    } catch (e: any) {
      errors.push({ date, symbol, reason: e?.message || String(e) });
    }

    if (updated % 50 === 0 && updated > 0) {
      console.log(`[Backfill Quant Signal] ${updated}건 업데이트 완료`);
    }
  }

  console.log(`[Backfill Quant Signal] 완료: updated=${updated}, skipped=${plan.skipped}, errors=${errors.length}`);

  return NextResponse.json({
    ok: true,
    dryRun: false,
    ...report,
    updated,
    errors: errors.slice(0, 20), // 에러는 최대 20건만 응답에 포함
  });
}
