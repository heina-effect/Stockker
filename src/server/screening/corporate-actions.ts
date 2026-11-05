import "server-only";

import { getDomesticStockDailyAdjustedRecent } from "@/server/kis/rest-client";
import { withRateLimitRetry } from "@/server/screening/rate-limit-retry";

// 자본변동 이벤트(2026-11-04 조사). 궤적은 비수정주가로 쌓이므로 병합·권리락 전후의 종가를 그대로
// 이으면 수익률이 끊긴다(docs/release/known-issues.md "수정주가는 저장 시점의 조정 상태 스냅샷이다").
// date 는 KIS 수정주가·비수정주가 종가가 같아지는 첫 거래일, flngClsCode 는 그날 KIS flng_cls_code 다.
// 비율은 DART 공시로 확인한 값만 넣고, rceptNo 가 그 출처다. 확인되지 않은 이벤트는 adjustment 를
// null 로 두고 추정값을 넣지 않는다 — 그런 건은 수익률을 계산하지 않는다.
// 새 이벤트는 아래 재발 감지 경고를 보고 사람이 이 목록에 추가한다.
export type CorporateAdjustment =
  | { kind: "merge"; ratio: number } // ratio:1 병합 — 이벤트 전 가격 × ratio
  | { kind: "rights"; reason: string; basePrice: number; prevClose: number }; // 권리락 — 이벤트 전 가격 × 기준가 / 전일 종가

export interface CorporateAction {
  symbol: string;
  date: string; // YYYYMMDD
  flngClsCode: string;
  adjustment: CorporateAdjustment | null;
  rceptNo: string | null;
}

export const CORPORATE_ACTIONS: readonly CorporateAction[] = [
  // 유상증자 권리락. 기준가 1,851
  { symbol: "321370", date: "20260707", flngClsCode: "01", rceptNo: "20260706900837",
    adjustment: { kind: "rights", reason: "유상증자", basePrice: 1851, prevClose: 2040 } },
  { symbol: "001210", date: "20260731", flngClsCode: "00", rceptNo: "20260522800301",
    adjustment: { kind: "merge", ratio: 5 } },
  // 무상증자 권리락. 1주당 0.3주, 기준가 267,000
  { symbol: "196170", date: "20260805", flngClsCode: "01", rceptNo: "20260804900582",
    adjustment: { kind: "rights", reason: "무상증자", basePrice: 267000, prevClose: 347000 } },
  { symbol: "062970", date: "20260807", flngClsCode: "00", rceptNo: "20260511900760",
    adjustment: { kind: "merge", ratio: 2 } },
  { symbol: "090410", date: "20260831", flngClsCode: "00", rceptNo: "20260727900571",
    adjustment: { kind: "merge", ratio: 5 } },
  { symbol: "225190", date: "20260928", flngClsCode: "00", rceptNo: "20260707900232",
    adjustment: { kind: "merge", ratio: 5 } },
  // 공시 미확인 — 비율 없음
  { symbol: "207940", date: "20261002", flngClsCode: "01", rceptNo: null, adjustment: null },
  { symbol: "368600", date: "20261022", flngClsCode: "00", rceptNo: "20260930900497",
    adjustment: { kind: "merge", ratio: 5 } },
  { symbol: "018000", date: "20261104", flngClsCode: "00", rceptNo: "20260908900495",
    adjustment: { kind: "merge", ratio: 5 } },
];

// entryDate 다음 날부터 lastDate 까지의 이벤트. entryDate 당일 이벤트는 진입가가 이미 변경 후 기준이라
// 해당하지 않는다.
export function findCorporateActionsInRange(
  symbol: string,
  entryDate: string,
  lastDate: string,
  actions: readonly CorporateAction[] = CORPORATE_ACTIONS
): CorporateAction[] {
  return actions.filter((a) => a.symbol === symbol && a.date > entryDate && a.date <= lastDate);
}

function priceFactor(adjustment: CorporateAdjustment): number {
  return adjustment.kind === "merge" ? adjustment.ratio : adjustment.basePrice / adjustment.prevClose;
}

// date 의 저장 가격(비수정주가)을 최신 기준으로 옮기는 배율 — date 뒤에 있는 비율 확인 이벤트의 곱이다.
// 수익률은 두 날짜 가격에 각자의 배율을 곱해 구하므로, 두 날짜 뒤의 이벤트는 서로 지워진다.
export function priceAdjustmentFactor(
  symbol: string,
  date: string,
  actions: readonly CorporateAction[] = CORPORATE_ACTIONS
): number {
  let factor = 1;
  for (const a of actions) {
    if (a.symbol === symbol && a.adjustment && a.date > date) factor *= priceFactor(a.adjustment);
  }
  return factor;
}

// 화면 표시용 이름. 예) "5:1", "권리락 무상증자"
export function corporateAdjustmentLabel(actions: readonly CorporateAction[]): string | null {
  const labels = actions.flatMap((a) => {
    if (!a.adjustment) return [];
    return a.adjustment.kind === "merge" ? [`${a.adjustment.ratio}:1`] : [`권리락 ${a.adjustment.reason}`];
  });
  return labels.length > 0 ? labels.join(", ") : null;
}

// A트랙 한 건의 수익률 계산이 실제로 읽는 마지막 날짜. validDates 는 거래정지로 끊긴 뒤의 유효 구간이다.
// day3 판정 전이면 판정할 값이 없어 유효 구간 끝, day3 수익률이 peakThresholdPct 이상이면 최고점 청산
// 상한이 유효 구간 전체를 보므로 그 끝, 아니면 0~observationEndDays 창의 끝이다.
export function lastDateUsedByQuantItem(
  validDates: string[],
  day3ReturnPct: number | null,
  observationEndDays: number,
  peakThresholdPct: number
): string {
  const last = validDates[validDates.length - 1];
  if (day3ReturnPct === null || day3ReturnPct >= peakThresholdPct) return last;
  return validDates[Math.min(observationEndDays, validDates.length - 1)];
}

export interface AdjustedRawGap {
  symbol: string;
  date: string; // 두 기준 종가가 다른 가장 늦은 거래일
  adjustedClose: number;
  rawClose: number;
}

type DailyCandle = { stck_bsop_date?: unknown; stck_clpr?: unknown };

// 같은 거래일의 수정주가·비수정주가 종가를 비교해 가장 늦은 차이를 찾는다. 당일 봉은 조회 시점이 달라
// 잠정값끼리 어긋날 수 있어 뺀다. mod_yn 은 쓰지 않는다 — 조사한 9종목이 전부 N 이었다.
export function findLatestAdjustedRawGap(
  symbol: string,
  rawCandles: DailyCandle[],
  adjustedCandles: DailyCandle[],
  todayKey: string
): AdjustedRawGap | null {
  const rawByDate = new Map(rawCandles.map((c) => [String(c.stck_bsop_date), Number(c.stck_clpr || 0)]));
  let latest: AdjustedRawGap | null = null;
  for (const c of adjustedCandles) {
    const date = String(c.stck_bsop_date);
    if (date >= todayKey) continue;
    const adjustedClose = Number(c.stck_clpr || 0);
    const rawClose = rawByDate.get(date);
    if (rawClose === undefined || rawClose <= 0 || adjustedClose <= 0 || rawClose === adjustedClose) continue;
    if (!latest || date > latest.date) latest = { symbol, date, adjustedClose, rawClose };
  }
  return latest;
}

// 궤적 저장 뒤 검사 — 고치지 않고 경고만 남긴다. 목록에 있는 이벤트로 설명되는 차이는 건너뛰고,
// 조회 실패도 경고만 남긴다(entry-invariant.ts 와 같은 방식).
export async function warnUnknownCorporateActions(
  rawCandlesBySymbol: Map<string, DailyCandle[]>,
  todayKey: string,
  source: string
): Promise<AdjustedRawGap[]> {
  const found: AdjustedRawGap[] = [];
  for (const [symbol, rawCandles] of rawCandlesBySymbol) {
    try {
      const adjusted = await withRateLimitRetry(() => getDomesticStockDailyAdjustedRecent(symbol, todayKey));
      const gap = findLatestAdjustedRawGap(symbol, rawCandles, adjusted, todayKey);
      if (!gap) continue;
      if (CORPORATE_ACTIONS.some((a) => a.symbol === symbol && a.date > gap.date)) continue;
      found.push(gap);
      console.warn(
        `[Corporate Action] ${source}: 수정주가 ${gap.adjustedClose} ≠ 비수정주가 ${gap.rawClose} (${symbol} ${gap.date}) — ` +
          `자본변동 목록에 없음, CORPORATE_ACTIONS 추가 필요`
      );
    } catch (e) {
      console.warn(`[Corporate Action] ${source}: ${symbol} 검사 실패 —`, (e as Error)?.message || e);
    }
  }
  return found;
}
