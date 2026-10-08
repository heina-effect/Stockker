import "server-only";

// 퀀트 진입 조건(quantSignal) 임계값 — overnight/route.ts(일일 스크리닝)와
// backfill-quant-signal/route.ts(소급 재계산)가 반드시 동일한 값을 써야 한다.
// 갱신 이력: 2026-09-01 RSI 55~65(EMA 평활 기준, 폐기) → 2026-09-03 RSI 50~60(Wilder 평활 기준).
export const QUANT_SIGNAL_CRITERIA = {
  rsiMin: 50,
  rsiMax: 60,
  volumeRatioMin: 200,
  volumeRatioMax: 400,
} as const;

export function isQuantSignal(rsi14: number | null, volumeRatio: number | null): boolean {
  if (rsi14 === null || volumeRatio === null) return false;
  return (
    rsi14 >= QUANT_SIGNAL_CRITERIA.rsiMin &&
    rsi14 <= QUANT_SIGNAL_CRITERIA.rsiMax &&
    volumeRatio >= QUANT_SIGNAL_CRITERIA.volumeRatioMin &&
    volumeRatio <= QUANT_SIGNAL_CRITERIA.volumeRatioMax
  );
}
