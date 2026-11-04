import "server-only";

import { getDomesticStockDailyAdjustedRecent } from "@/server/kis/rest-client";
import { withRateLimitRetry } from "@/server/screening/rate-limit-retry";

// 자본변동 이벤트(2026-11-04 조사). 궤적은 비수정주가로 쌓이므로 병합·권리락 전후의 종가를 그대로
// 이으면 수익률이 끊긴다(docs/release/known-issues.md "수정주가는 저장 시점의 조정 상태 스냅샷이다").
// date 는 KIS 수정주가·비수정주가 종가가 같아지는 첫 거래일, flngClsCode 는 그날 KIS flng_cls_code 다.
// DART 공시로 비율 미확인, 추정값을 넣지 않는다.
// 새 이벤트는 아래 재발 감지 경고를 보고 사람이 이 목록에 추가한다.
export interface CorporateAction {
  symbol: string;
  date: string; // YYYYMMDD
  flngClsCode: string;
}

export const CORPORATE_ACTIONS: readonly CorporateAction[] = [
  { symbol: "321370", date: "20260707", flngClsCode: "01" },
  { symbol: "001210", date: "20260731", flngClsCode: "00" },
  { symbol: "196170", date: "20260805", flngClsCode: "01" },
  { symbol: "062970", date: "20260807", flngClsCode: "00" },
  { symbol: "090410", date: "20260831", flngClsCode: "00" },
  { symbol: "225190", date: "20260928", flngClsCode: "00" },
  { symbol: "207940", date: "20261002", flngClsCode: "01" },
  { symbol: "368600", date: "20261022", flngClsCode: "00" },
  { symbol: "018000", date: "20261104", flngClsCode: "00" },
];

// entryDate 다음 날부터 lastDate 까지 이벤트가 있으면 돌려준다. entryDate 당일 이벤트는 진입가가 이미
// 변경 후 기준이라 해당하지 않는다.
export function findCorporateActionInRange(
  symbol: string,
  entryDate: string,
  lastDate: string,
  actions: readonly CorporateAction[] = CORPORATE_ACTIONS
): CorporateAction | null {
  return actions.find((a) => a.symbol === symbol && a.date > entryDate && a.date <= lastDate) ?? null;
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
