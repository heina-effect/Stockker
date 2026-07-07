import "server-only";

/**
 * 일봉 배열(최신순, 인덱스 0 = 최신)에서 entryDate 다음 거래일의 시가/저가를 찾는다.
 * KIS 일봉은 거래소 휴장일(주말/공휴일)을 자동으로 건너뛰므로 별도 캘린더 계산이 불필요하다.
 *
 * - entryDate를 찾지 못하면(데이터 범위 밖) null 반환 → pending 처리
 * - entryDate가 배열의 최신봉(idx 0)이면 다음 거래일이 아직 미도래 → null 반환 → pending 처리
 */
export function findNextTradingDay(
  dailyCandles: any[],
  entryDate: string
): { nextOpen: number; nextClose: number; nextLow: number; nextDate: string } | null {
  const idx = dailyCandles.findIndex((c) => String(c.stck_bsop_date) === entryDate);
  if (idx <= 0) return null;
  const nextCandle = dailyCandles[idx - 1];
  return {
    nextOpen: Number(nextCandle.stck_oprc || 0),
    nextClose: Number(nextCandle.stck_clpr || 0),
    nextLow: Number(nextCandle.stck_lwpr || 0),
    nextDate: String(nextCandle.stck_bsop_date || ""),
  };
}

export type TrendLabel = "추세지속" | "시가최고" | "갭상후역전" | "시가후회복" | "하락지속";

export function classifyTrend(openReturn: number, closeReturn: number): TrendLabel {
  if (openReturn > 0 && closeReturn > openReturn)  return "추세지속";
  if (openReturn > 0 && closeReturn >= 0)          return "시가최고";
  if (openReturn > 0 && closeReturn < 0)           return "갭상후역전";
  if (openReturn <= 0 && closeReturn > 0)          return "시가후회복";
  return "하락지속";
}

// YYYYMMDD 문자열 간 1일 단위 반복을 위한 헬퍼 (달력일 기준, 거래일 필터링은 호출부에서 데이터 유무로 판단)
export function* iterateDateRange(from: string, to: string): Generator<string> {
  const parse = (s: string) => new Date(Date.UTC(Number(s.slice(0, 4)), Number(s.slice(4, 6)) - 1, Number(s.slice(6, 8))));
  const fmt = (d: Date) => {
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, "0");
    const day = String(d.getUTCDate()).padStart(2, "0");
    return `${y}${m}${day}`;
  };
  let cur = parse(from);
  const end = parse(to);
  while (cur.getTime() <= end.getTime()) {
    yield fmt(cur);
    cur = new Date(cur.getTime() + 24 * 60 * 60 * 1000);
  }
}
