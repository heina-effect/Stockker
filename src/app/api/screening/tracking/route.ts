import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/client";
import { formatKSTDateCompact } from "@/server/screening/storage";
import { fetchAllRows } from "@/server/screening/paginate";
import { getTradingDaysBetween } from "@/server/screening/trading-calendar";
import { TRACKING_WINDOW_DAYS_AFTER } from "@/server/screening/trajectory-update";
import {
  corporateAdjustmentLabel,
  findCorporateActionsInRange,
  lastDateUsedByQuantItem,
  priceAdjustmentFactor,
  type CorporateAction,
} from "@/server/screening/corporate-actions";
import { buildQuantBreakdown, computeExitStats, findDuplicateSignals } from "@/lib/screening/quant-breakdown";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ============================================================================
// B(전체 관찰 칸반) 추적 종료 조건 — 2026-09-11 재설계.
//
// 3단계 구조(경과일 = 현재 관찰 사이클의 entryDate 기준):
//   0~10영업일  : "primary" — 매매 판단 유효기간, 4컬럼 칸반에 노출
//   11~30영업일 : "secondary" — 결과 관찰 기간(판단 대상 아님), 기본 화면에서는 숨기고 검색으로만
//   30영업일 초과: "ended" — 완전 종료, 기본 화면에서 숨기고 검색으로만(DB 데이터는 계속 보존)
//
// 재등장 처리: 현재 관찰 사이클의 entryDate로부터 CYCLE_RESET_DAYS_AFTER(30영업일)을 넘겨
// 재등장하면 완전히 새로운 독립 관찰 사이클로 리셋한다(새 entryDate/entryClose). 그 이내
// 재등장은 같은 사이클의 연장으로 취급(기존 "최초 등장" 유지 동작과 동일). 한 종목이 여러
// 사이클을 가질 수 있으며, 대표 행은 항상 "가장 최근 사이클" 기준으로 계산한다 — 이전
// 사이클이 아무리 오래됐어도 그 entryClose가 최신 사이클 계산에 섞이지 않는다.
// ============================================================================
const PRIMARY_STAGE_DAYS_AFTER = 10;
const CYCLE_RESET_DAYS_AFTER = 30;

// 퀀트 신호 트래커(A)와 전체 관찰 칸반(B)은 완전히 분리된 별도 체계다. A 대상(아래 "A." 블록의
// 선정 조건 — quant_signal_judgments 의 발굴일 판정 기록)인 발굴 건은
// B의 판정 로직(verdict)과 절대 섞이지 않고, A에서 daysAfter와 무관하게 영구히(발생 시점부터
// 계속) 추적된다.
//
// QUANT_SIGNAL_FRESH_DAYS: A 트랙 내에서 "판단 대기"(신호 발생 후 이 값 미만 경과, RSI/거래량만
// 표시)와 "결과 확인 중"(이 값 이상 경과, 3일차 확정 수익률+현재까지 최고수익률 표시)을 가르는
// 기준. 여기서 daysAfter는 4컬럼의 "최초 등장" 기준이 아니라, A 선정 조건에 걸린 "그 발굴 건"
// 자체의 경과일이다(RSI/거래량 조건은 그날의 스냅샷이므로, 그 발굴일로부터 며칠 지났는지가
// 기준). "3일차 규칙" 승률/손익비/기대값 계산은 이 상수를 그대로 쓰며 이번 변경 대상이 아니다.
const QUANT_SIGNAL_FRESH_DAYS = 3;

// QUANT_OBSERVATION_END_DAYS_AFTER: A 트랙(퀀트 신호 트래커)의 "관찰 종료" 판정 기준(2026-09-18
// 수정). 원래 daysAfter>=30(B트랙의 CYCLE_RESET_DAYS_AFTER와 같은 값을 착오로 재사용)이었으나,
// 9/9 확정한 실전 관리 규칙("3일차 판정 후 +10%면 최대 2주(약 10영업일) 보유")과 맞지 않아
// 10영업일로 수정한다. B트랙의 PRIMARY_STAGE_DAYS_AFTER(값은 우연히 같은 10이지만 목적이 다름 —
// 스크리닝 재노출 관리용)와는 완전히 별개 상수이며 절대 공유하지 않는다.
const QUANT_OBSERVATION_END_DAYS_AFTER = 10;
// 2026-10-30 — 관찰 중/관찰 종료 판정은 더 이상 이 상수(day10)를 쓰지 않는다. 판정 기준이
// 3일차 종가 청산이므로 "day3 종가 존재 = 관찰 종료"로 통일했다(헤드라인 n과 표 건수 일치).
// 이 상수는 10일차·최고점 참고 컬럼의 계산 창으로만 남는다.

// 왕복 거래비용(2026-11-02 수정, 종전 0.20%는 거래세만 반영한 값). 응답(quantSignalStats.roundTripCostPct)으로
// 그대로 내려보내 화면에 노출하고, 감사 가능하게 한다.
//   수수료(우대, 매수+매도) 0.0073% + 증권거래세 0.20% + 최소 스프레드 0.050% = 0.257%
// 호가 구간 상단 직전 기준 하한. 평균적 가격 위치에서는 0.31~0.46%
// (근거: analysis/hypothesis-log.md #3 비용 구조 확정, 2026-10-23).
const ROUND_TRIP_COST_PCT = 0.257;

// 손절 가정 규칙(exitStop10Pct)의 손절선. 종가 기준으로만 판정한다 — 장중 저가 기준은 체결
// 가정이 불확실해 쓰지 않는다(작업지시 2026-10-20).
const STOP_LOSS_THRESHOLD_PCT = -10;

type Verdict = "stopLoss" | "hold" | "neutral" | "watching";

export async function GET() {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "Supabase 미구성" }, { status: 500 });
  }

  const todayKey = formatKSTDateCompact(new Date());

  // 1단계: overnight_screening_items 전체 이력(기간 제한 없음). "30영업일 초과(ended)" 종목도
  // 검색으로 찾을 수 있어야 하므로(§1 재설계) 사전에 symbol을 걸러내지 않고 전부 가져온다.
  let allHistory: { symbol: string; name: string; date: string; entry_close: number }[];
  try {
    allHistory = await fetchAllRows<{ symbol: string; name: string; date: string; entry_close: number }>((from, to) =>
      supabase
        .from("overnight_screening_items")
        .select("symbol,name,date,entry_close")
        .order("symbol", { ascending: true })
        .order("date", { ascending: true })
        .range(from, to)
    );
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 });
  }

  const historyBySymbol = new Map<string, { date: string; entryClose: number; name: string }[]>();
  for (const row of allHistory) {
    const entryClose = Number(row.entry_close || 0);
    if (entryClose <= 0) continue; // 포착가 없으면 추적 의미 없음
    const list = historyBySymbol.get(row.symbol);
    const entry = { date: row.date, entryClose, name: row.name };
    if (list) list.push(entry);
    else historyBySymbol.set(row.symbol, [entry]);
  }

  const trackedSymbols = [...historyBySymbol.keys()];

  // ============================================================================
  // A. 퀀트 신호 트래커 — B(전체 관찰 칸반)와 완전히 분리된 별도 체계.
  // 선정(2026-11-06 교체): quant_signal_judgments WHERE quant_signal = true. 발굴일에 한 번 기록된 판정만 읽고
  // 저장 지표로 다시 거르지 않는다. 종전에는 stock_trajectory day0 의 rsi14·vol_ratio_20 을 조회 때마다 걸러서,
  // 지표가 교정되면 목록이 바뀌고 소급 편입이 생겼다(삼성SDI 10/19). 임계값은 판정할 때의 quant-signal.ts 다.
  // 수익률은 여전히 궤적의 확정 종가 기준이다. 15:40~16:00 종가매매로 사면 확정 종가에 산다.
  // close_at_judgment 는 기록용이다. 같은 symbol의 여러 판정은 각각 독립 표본으로 추적한다.
  // ============================================================================
  let quantSignalRows: {
    symbol: string;
    name: string;
    discovery_date: string;
    close: number;
    rsi14: number | null;
    vol_ratio_20: number | null;
    volume_basis: string;
    judged_at: string;
  }[];
  try {
    const judgments = await fetchAllRows<{
      date: string;
      symbol: string;
      judged_at: string;
      rsi14: number | null;
      vol_ratio_20: number | null;
      volume_basis: string;
    }>((from, to) =>
      supabase
        .from("quant_signal_judgments")
        .select("date,symbol,judged_at,rsi14,vol_ratio_20,volume_basis")
        .eq("quant_signal", true)
        .order("symbol", { ascending: true })
        .order("date", { ascending: true })
        .range(from, to)
    );
    const judgedSymbols = [...new Set(judgments.map((j) => j.symbol))];
    const day0Rows = judgedSymbols.length === 0 ? [] : await fetchAllRows<{ symbol: string; name: string; discovery_date: string; close: number }>((from, to) =>
      supabase
        .from("stock_trajectory")
        .select("symbol,name,discovery_date,close")
        .eq("days_after", 0)
        .in("symbol", judgedSymbols)
        .order("symbol", { ascending: true })
        .order("discovery_date", { ascending: true })
        .range(from, to)
    );
    const day0ByKey = new Map(day0Rows.map((r) => [`${r.symbol}::${r.discovery_date}`, r]));
    quantSignalRows = judgments.flatMap((j) => {
      const day0 = day0ByKey.get(`${j.symbol}::${j.date}`);
      if (!day0) {
        console.warn(`[Tracking API] 판정 기록에 day0 궤적이 없어 건너뜀: ${j.symbol} ${j.date}`);
        return [];
      }
      return [{
        symbol: j.symbol,
        name: day0.name,
        discovery_date: j.date,
        close: day0.close,
        rsi14: j.rsi14,
        vol_ratio_20: j.vol_ratio_20,
        volume_basis: j.volume_basis,
        judged_at: j.judged_at,
      }];
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 });
  }

  // A 대상 종목들의 stock_trajectory를 discovery_date 구분 없이 전부 모아 symbol별
  // trade_date → close 맵을 만든다(4컬럼과 동일한 원리 — 개별 발굴 건의 궤적은 15영업일 갱신
  // 후 멈추므로, 그 symbol의 다른 재발굴 궤적들을 이어붙여야 오늘까지의 실제가가 빠짐없이 채워짐).
  // B의 trackedSymbols(15영업일 게이트를 통과한 것)와 무관하게 독립적으로 조회한다 — A는 게이트가
  // 없기 때문이다.
  const dataByTradeDateForQuant = new Map<
    string,
    Map<string, { close: number; isHalted: boolean; volRatio20: number | null }>
  >();
  const quantSymbols = [...new Set(quantSignalRows.map((r) => r.symbol))];
  // 발견일 이후 경과 거래일(정지일 포함) 산출용 거래일 캘린더. 저장 행 수로 세면 궤적 갱신이
  // days_after 31에서 멈추므로 상한(TRACKING_WINDOW_DAYS_AFTER)을 넘는 일이 없어 쓸 수 없다.
  let quantCalendarDays: string[] = [];
  if (quantSignalRows.length > 0) {
    let quantMinDate = todayKey;
    for (const r of quantSignalRows) if (r.discovery_date < quantMinDate) quantMinDate = r.discovery_date;
    quantCalendarDays = await getTradingDaysBetween(quantMinDate, todayKey);

    let quantTrajRows: {
      symbol: string;
      trade_date: string;
      close: number;
      is_halted: boolean;
      vol_ratio_20: number | null;
    }[];
    try {
      quantTrajRows = await fetchAllRows<{
        symbol: string;
        trade_date: string;
        close: number;
        is_halted: boolean;
        vol_ratio_20: number | null;
      }>((from, to) =>
        supabase
          .from("stock_trajectory")
          .select("symbol,trade_date,close,is_halted,vol_ratio_20")
          .in("symbol", quantSymbols)
          .gte("trade_date", quantMinDate)
          .order("symbol", { ascending: true })
          .order("trade_date", { ascending: true })
          .range(from, to)
      );
    } catch (e: any) {
      return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 });
    }

    // 종목별로 close, isHalted, vol_ratio_20(관찰 지속성 보조표시용) 데이터를 모음
    for (const row of quantTrajRows) {
      let map = dataByTradeDateForQuant.get(row.symbol);
      if (!map) {
        map = new Map();
        dataByTradeDateForQuant.set(row.symbol, map);
      }
      map.set(row.trade_date, {
        close: Number(row.close || 0),
        isHalted: Boolean(row.is_halted),
        volRatio20: row.vol_ratio_20 != null ? Number(row.vol_ratio_20) : null,
      });
    }
  }

  // "최근 재포착" 표시용(§UI 개선) — A 선정 조건으로 독립 추적 중인 symbol이 신호일 이후
  // 다시 스크리닝에 포착됐지만 조건을 재충족하지 못한 이력이 있는지 확인한다. 신호 판정/통계
  // 계산에는 전혀 영향을 주지 않는 순수 표시용 부가 정보다. KIS 호출 없이 기존 조회(allHistory,
  // historyBySymbol)와 아래 추가 Supabase 조회(days_after=0 전체, 범위 필터 없음)만으로 계산한다.
  const recentRecaptureBySymbol = new Map<string, { date: string; status: "notMet" | "unknown" } | null>();
  if (quantSymbols.length > 0) {
    let allQuantDiscoveryRows: { symbol: string; discovery_date: string; rsi14: number | null; vol_ratio_20: number | null }[];
    try {
      allQuantDiscoveryRows = await fetchAllRows<{
        symbol: string; discovery_date: string; rsi14: number | null; vol_ratio_20: number | null;
      }>((from, to) =>
        supabase
          .from("stock_trajectory")
          .select("symbol,discovery_date,rsi14,vol_ratio_20")
          .eq("days_after", 0)
          .in("symbol", quantSymbols)
          .range(from, to)
      );
    } catch (e: any) {
      return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 });
    }
    const indicatorsByKey = new Map<string, { rsi14: number | null; vol_ratio_20: number | null }>();
    for (const row of allQuantDiscoveryRows) {
      indicatorsByKey.set(`${row.symbol}::${row.discovery_date}`, { rsi14: row.rsi14, vol_ratio_20: row.vol_ratio_20 });
    }

    const qualifyingDatesBySymbol = new Map<string, Set<string>>();
    for (const row of quantSignalRows) {
      const set = qualifyingDatesBySymbol.get(row.symbol) ?? new Set<string>();
      set.add(row.discovery_date);
      qualifyingDatesBySymbol.set(row.symbol, set);
    }

    for (const symbol of quantSymbols) {
      const qualifyingDates = qualifyingDatesBySymbol.get(symbol) ?? new Set<string>();
      const latestSignalDate = [...qualifyingDates].sort().pop();
      if (!latestSignalDate) continue;
      const allDates = (historyBySymbol.get(symbol) ?? []).map((h) => h.date);
      const recaptureCandidates = [...new Set(allDates)]
        .filter((d) => d > latestSignalDate && !qualifyingDates.has(d))
        .sort();
      const recaptureDate = recaptureCandidates.pop();
      if (!recaptureDate) {
        recentRecaptureBySymbol.set(symbol, null);
        continue;
      }
      const indicators = indicatorsByKey.get(`${symbol}::${recaptureDate}`);
      const status: "notMet" | "unknown" =
        indicators && indicators.rsi14 != null && indicators.vol_ratio_20 != null ? "notMet" : "unknown";
      recentRecaptureBySymbol.set(symbol, { date: recaptureDate, status });
    }
  }

  interface QuantSignalItem {
    symbol: string;
    name: string;
    discoveryDate: string;
    daysAfter: number;
    rsi14: number | null;
    volumeRatio: number | null;
    entryClose: number;
    currentClose: number;
    group: "pending" | "result"; // pending: daysAfter < 3(판단 대기), result: >= 3(결과 확인 중)
    day3ReturnPct: number | null; // ±10% 보유/손절 "판정 지표"(3일 규칙). exitDay3Pct와 값은 정의상 동일.
    maxReturnSoFarPct: number | null; // 2026-09-18: 계산 창을 0~QUANT_OBSERVATION_END_DAYS_AFTER(10)일로 축소
    minReturnSoFarPct: number | null; // maxReturnSoFarPct와 동일 창의 최솟값(표시 전용, 판정 무관)
    // ── 청산 규칙별 수익률(2026-10-20 정식화). 모두 entryClose(발굴일 종가) 기준 %. ──
    exitDay3Pct: number | null; // 조건 없이 3거래일차 종가 청산 — 사후 정보 없음(헤드라인 통계 기준)
    exitDay3NetPct: number | null; // exitDay3Pct - ROUND_TRIP_COST_PCT(왕복 비용 차감)
    exitStop10Pct: number | null; // day1~day3 중 종가 -10% 이하 마감일이 있으면 그날 종가 청산, 없으면 day3 종가
    peakReturnPct: number | null; // 종전 realizedReturnPct를 이름만 바꾼 것(계산식 동일) — 사후 상한선,
    // day3>=10이면 day3 이후 최고가 청산 가정. 사후에만 알 수 있어 실현 불가(참고 표시 전용).
    endDate: string | null; // daysAfter>=10 도달 시: day10 시점 거래일(종료일자, 고정값)
    endClose: number | null; // daysAfter>=10 도달 시: day10 시점 종가(종료가, 고정값)
    endReturnPct: number | null; // = exitDay10Pct(관측 종료일 종가 청산). 테이블 "10일차(%)" 참고 컬럼
    haltStartDaysAfter: number | null;
    isValidForStats: boolean; // 3일차 규칙 평가가 가능한지 여부 (haltStartDaysAfter > 3 또는 null)
    elapsedTradingDays: number; // 발견일로부터 오늘까지 경과 거래일(정지일 포함, 거래일 캘린더 기준)
    observationEnded: boolean; // 관찰 종료 = day3 종가 존재, 또는 정지로 미완인 채 경과 거래일이 상한 초과
    haltIncomplete: boolean; // 거래정지로 day3 종가 없이 상한 초과로 종료된 건(통계 제외, "관측 미완")
    isRecentlyActive: boolean; // 관찰 지속성 보조표시(§1, 참고용 — 규칙 아님). daysAfter<30이면 항상 false.
    recentRecapture: { date: string; status: "notMet" | "unknown" } | null; // 신호일 이후 재포착 이력(표시용, 판정과 무관)
    corporateAction: CorporateAction | null; // 계산 구간 안의 비율 미확인 자본변동 — 있으면 수익률을 내지 않고 통계에서 뺀다
    corporateAdjustmentLabel: string | null; // 계산 구간 안의 비율 확인 자본변동 — 수익률에 보정을 적용했다는 표시
    volumeBasis: string; // 판정에 쓴 거래량비 정의(incl_today | excl_today)
    judgedAt: string; // 판정 시각
    duplicateOf: string | null; // 보유 구간이 겹친 집계 건의 발굴일. 있으면 목록에만 두고 집계에서 뺀다
  }

  const quantSignalItems: QuantSignalItem[] = [];
  for (const row of quantSignalRows) {
    const entryClose = Number(row.close || 0);
    if (entryClose <= 0) continue;
    const tradeDateMap = dataByTradeDateForQuant.get(row.symbol);
    if (!tradeDateMap) continue;

    const sortedDates = [...tradeDateMap.keys()].filter((d) => d >= row.discovery_date).sort();
    if (sortedDates.length === 0) continue;

    let haltStartDaysAfter: number | null = null;
    for (let i = 0; i < sortedDates.length; i++) {
      if (tradeDateMap.get(sortedDates[i])!.isHalted) {
        haltStartDaysAfter = i;
        break;
      }
    }

    const isValidForStats = haltStartDaysAfter === null || haltStartDaysAfter > 3;

    // 거래정지가 시작되기 직전까지의 유효 날짜만 사용 (MFE/MAE 및 당일 종가 산출용)
    const validDatesForReturn = haltStartDaysAfter !== null ? sortedDates.slice(0, haltStartDaysAfter) : sortedDates;
    
    // 유효 날짜가 없으면(즉 당일부터 거래정지면) 스킵
    if (validDatesForReturn.length === 0) continue;

    const daysAfter = sortedDates.length - 1; // 전체 경과일은 정지 포함 표출용
    // 캘린더가 비어 있으면(마이그레이션 미적용 등) 저장 행 기준 daysAfter로 폴백한다.
    const elapsedTradingDays =
      quantCalendarDays.length > 0
        ? quantCalendarDays.filter((d) => d > row.discovery_date).length
        : daysAfter;
    const currentClose = tradeDateMap.get(validDatesForReturn[validDatesForReturn.length - 1])!.close;
    const group: "pending" | "result" = validDatesForReturn.length - 1 < QUANT_SIGNAL_FRESH_DAYS ? "pending" : "result";
    // 수익률은 전부 이 두 값으로 구한다 — 비율 확인 자본변동이 끼어도 같은 기준으로 맞춰진다(DB 값은 그대로)
    const closeAt = (d: string) => tradeDateMap.get(d)!.close * priceAdjustmentFactor(row.symbol, d);
    const entryBasis = entryClose * priceAdjustmentFactor(row.symbol, row.discovery_date);
    const returnAt = (d: string) => ((closeAt(d) - entryBasis) / entryBasis) * 100;

    // 이 건의 계산이 실제로 읽는 구간 안의 이벤트만 본다. 거래정지로 유효 구간이 이벤트 앞에서 끊긴 건은
    // 영향이 없다(001210 7/7 — 314c665 에서 합친 시계열 끝으로 판정해 잘못 제외했다).
    const quantLastUsedDate = lastDateUsedByQuantItem(
      validDatesForReturn,
      group === "result" ? returnAt(validDatesForReturn[QUANT_SIGNAL_FRESH_DAYS]) : null,
      QUANT_OBSERVATION_END_DAYS_AFTER,
      10
    );
    const quantActions = findCorporateActionsInRange(row.symbol, row.discovery_date, quantLastUsedDate);
    const corporateAction = quantActions.find((a) => !a.adjustment) ?? null;

    let day3ReturnPct: number | null = null;
    let maxReturnSoFarPct: number | null = null;
    let minReturnSoFarPct: number | null = null;
    let exitDay3Pct: number | null = null;
    let exitDay3NetPct: number | null = null;
    let exitStop10Pct: number | null = null;
    let peakReturnPct: number | null = null;
    let endDate: string | null = null;
    let endClose: number | null = null;
    let endReturnPct: number | null = null;

    if (group === "result" && !corporateAction) {
      day3ReturnPct = Number(returnAt(validDatesForReturn[QUANT_SIGNAL_FRESH_DAYS]).toFixed(2));

      // 최고수익률(MFE) 계산 창 — 2026-09-18 수정: 0~30일(과거 MFE/MAE 통계 측정창을 착오로
      // 재사용)에서 0~QUANT_OBSERVATION_END_DAYS_AFTER(10)일로 축소. "관찰 중"이든 "관찰 종료"든
      // 항상 day10을 넘는 데이터는 참조하지 않는다(halt로 그 전에 끊겼으면 그 지점까지만).
      const mfeWindowLen = Math.min(validDatesForReturn.length, QUANT_OBSERVATION_END_DAYS_AFTER + 1);
      const mfeWindowDates = validDatesForReturn.slice(0, mfeWindowLen);
      const returnSeries = mfeWindowDates.map(returnAt);
      maxReturnSoFarPct = Number(Math.max(...returnSeries).toFixed(2));
      // 최저수익률(MAE) — A트랙 카드/표 "참고" 영역 표시용(§UI 개선). maxReturnSoFarPct와 완전히
      // 동일한 창(returnSeries)에서 최솟값만 추가로 뽑는다 — 3일차 규칙/승률 계산에는 쓰이지 않음.
      minReturnSoFarPct = Number(Math.min(...returnSeries).toFixed(2));

      // peakReturnPct — 종전 realizedReturnPct. 계산식은 그대로 두고 이름만 바꿨다(사후 상한선).
      if (day3ReturnPct >= 10) {
        const afterDay3Series = validDatesForReturn.slice(QUANT_SIGNAL_FRESH_DAYS).map(returnAt);
        peakReturnPct = Number(Math.max(...afterDay3Series).toFixed(2));
      } else {
        peakReturnPct = day3ReturnPct;
      }

      // exitDay3Pct — 조건 없이 3거래일차 종가로 청산. day3ReturnPct와 정의상 같은 값이므로
      // 재계산하지 않고 그대로 쓴다(한 번만 계산 → 두 이름 사이에 값이 어긋날 여지를 없앤다).
      // day3ReturnPct는 ±10% 판정 지표, exitDay3Pct는 청산 규칙의 결과라는 의미 구분만 남는다.
      exitDay3Pct = day3ReturnPct;
      exitDay3NetPct = Number((exitDay3Pct - ROUND_TRIP_COST_PCT).toFixed(2));

      // exitStop10Pct — 손절 가정 버전. 보유 구간(day1~day3) 중 종가가 손절선 이하로 마감한
      // 첫 날이 있으면 그날 종가로 청산하고, 없으면 day3 종가로 청산한다. 장중 저가가 아니라
      // 종가만 본다(체결 가정 불확실성 배제). 최대 보유는 day3 — 그래서 스캔 창도 day3까지다.
      const stopScanDates = validDatesForReturn.slice(1, QUANT_SIGNAL_FRESH_DAYS + 1);
      let stopHitPct: number | null = null;
      for (const d of stopScanDates) {
        const r = returnAt(d);
        if (r <= STOP_LOSS_THRESHOLD_PCT) {
          stopHitPct = Number(r.toFixed(2));
          break;
        }
      }
      exitStop10Pct = stopHitPct ?? day3ReturnPct;

      // 종료가/종료일자(§2-2,3) — day10(QUANT_OBSERVATION_END_DAYS_AFTER) 시점 데이터가 halt 없이
      // 유효하게 존재할 때만 고정값을 채운다. 아직 도달 전이거나 halt로 그 전에 끊겼으면 null
      // (표의 "10일차" 참고 컬럼이 빈칸). 관찰 중/종료 판정과는 무관하다(observationEnded 참고).
      if (validDatesForReturn.length - 1 >= QUANT_OBSERVATION_END_DAYS_AFTER) {
        endDate = validDatesForReturn[QUANT_OBSERVATION_END_DAYS_AFTER];
        endClose = tradeDateMap.get(endDate)!.close;
        endReturnPct = Number(returnAt(endDate).toFixed(2));
      }
    }

    // 관찰 지속성 보조표시(§1) — "관찰 종료"(daysAfter>=30) 카드에만 해당. day26~30 구간의
    // 등락폭(recent_range)과 평균 거래량비율(recent_vol)로 "최근에도 변동성 지속 중"인지 참고
    // 판단한다. 승/패 판정이나 집계 통계와는 무관한 순수 참고 표시 — 3일차 규칙 계산에 영향 없음.
    let isRecentlyActive = false;
    if (daysAfter >= 30 && !corporateAction) {
      const windowDates = sortedDates.slice(26, 31); // days_after 26~30(최근 5거래일)
      if (windowDates.length > 0) {
        const windowReturns = windowDates.map(returnAt);
        const recentRange = Math.max(...windowReturns) - Math.min(...windowReturns);
        const volValues = windowDates
          .map((d) => tradeDateMap.get(d)!.volRatio20)
          .filter((v): v is number => v != null);
        const recentVol = volValues.length > 0 ? volValues.reduce((a, b) => a + b, 0) / volValues.length : 0;
        isRecentlyActive = recentRange >= 10 || recentVol >= 100;
      }
    }

    // 관찰 중/종료(2026-10-30 통일) — 판정 기준이 3일차 종가 청산이므로 day3 종가가 있으면 종료.
    // 3일차 이내 거래정지로 day3 종가가 영영 안 생기는 건은 경과 거래일이 추적 상한을 넘으면
    // 유효일 수와 무관하게 "거래정지로 관측 미완"으로 종료한다(무한 관찰 중 방지).
    const haltIncomplete = !corporateAction && exitDay3Pct == null && elapsedTradingDays > TRACKING_WINDOW_DAYS_AFTER;
    const observationEnded = corporateAction != null || exitDay3Pct != null || haltIncomplete;

    quantSignalItems.push({
      symbol: row.symbol,
      name: row.name,
      discoveryDate: row.discovery_date,
      daysAfter,
      rsi14: row.rsi14 != null ? Number(row.rsi14) : null,
      volumeRatio: row.vol_ratio_20 != null ? Number(row.vol_ratio_20) : null,
      entryClose,
      currentClose,
      group,
      day3ReturnPct,
      maxReturnSoFarPct,
      minReturnSoFarPct,
      exitDay3Pct,
      exitDay3NetPct,
      exitStop10Pct,
      peakReturnPct,
      endDate,
      endClose,
      endReturnPct,
      haltStartDaysAfter,
      isValidForStats,
      elapsedTradingDays,
      observationEnded,
      haltIncomplete,
      isRecentlyActive,
      recentRecapture: recentRecaptureBySymbol.get(row.symbol) ?? null,
      corporateAction,
      corporateAdjustmentLabel: corporateAction ? null : corporateAdjustmentLabel(quantActions),
      volumeBasis: row.volume_basis,
      judgedAt: row.judged_at,
      duplicateOf: null,
    });
  }
  quantSignalItems.sort((a, b) => b.discoveryDate.localeCompare(a.discoveryDate));

  // 캘린더가 비어 있으면(마이그레이션 미적용 등) 저장된 거래일로 센다
  const duplicateCalendar =
    quantCalendarDays.length > 0
      ? quantCalendarDays
      : [...new Set([...dataByTradeDateForQuant.values()].flatMap((m) => [...m.keys()]))].sort();
  const duplicateSignals = findDuplicateSignals(quantSignalItems, duplicateCalendar, QUANT_SIGNAL_FRESH_DAYS);
  for (const item of quantSignalItems) {
    item.duplicateOf = duplicateSignals.get(`${item.symbol}::${item.discoveryDate}`) ?? null;
  }

  // 누적 통계 표본(2026-10-20 재정의) — exitDay3Pct가 non-null인 건만 집계한다. day3 종가가
  // 없으면(3거래일 미경과=관측 중, 또는 3일차 이내 거래정지로 유효 구간이 끊김) 청산 규칙을
  // 적용할 수 없기 때문이다. 종전 필터(group==='result' && isValidForStats)와 결과는 동일하다 —
  // 두 조건 모두 "day3 종가 존재"와 같은 집합을 가리킨다(halt가 day<=3이면 group이 pending이 됨).
  const resultItems = quantSignalItems.filter((i) => i.exitDay3Pct != null);
  // 수익률 집계의 표본 — 중복 신호는 건수에는 남고 집계에서 빠진다
  const statItems = resultItems.filter((i) => !i.duplicateOf);
  // 통계에서 제외된 관측 중(day3 미도달) 건수 — 거래정지로 관측 미완 종료된 건은 따로 센다.
  const haltIncompleteCount = quantSignalItems.filter((i) => i.haltIncomplete).length;
  const corporateActionExcludedCount = quantSignalItems.filter((i) => i.corporateAction).length;
  const observingExcludedCount =
    quantSignalItems.length - resultItems.length - haltIncompleteCount - corporateActionExcludedCount;
  const avgDay3ReturnPct =
    statItems.length > 0
      ? Number(
          (statItems.reduce((sum, i) => sum + (i.day3ReturnPct as number), 0) / statItems.length).toFixed(2)
        )
      : null;
  const avgMaxReturnSoFarPct =
    statItems.length > 0
      ? Number(
          (statItems.reduce((sum, i) => sum + (i.maxReturnSoFarPct as number), 0) / statItems.length).toFixed(2)
        )
      : null;

  // [주] 3일차 종가 청산 — 사후 정보가 들어가지 않는 실행 가능한 규칙(헤드라인).
  const exitDay3Stats = computeExitStats(statItems.map((i) => i.exitDay3Pct as number));
  // (a) 비용 차감 후
  const exitDay3NetStats = computeExitStats(statItems.map((i) => i.exitDay3NetPct as number));
  // (b) 손절 -10% 적용
  const exitStop10Stats = computeExitStats(statItems.map((i) => i.exitStop10Pct as number));
  // (c) 극단값 민감도 — exitDay3Pct 상·하위 1건 제외
  const sortedExitDay3 = [...statItems.map((i) => i.exitDay3Pct as number)].sort((a, b) => a - b);
  const trimmedExitDay3 = sortedExitDay3.length > 2 ? sortedExitDay3.slice(1, -1) : [];
  const exitDay3TrimmedStats = computeExitStats(trimmedExitDay3);
  // (d) 최고점 청산 상한 — 사후에만 알 수 있어 실현 불가. 참고용으로만 노출한다.
  const peakStats = computeExitStats(statItems.map((i) => i.peakReturnPct as number));

  // 신뢰도 배지용 표본 크기 (승패 검증이 가능한 종목만)
  const quantSignalSampleSymbolCount = new Set(statItems.map((r) => r.symbol)).size;

  const quantSignalStats = {
    totalCount: quantSignalItems.length,
    resultCount: resultItems.length,
    observingExcludedCount,
    haltIncompleteCount,
    corporateActionExcludedCount,
    roundTripCostPct: ROUND_TRIP_COST_PCT, // 감사용 — 화면에 그대로 노출
    stopLossThresholdPct: STOP_LOSS_THRESHOLD_PCT,
    avgDay3ReturnPct,
    avgMaxReturnSoFarPct,
    exitDay3: exitDay3Stats,
    exitDay3Net: exitDay3NetStats,
    exitStop10: exitStop10Stats,
    exitDay3Trimmed: exitDay3TrimmedStats,
    peak: peakStats,
    sampleSymbolCount: quantSignalSampleSymbolCount,
  };

  // 표본이 작아 헤드라인에는 건수만 쓴다. 이 분해는 화면의 접기 안에만 나온다
  const quantBreakdown = buildQuantBreakdown(quantSignalItems, ROUND_TRIP_COST_PCT);

  // 재구성 표본 — 판정 기록이 없는 시기를 포함한 옛 A트랙 52건 중 판정 기록과 겹치지 않는 건.
  // 11/6 에 고정한 tracking_item 만 읽고 궤적으로 다시 계산하지 않는다. 임계값을 정한 관측 데이터이거나
  // 판정 기록이 없는 건이라 조건을 검증하는 표본으로 쓸 수 없어 집계도 따로 낸다.
  let legacySample: {
    items: { symbol: string; name: string; discoveryDate: string; exitDay3Pct: number | null }[];
    stats: ReturnType<typeof computeExitStats>;
    netExpectancy: number;
  } | null = null;
  try {
    const judgedKeys = new Set(quantSignalRows.map((r) => `${r.symbol}::${r.discovery_date}`));
    const snapshot = await fetchAllRows<{ symbol: string; name: string; discovery_date: string; tracking_item: { exitDay3Pct: number | null; exitDay3NetPct: number | null } }>((from, to) =>
      supabase
        .from("a_track_legacy_snapshot_20261106")
        .select("symbol,name,discovery_date,tracking_item")
        .order("discovery_date", { ascending: false })
        .order("symbol", { ascending: true })
        .range(from, to)
    );
    const items = snapshot
      .filter((r) => !judgedKeys.has(`${r.symbol}::${r.discovery_date}`))
      .map((r) => ({ symbol: r.symbol, name: r.name, discoveryDate: r.discovery_date, exitDay3Pct: r.tracking_item.exitDay3Pct, exitDay3NetPct: r.tracking_item.exitDay3NetPct }));
    const results = items.filter((i) => i.exitDay3Pct != null);
    legacySample = {
      items: items.map(({ symbol, name, discoveryDate, exitDay3Pct }) => ({ symbol, name, discoveryDate, exitDay3Pct })),
      stats: computeExitStats(results.map((i) => i.exitDay3Pct as number)),
      netExpectancy: computeExitStats(results.map((i) => i.exitDay3NetPct as number)).expectancy,
    };
  } catch (e: any) {
    // 접힌 참고 영역이다. 읽지 못해도 트래커는 그대로 보인다
    console.error("[Tracking API] Legacy snapshot read failed:", e?.message || e);
  }

  if (trackedSymbols.length === 0) {
    return NextResponse.json({
      ok: true,
      summary: { total: 0, stopLoss: 0, hold: 0, watching: 0, corporateActionExcluded: 0 },
      stageCounts: { primary: 0, secondary: 0, ended: 0 },
      items: [],
      quantSignalItems,
      quantSignalStats,
      quantBreakdown,
      legacySample,
    });
  }

  // 2단계: 최초 등장일 중 가장 이른 날짜를 구해, stock_trajectory 조회의 trade_date 하한으로
  // 써서 불필요한 포착일 이전(-60일 히스토리용) 행을 걸러낸다.
  let globalMinFirstDate = todayKey;
  for (const list of historyBySymbol.values()) {
    const first = list.reduce((a, b) => (b.date < a.date ? b : a));
    if (first.date < globalMinFirstDate) globalMinFirstDate = first.date;
  }

  // 거래일 캘린더(Phase 42 5단계) — 사이클 분리(gapDaysAfter)와 대표 daysAfter 계산을
  // stock_trajectory에 실제로 저장된 행 수가 아니라 실제 거래일 수 기준으로 하기 위해,
  // 관련 구간 전체를 한 번만 조회해 이후 전부 재사용한다(심볼/사이클 전환마다 재조회 없음).
  const calendarDays = await getTradingDaysBetween(globalMinFirstDate, todayKey);

  // 3단계: 추적 대상 symbol의 stock_trajectory를 discovery_date 구분 없이 전부 모아, symbol별
  // trade_date → close 맵을 만든다. 한 symbol의 여러 발굴 건(discovery_date)이 서로 다른 -60~+30일
  // 구간을 겹쳐 쌓아왔으므로, 이를 합치면 최초 등장일부터 오늘까지의 실제 거래일 가격이 빈틈없이
  // 채워진다(개별 발굴 건의 궤적은 갱신 윈도우 이후 멈춰 최신 시세를 반영하지 못하므로 이 방식이
  // 필요하다 — 실측 확인: JW신약 최초 발굴(7/14) 궤적은 8/27에서 멈춰있었음).
  let allTraj: { symbol: string; trade_date: string; close: number }[];
  try {
    allTraj = await fetchAllRows<{ symbol: string; trade_date: string; close: number }>((from, to) =>
      supabase
        .from("stock_trajectory")
        .select("symbol,trade_date,close")
        .in("symbol", trackedSymbols)
        .gte("trade_date", globalMinFirstDate)
        .order("symbol", { ascending: true })
        .order("trade_date", { ascending: true })
        .range(from, to)
    );
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 });
  }
  console.log(`[Tracking API] 전체 궤적 stock_trajectory 조회 ${allTraj.length}건 (trade_date >= ${globalMinFirstDate})`);

  const closeByTradeDateBySymbol = new Map<string, Map<string, number>>();
  for (const row of allTraj) {
    let map = closeByTradeDateBySymbol.get(row.symbol);
    if (!map) {
      map = new Map();
      closeByTradeDateBySymbol.set(row.symbol, map);
    }
    map.set(row.trade_date, Number(row.close || 0));
  }

  // 4단계: 즐겨찾기 — symbol 기준으로 체크(화면이 종목 단위로 그룹화됐으므로). 해제 시에는
  // favorite/route.ts가 해당 symbol의 모든 포착 건 즐겨찾기를 한꺼번에 지운다.
  const favRes = await supabase.from("trajectory_favorites").select("symbol");
  if (favRes.error) {
    return NextResponse.json({ ok: false, error: favRes.error.message }, { status: 500 });
  }
  const favoriteSymbols = new Set(((favRes.data || []) as any[]).map((r) => r.symbol));

  // 5단계: symbol별 관찰 사이클 분리 — 재등장이 현재 사이클 entryDate로부터
  // CYCLE_RESET_DAYS_AFTER(30영업일)를 넘겼으면 새 사이클로 리셋한다(§1).
  interface CycleCapture {
    date: string;
    entryClose: number;
    name: string;
  }
  interface Cycle {
    cycleNumber: number;
    entryDate: string;
    entryClose: number;
    name: string;
    captures: CycleCapture[];
  }

  function splitIntoCycles(sortedHistory: CycleCapture[], calendarDays: string[]): Cycle[] {
    const cycles: Cycle[] = [];
    let current: Cycle | null = null;
    for (const capture of sortedHistory) {
      if (!current) {
        current = {
          cycleNumber: 1,
          entryDate: capture.date,
          entryClose: capture.entryClose,
          name: capture.name,
          captures: [capture],
        };
        cycles.push(current);
        continue;
      }
      // 현재 사이클 시작일부터 이 재등장까지의 실제 거래일 경과(gapDaysAfter)를 거래일
      // 캘린더 기준으로 계산한다(Phase 42 5단계 — 기존에는 stock_trajectory에 실제로 저장된
      // 행 수로 셌는데, 데이터 공백이 있으면 실제보다 적게 계산돼 재등장이 새 사이클로
      // 인식되지 못하는 문제가 있었다). 캘린더가 아직 이 구간을 못 채웠으면(극히 드문 경우)
      // gap=0으로 보아 안전하게 같은 사이클로 유지한다(오탐으로 사이클을 조기 리셋하지 않도록).
      const inRange = calendarDays.filter((d) => d >= current!.entryDate && d <= capture.date);
      const gapDaysAfter = inRange.length > 0 ? inRange.length - 1 : 0;
      if (gapDaysAfter > CYCLE_RESET_DAYS_AFTER) {
        current = {
          cycleNumber: current.cycleNumber + 1,
          entryDate: capture.date,
          entryClose: capture.entryClose,
          name: capture.name,
          captures: [capture],
        };
        cycles.push(current);
      } else {
        current.captures.push(capture);
      }
    }
    return cycles;
  }

  // 6단계: symbol별 최종 조합 — 대표 행(진입가/경과일/현재가/판정)은 "가장 최근 관찰 사이클"
  // 기준. 최고/최저 예상수익률도 그 사이클의 entryDate 이후 구간만으로 계산해, 이전 사이클의
  // 가격 변동이 현재 사이클 통계에 섞이지 않게 한다.
  const items: {
    symbol: string;
    name: string;
    discoveryDate: string;
    daysAfter: number;
    entryClose: number;
    currentClose: number;
    returnPct: number | null; // 자본변동이 끼면 null
    verdict: Verdict | null; // 자본변동이 끼면 null
    corporateAction: CorporateAction | null; // 비율 미확인 자본변동이 끼면 수익률·판정이 null
    corporateAdjustmentLabel: string | null; // 비율 확인 자본변동을 보정했다는 표시
    isFavorite: boolean;
    captureCount: number;
    captureDates: string[];
    captureHistory: { date: string; entryClose: number }[];
    maxReturnPct: number | null;
    minReturnPct: number | null;
    stage: "primary" | "secondary" | "ended";
    cycleNumber: number;
    priorCycleCount: number;
    priorCycleEntryDates: string[];
  }[] = [];

  for (const symbol of trackedSymbols) {
    const history = historyBySymbol.get(symbol);
    if (!history || history.length === 0) continue;
    const sortedHistory = [...history].sort((a, b) => a.date.localeCompare(b.date));

    const tradeDateMap = closeByTradeDateBySymbol.get(symbol);
    const cycles = splitIntoCycles(sortedHistory, calendarDays);
    const latestCycle = cycles[cycles.length - 1];
    const entryClose = latestCycle.entryClose;
    if (entryClose <= 0) continue;

    if (!tradeDateMap || tradeDateMap.size === 0) continue;

    const sortedTradeDates = [...tradeDateMap.keys()].filter((d) => d >= latestCycle.entryDate).sort();
    if (sortedTradeDates.length === 0) continue;

    // daysAfter(경과 거래일수)는 "실제 가격 데이터가 있는 마지막 날짜"까지 거래일 캘린더로
    // 센다(Phase 42 5단계) — currentClose 등 가격 계산은 그대로 실제 저장된 행(sortedTradeDates)
    // 기준이되, 라벨인 daysAfter만 중간 공백을 반영해 정확히 계산한다.
    const lastAvailableDate = sortedTradeDates[sortedTradeDates.length - 1];
    const daysAfterRange = calendarDays.filter((d) => d >= latestCycle.entryDate && d <= lastAvailableDate);
    const daysAfter = daysAfterRange.length > 0 ? daysAfterRange.length - 1 : sortedTradeDates.length - 1;
    const currentClose = Number(tradeDateMap.get(lastAvailableDate) || 0);
    // 최신 종가로 수익률을 내므로 합친 시계열 끝까지의 이벤트를 본다. 비율이 확인된 건은 가격을 같은 기준으로
    // 맞춰 계산하고(DB 값은 그대로), 확인되지 않은 건은 기준이 달라 수익률·판정을 내지 않는다.
    const cycleActions = findCorporateActionsInRange(symbol, latestCycle.entryDate, lastAvailableDate);
    const corporateAction = cycleActions.find((a) => !a.adjustment) ?? null;
    const adjustedCloseAt = (d: string) => Number(tradeDateMap.get(d) || 0) * priceAdjustmentFactor(symbol, d);
    const entryBasis = entryClose * priceAdjustmentFactor(symbol, latestCycle.entryDate);
    const returnAt = (d: string) => ((adjustedCloseAt(d) - entryBasis) / entryBasis) * 100;
    const returnPct = corporateAction ? null : Number(returnAt(lastAvailableDate).toFixed(2));

    let verdict: Verdict | null;
    if (returnPct === null) {
      verdict = null;
    } else if (daysAfter < 2) {
      verdict = "watching";
    } else if (returnPct <= -10) {
      verdict = "stopLoss";
    } else if (returnPct >= 10) {
      verdict = "hold";
    } else {
      verdict = "neutral";
    }

    const returnSeries = sortedTradeDates.map(returnAt);
    const maxReturnPct = corporateAction ? null : Number(Math.max(...returnSeries).toFixed(2));
    const minReturnPct = corporateAction ? null : Number(Math.min(...returnSeries).toFixed(2));

    let stage: "primary" | "secondary" | "ended";
    if (daysAfter <= PRIMARY_STAGE_DAYS_AFTER) stage = "primary";
    else if (daysAfter <= CYCLE_RESET_DAYS_AFTER) stage = "secondary";
    else stage = "ended";

    items.push({
      symbol,
      name: latestCycle.name,
      discoveryDate: latestCycle.entryDate,
      daysAfter,
      // 보정한 건은 화면에서 현재가와 나란히 보이므로 현재가 기준으로 옮겨 내려보낸다
      entryClose: Math.round(entryBasis / priceAdjustmentFactor(symbol, lastAvailableDate)),
      currentClose,
      returnPct,
      verdict,
      corporateAction,
      corporateAdjustmentLabel: corporateAction ? null : corporateAdjustmentLabel(cycleActions),
      isFavorite: favoriteSymbols.has(symbol),
      captureCount: latestCycle.captures.length,
      captureDates: latestCycle.captures.map((h) => h.date),
      captureHistory: latestCycle.captures.map((h) => ({ date: h.date, entryClose: h.entryClose })),
      maxReturnPct,
      minReturnPct,
      stage,
      cycleNumber: latestCycle.cycleNumber,
      priorCycleCount: cycles.length - 1,
      priorCycleEntryDates: cycles.slice(0, -1).map((c) => c.entryDate),
    });
  }

  // 정렬은 대표 행(종목) 기준으로 기존 규칙 유지
  const verdictOrder: Record<Verdict, number> = { stopLoss: 0, hold: 1, neutral: 2, watching: 3 };
  const orderOf = (v: Verdict | null) => (v === null ? 4 : verdictOrder[v]);
  items.sort((a, b) => {
    const vo = orderOf(a.verdict) - orderOf(b.verdict);
    if (vo !== 0) return vo;
    return b.discoveryDate.localeCompare(a.discoveryDate);
  });

  // 요약 건수는 "primary" 단계(0~10영업일, 매매 판단 유효기간)만 집계 — 4컬럼 칸반에 실제로
  // 보이는 것과 일치시켜, /overnight 진입 배지가 칸반과 다른 숫자를 보여주지 않게 한다.
  // 자본변동으로 판정이 없는 건은 빼고, 제외 건수는 단계와 무관하게 따로 낸다.
  const primaryItems = items.filter((i) => i.stage === "primary" && !i.corporateAction);
  const summary = {
    total: primaryItems.length,
    stopLoss: primaryItems.filter((i) => i.verdict === "stopLoss").length,
    hold: primaryItems.filter((i) => i.verdict === "hold").length,
    watching: primaryItems.filter((i) => i.verdict === "watching").length,
    corporateActionExcluded: items.filter((i) => i.corporateAction).length,
  };
  const stageCounts = {
    primary: primaryItems.length,
    secondary: items.filter((i) => i.stage === "secondary").length,
    ended: items.filter((i) => i.stage === "ended").length,
  };

  return NextResponse.json({ ok: true, summary, stageCounts, items, quantSignalItems, quantSignalStats, quantBreakdown, legacySample });
}
