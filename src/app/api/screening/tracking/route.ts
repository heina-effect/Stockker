import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/client";
import { formatKSTDateCompact } from "@/server/screening/storage";
import { fetchAllRows } from "@/server/screening/paginate";

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

// 퀀트 신호 트래커(A)와 전체 관찰 칸반(B)은 완전히 분리된 별도 체계다. quant_signal=true인
// 발굴 건은 quant_signal 여부와 무관한 B의 판정 로직(verdict)과 절대 섞이지 않고, A에서
// daysAfter와 무관하게 영구히(발생 시점부터 계속) 추적된다.
//
// QUANT_SIGNAL_FRESH_DAYS: A 트랙 내에서 "판단 대기"(신호 발생 후 이 값 미만 경과, RSI/거래량만
// 표시)와 "결과 확인 중"(이 값 이상 경과, 3일차 확정 수익률+현재까지 최고수익률 표시)을 가르는
// 기준. 여기서 daysAfter는 4컬럼의 "최초 등장" 기준이 아니라, quant_signal이 뜬 "그 발굴 건"
// 자체의 경과일이다(RSI/거래량 조건은 그날의 스냅샷이므로, 신호가 뜬 날로부터 며칠 지났는지가
// 기준). "3일차 규칙" 승률/손익비/기대값 계산은 이 상수를 그대로 쓰며 이번 변경 대상이 아니다.
const QUANT_SIGNAL_FRESH_DAYS = 3;

// QUANT_OBSERVATION_END_DAYS_AFTER: A 트랙(퀀트 신호 트래커)의 "관찰 종료" 판정 기준(2026-09-18
// 수정). 원래 daysAfter>=30(B트랙의 CYCLE_RESET_DAYS_AFTER와 같은 값을 착오로 재사용)이었으나,
// 9/9 확정한 실전 관리 규칙("3일차 판정 후 +10%면 최대 2주(약 10영업일) 보유")과 맞지 않아
// 10영업일로 수정한다. B트랙의 PRIMARY_STAGE_DAYS_AFTER(값은 우연히 같은 10이지만 목적이 다름 —
// 스크리닝 재노출 관리용)와는 완전히 별개 상수이며 절대 공유하지 않는다.
const QUANT_OBSERVATION_END_DAYS_AFTER = 10;

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
  // overnight_screening_items의 quant_signal=true 전체 이력(기간 제한 없음)을 대상으로 하며,
  // 같은 symbol이 여러 번 신호를 냈어도 각 발굴 건을 독립된 신호 이벤트로 전부 추적한다
  // (대표 1건만 뽑지 않음 — "이 조건이 실제로 맞는지" 검증이 목적이라 매 발생이 독립 표본).
  // 한 번 이 트랙에 들어온 건은 daysAfter가 얼마든 영구히 여기서만 표시된다.
  // ============================================================================
  let quantSignalRows: {
    symbol: string;
    name: string;
    discovery_date: string;
    close: number;
    rsi14: number | null;
    vol_ratio_20: number | null;
  }[];
  try {
    quantSignalRows = await fetchAllRows<{
      symbol: string;
      name: string;
      discovery_date: string;
      close: number;
      rsi14: number | null;
      vol_ratio_20: number | null;
    }>((from, to) =>
      supabase
        .from("stock_trajectory")
        .select("symbol,name,discovery_date,close,rsi14,vol_ratio_20")
        .eq("days_after", 0)
        .gte("rsi14", 50)
        .lte("rsi14", 60)
        .gte("vol_ratio_20", 200)
        .lte("vol_ratio_20", 400)
        .order("symbol", { ascending: true })
        .order("discovery_date", { ascending: true })
        .range(from, to)
    );
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 });
  }

  // quant_signal 종목들의 stock_trajectory를 discovery_date 구분 없이 전부 모아 symbol별
  // trade_date → close 맵을 만든다(4컬럼과 동일한 원리 — 개별 발굴 건의 궤적은 15영업일 갱신
  // 후 멈추므로, 그 symbol의 다른 재발굴 궤적들을 이어붙여야 오늘까지의 실제가가 빠짐없이 채워짐).
  // B의 trackedSymbols(15영업일 게이트를 통과한 것)와 무관하게 독립적으로 조회한다 — A는 게이트가
  // 없기 때문이다.
  const dataByTradeDateForQuant = new Map<
    string,
    Map<string, { close: number; isHalted: boolean; volRatio20: number | null }>
  >();
  if (quantSignalRows.length > 0) {
    const quantSymbols = [...new Set(quantSignalRows.map((r) => r.symbol))];
    let quantMinDate = todayKey;
    for (const r of quantSignalRows) if (r.discovery_date < quantMinDate) quantMinDate = r.discovery_date;

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
    day3ReturnPct: number | null;
    maxReturnSoFarPct: number | null; // 2026-09-18: 계산 창을 0~QUANT_OBSERVATION_END_DAYS_AFTER(10)일로 축소
    realizedReturnPct: number | null; // 3일차 규칙(승률용) — 이번 변경과 무관, 그대로 유지
    endDate: string | null; // daysAfter>=10 도달 시: day10 시점 거래일(종료일자, 고정값)
    endClose: number | null; // daysAfter>=10 도달 시: day10 시점 종가(종료가, 고정값)
    endReturnPct: number | null; // (endClose-entryClose)/entryClose — 카드에 표시하는 "실현수익률"
    haltStartDaysAfter: number | null;
    isValidForStats: boolean; // 3일차 규칙 평가가 가능한지 여부 (haltStartDaysAfter > 3 또는 null)
    isRecentlyActive: boolean; // 관찰 지속성 보조표시(§1, 참고용 — 규칙 아님). daysAfter<30이면 항상 false.
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
    const currentClose = tradeDateMap.get(validDatesForReturn[validDatesForReturn.length - 1])!.close;
    const group: "pending" | "result" = validDatesForReturn.length - 1 < QUANT_SIGNAL_FRESH_DAYS ? "pending" : "result";

    let day3ReturnPct: number | null = null;
    let maxReturnSoFarPct: number | null = null;
    let realizedReturnPct: number | null = null;
    let endDate: string | null = null;
    let endClose: number | null = null;
    let endReturnPct: number | null = null;

    if (group === "result") {
      const day3Close = tradeDateMap.get(validDatesForReturn[QUANT_SIGNAL_FRESH_DAYS])!.close;
      day3ReturnPct = Number((((day3Close - entryClose) / entryClose) * 100).toFixed(2));

      // 최고수익률(MFE) 계산 창 — 2026-09-18 수정: 0~30일(과거 MFE/MAE 통계 측정창을 착오로
      // 재사용)에서 0~QUANT_OBSERVATION_END_DAYS_AFTER(10)일로 축소. "관찰 중"이든 "관찰 종료"든
      // 항상 day10을 넘는 데이터는 참조하지 않는다(halt로 그 전에 끊겼으면 그 지점까지만).
      const mfeWindowLen = Math.min(validDatesForReturn.length, QUANT_OBSERVATION_END_DAYS_AFTER + 1);
      const mfeWindowDates = validDatesForReturn.slice(0, mfeWindowLen);
      const returnSeries = mfeWindowDates.map((d) => {
        const c = tradeDateMap.get(d)!.close;
        return ((c - entryClose) / entryClose) * 100;
      });
      maxReturnSoFarPct = Number(Math.max(...returnSeries).toFixed(2));

      if (day3ReturnPct >= 10) {
        const afterDay3Series = validDatesForReturn.slice(QUANT_SIGNAL_FRESH_DAYS).map((d) => {
          const c = tradeDateMap.get(d)!.close;
          return ((c - entryClose) / entryClose) * 100;
        });
        realizedReturnPct = Number(Math.max(...afterDay3Series).toFixed(2));
      } else {
        realizedReturnPct = day3ReturnPct;
      }

      // 종료가/종료일자(§2-2,3) — day10(QUANT_OBSERVATION_END_DAYS_AFTER) 시점 데이터가 halt 없이
      // 유효하게 존재할 때만 고정값을 채운다. 아직 도달 전이거나 halt로 그 전에 끊겼으면 null로
      // 남겨 프런트에서 "관찰 중" 상태(현재가 계속 갱신)로 자연스럽게 폴백하도록 한다.
      if (validDatesForReturn.length - 1 >= QUANT_OBSERVATION_END_DAYS_AFTER) {
        endDate = validDatesForReturn[QUANT_OBSERVATION_END_DAYS_AFTER];
        endClose = tradeDateMap.get(endDate)!.close;
        endReturnPct = Number((((endClose - entryClose) / entryClose) * 100).toFixed(2));
      }
    }

    // 관찰 지속성 보조표시(§1) — "관찰 종료"(daysAfter>=30) 카드에만 해당. day26~30 구간의
    // 등락폭(recent_range)과 평균 거래량비율(recent_vol)로 "최근에도 변동성 지속 중"인지 참고
    // 판단한다. 승/패 판정이나 집계 통계와는 무관한 순수 참고 표시 — 3일차 규칙 계산에 영향 없음.
    let isRecentlyActive = false;
    if (daysAfter >= 30) {
      const windowDates = sortedDates.slice(26, 31); // days_after 26~30(최근 5거래일)
      if (windowDates.length > 0) {
        const windowReturns = windowDates.map((d) => {
          const c = tradeDateMap.get(d)!.close;
          return ((c - entryClose) / entryClose) * 100;
        });
        const recentRange = Math.max(...windowReturns) - Math.min(...windowReturns);
        const volValues = windowDates
          .map((d) => tradeDateMap.get(d)!.volRatio20)
          .filter((v): v is number => v != null);
        const recentVol = volValues.length > 0 ? volValues.reduce((a, b) => a + b, 0) / volValues.length : 0;
        isRecentlyActive = recentRange >= 10 || recentVol >= 100;
      }
    }

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
      realizedReturnPct,
      endDate,
      endClose,
      endReturnPct,
      haltStartDaysAfter,
      isValidForStats,
      isRecentlyActive,
    });
  }
  quantSignalItems.sort((a, b) => b.discoveryDate.localeCompare(a.discoveryDate));

  // 누적 통계는 결과가 확정된(3일차 이상 경과) 건 중, 3일차 이내 거래정지가 발생하지 않은 건만 대상
  const resultItems = quantSignalItems.filter((i) => i.group === "result" && i.isValidForStats);
  const avgDay3ReturnPct =
    resultItems.length > 0
      ? Number(
          (resultItems.reduce((sum, i) => sum + (i.day3ReturnPct as number), 0) / resultItems.length).toFixed(2)
        )
      : null;
  const avgMaxReturnSoFarPct =
    resultItems.length > 0
      ? Number(
          (resultItems.reduce((sum, i) => sum + (i.maxReturnSoFarPct as number), 0) / resultItems.length).toFixed(2)
        )
      : null;

  // 헤드라인 승률 — 3일차 규칙 실현손익 시뮬레이션(realizedReturnPct) 기준.
  const realizedWinCount = resultItems.filter((i) => (i.realizedReturnPct as number) > 0).length;
  const realizedLossCount = resultItems.length - realizedWinCount;
  const realizedWinRatePct =
    resultItems.length > 0 ? Number(((realizedWinCount / resultItems.length) * 100).toFixed(1)) : null;

  // 손익비 (Profit Factor) 및 기대값 (Expectancy)
  let grossProfit = 0;
  let grossLoss = 0;
  for (const item of resultItems) {
    const r = item.realizedReturnPct as number;
    if (r > 0) grossProfit += r;
    else if (r < 0) grossLoss += Math.abs(r);
  }
  
  const profitFactor = grossLoss > 0 ? Number((grossProfit / grossLoss).toFixed(2)) : (grossProfit > 0 ? 99.99 : 0);
  const expectancy = resultItems.length > 0 ? Number(((grossProfit - grossLoss) / resultItems.length).toFixed(2)) : 0;

  // 신뢰도 배지용 표본 크기 (승패 검증이 가능한 종목만)
  const quantSignalSampleSymbolCount = new Set(resultItems.map((r) => r.symbol)).size;

  const quantSignalStats = {
    totalCount: quantSignalItems.length,
    resultCount: resultItems.length,
    avgDay3ReturnPct,
    avgMaxReturnSoFarPct,
    realizedWinCount,
    realizedLossCount,
    realizedWinRatePct,
    profitFactor,
    expectancy,
    sampleSymbolCount: quantSignalSampleSymbolCount,
  };

  if (trackedSymbols.length === 0) {
    return NextResponse.json({
      ok: true,
      summary: { total: 0, stopLoss: 0, hold: 0, watching: 0 },
      stageCounts: { primary: 0, secondary: 0, ended: 0 },
      items: [],
      quantSignalItems,
      quantSignalStats,
    });
  }

  // 2단계: 최초 등장일 중 가장 이른 날짜를 구해, stock_trajectory 조회의 trade_date 하한으로
  // 써서 불필요한 포착일 이전(-60일 히스토리용) 행을 걸러낸다.
  let globalMinFirstDate = todayKey;
  for (const list of historyBySymbol.values()) {
    const first = list.reduce((a, b) => (b.date < a.date ? b : a));
    if (first.date < globalMinFirstDate) globalMinFirstDate = first.date;
  }

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

  function splitIntoCycles(sortedHistory: CycleCapture[], tradeDateMap: Map<string, number> | undefined): Cycle[] {
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
      // 현재 사이클 시작일부터 이 재등장까지의 실제 거래일 경과(daysAfter)를 계산한다.
      // trade_date 맵에 아직 반영되지 않은 극히 드문 경우(당일 갱신 전)는 gap=0으로 보아
      // 안전하게 같은 사이클로 유지한다(오탐으로 사이클을 조기 리셋하지 않도록).
      let gapDaysAfter = 0;
      if (tradeDateMap) {
        const inRange = [...tradeDateMap.keys()].filter((d) => d >= current!.entryDate && d <= capture.date).sort();
        if (inRange.length > 0) gapDaysAfter = inRange.length - 1;
      }
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
    returnPct: number;
    verdict: Verdict;
    isFavorite: boolean;
    captureCount: number;
    captureDates: string[];
    captureHistory: { date: string; entryClose: number }[];
    maxReturnPct: number;
    minReturnPct: number;
    stage: "primary" | "secondary" | "ended";
    cycleNumber: number;
    priorCycleCount: number;
  }[] = [];

  for (const symbol of trackedSymbols) {
    const history = historyBySymbol.get(symbol);
    if (!history || history.length === 0) continue;
    const sortedHistory = [...history].sort((a, b) => a.date.localeCompare(b.date));

    const tradeDateMap = closeByTradeDateBySymbol.get(symbol);
    const cycles = splitIntoCycles(sortedHistory, tradeDateMap);
    const latestCycle = cycles[cycles.length - 1];
    const entryClose = latestCycle.entryClose;
    if (entryClose <= 0) continue;

    if (!tradeDateMap || tradeDateMap.size === 0) continue;

    const sortedTradeDates = [...tradeDateMap.keys()].filter((d) => d >= latestCycle.entryDate).sort();
    if (sortedTradeDates.length === 0) continue;

    const daysAfter = sortedTradeDates.length - 1; // 현재 사이클 entryDate 자체가 0일차
    const currentClose = Number(tradeDateMap.get(sortedTradeDates[sortedTradeDates.length - 1]) || 0);
    const returnPct = Number((((currentClose - entryClose) / entryClose) * 100).toFixed(2));

    let verdict: Verdict;
    if (daysAfter < 2) {
      verdict = "watching";
    } else if (returnPct <= -10) {
      verdict = "stopLoss";
    } else if (returnPct >= 10) {
      verdict = "hold";
    } else {
      verdict = "neutral";
    }

    const returnSeries = sortedTradeDates.map((d) => {
      const c = Number(tradeDateMap.get(d) || 0);
      return ((c - entryClose) / entryClose) * 100;
    });
    const maxReturnPct = Number(Math.max(...returnSeries).toFixed(2));
    const minReturnPct = Number(Math.min(...returnSeries).toFixed(2));

    let stage: "primary" | "secondary" | "ended";
    if (daysAfter <= PRIMARY_STAGE_DAYS_AFTER) stage = "primary";
    else if (daysAfter <= CYCLE_RESET_DAYS_AFTER) stage = "secondary";
    else stage = "ended";

    items.push({
      symbol,
      name: latestCycle.name,
      discoveryDate: latestCycle.entryDate,
      daysAfter,
      entryClose,
      currentClose,
      returnPct,
      verdict,
      isFavorite: favoriteSymbols.has(symbol),
      captureCount: latestCycle.captures.length,
      captureDates: latestCycle.captures.map((h) => h.date),
      captureHistory: latestCycle.captures.map((h) => ({ date: h.date, entryClose: h.entryClose })),
      maxReturnPct,
      minReturnPct,
      stage,
      cycleNumber: latestCycle.cycleNumber,
      priorCycleCount: cycles.length - 1,
    });
  }

  // 정렬은 대표 행(종목) 기준으로 기존 규칙 유지
  const verdictOrder: Record<Verdict, number> = { stopLoss: 0, hold: 1, neutral: 2, watching: 3 };
  items.sort((a, b) => {
    const vo = verdictOrder[a.verdict] - verdictOrder[b.verdict];
    if (vo !== 0) return vo;
    return b.discoveryDate.localeCompare(a.discoveryDate);
  });

  // 요약 건수는 "primary" 단계(0~10영업일, 매매 판단 유효기간)만 집계 — 4컬럼 칸반에 실제로
  // 보이는 것과 일치시켜, /overnight 진입 배지가 칸반과 다른 숫자를 보여주지 않게 한다.
  const primaryItems = items.filter((i) => i.stage === "primary");
  const summary = {
    total: primaryItems.length,
    stopLoss: primaryItems.filter((i) => i.verdict === "stopLoss").length,
    hold: primaryItems.filter((i) => i.verdict === "hold").length,
    watching: primaryItems.filter((i) => i.verdict === "watching").length,
  };
  const stageCounts = {
    primary: primaryItems.length,
    secondary: items.filter((i) => i.stage === "secondary").length,
    ended: items.filter((i) => i.stage === "ended").length,
  };

  return NextResponse.json({ ok: true, summary, stageCounts, items, quantSignalItems, quantSignalStats });
}
