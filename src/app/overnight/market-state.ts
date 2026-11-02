// 시장 상태 카드 표시용 계산 — 지수 대비 이평선 괴리율과 배열 상태(2026-11-02).
// 좋고 나쁨을 판정하지 않는다. 값이 없는 이평선은 만들지 않고 빼고, 배열 상태는 네 개가 다 있을 때만 정한다.

export interface MAState {
  ma5: number;
  ma20: number;
  ma60: number;
  ma120: number;
}

export type MAArrangement = "정배열" | "역배열" | "혼조";

export interface MAGap {
  period: 5 | 20 | 60 | 120;
  ma: number;
  gapPct: number; // (지수 / 이평선 − 1) × 100
}

export function maGaps(value: number, ma: MAState | null | undefined): MAGap[] {
  if (!ma || !(value > 0)) return [];
  return ([[5, ma.ma5], [20, ma.ma20], [60, ma.ma60], [120, ma.ma120]] as const)
    .filter(([, v]) => typeof v === "number" && v > 0)
    .map(([period, v]) => ({ period, ma: v, gapPct: (value / v - 1) * 100 }));
}

// 5 > 20 > 60 > 120 정배열, 5 < 20 < 60 < 120 역배열, 그 밖은 혼조. 네 개 중 하나라도 없으면 null.
export function maArrangement(ma: MAState | null | undefined): MAArrangement | null {
  if (!ma) return null;
  const v = [ma.ma5, ma.ma20, ma.ma60, ma.ma120];
  if (!v.every((x) => typeof x === "number" && x > 0)) return null;
  if (v[0] > v[1] && v[1] > v[2] && v[2] > v[3]) return "정배열";
  if (v[0] < v[1] && v[1] < v[2] && v[2] < v[3]) return "역배열";
  return "혼조";
}

// 부호 표기 — 음수는 유니코드 마이너스(−)
export function formatGapPct(p: number): string {
  const r = Math.round(p * 10) / 10;
  if (r === 0) return "0.0%";
  return `${r > 0 ? "+" : "−"}${Math.abs(r).toFixed(1)}%`;
}
