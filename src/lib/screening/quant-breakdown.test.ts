import { describe, expect, it } from "vitest";
import { buildQuantBreakdown, computeExitStats, judgedTimeBucket } from "./quant-breakdown";

const COST = 0.257;
const item = (exitDay3Pct: number | null, volumeBasis = "incl_today", judgedAt = "2026-11-06T06:41:00Z") => ({ exitDay3Pct, volumeBasis, judgedAt });

describe("judgedTimeBucket", () => {
  it.each([
    ["2026-09-04T06:07:40Z", "15:30 이전"],
    ["2026-10-16T06:36:57Z", "15:30~15:40"],
    ["2026-11-06T06:40:00Z", "15:40~16:00"],
    ["2026-11-06T06:59:59Z", "15:40~16:00"],
    ["2026-11-06T07:00:00Z", "16시 이후"],
    ["2026-09-11T10:30:41Z", "16시 이후"],
  ])("%s → %s", (iso, bucket) => {
    expect(judgedTimeBucket(iso)).toBe(bucket);
  });
});

describe("buildQuantBreakdown", () => {
  // 11/6 저녁의 결과 10건과 대기 2건
  const values = [-4.98, -8.04, -12.31, 15.94, 33.95, -5.35, -4.63, -4.65, -11.14, 0.86];
  const items = [...values.map((v) => item(v)), item(null), item(null)];

  it("대기 건은 결과 집계에서 빠지고 건수에만 남는다", () => {
    const [all] = buildQuantBreakdown(items, COST).sensitivity;
    expect(all).toMatchObject({ total: 12 });
    expect(all.values).toHaveLength(10);
    expect(all.stats).toMatchObject({ n: 10, winCount: 3, lossCount: 7, winRatePct: 30, profitFactor: 0.99, expectancy: -0.04, kellyPct: -0.2 });
    expect(all.netExpectancy).toBe(-0.3);
  });

  it("최고·최저 제외 줄은 같은 산식으로 다시 계산한다", () => {
    const [, best, worst, both] = buildQuantBreakdown(items, COST).sensitivity;
    expect(best.stats?.expectancy).toBe(-3.81);
    expect(worst.stats?.expectancy).toBe(1.33);
    expect(both.stats?.expectancy).toBe(-2.75);
    expect(both.values).toHaveLength(8);
  });

  it("결과 5건 미만 구간은 통계를 내지 않고 개별 수익률만 남긴다", () => {
    const { byBasis, sensitivity } = buildQuantBreakdown(
      [item(1, "excl_today"), item(2, "excl_today"), item(null, "excl_today"), item(3), item(4), item(5), item(6), item(7)],
      COST
    );
    expect(byBasis[0]).toMatchObject({ total: 3, values: [1, 2], stats: null, netExpectancy: null });
    expect(byBasis[1].stats?.n).toBe(5);
    expect(sensitivity[3].values).toHaveLength(5);
    expect(sensitivity[3].stats).not.toBeNull();
  });

  it("결과가 적으면 제외 줄도 통계 불가이고 건수가 음수가 되지 않게 빈 값이다", () => {
    const rows = buildQuantBreakdown([item(1)], COST).sensitivity;
    expect(rows.map((r) => r.stats)).toEqual([null, null, null, null]);
    expect(rows[3].values).toEqual([]);
  });

  it("판정 시각으로 나눈다", () => {
    const { byTime } = buildQuantBreakdown(
      [item(1, "excl_today", "2026-09-04T06:07:40Z"), item(2, "incl_today", "2026-10-16T06:36:57Z"), item(3), item(4, "incl_today", "2026-10-19T07:19:49Z")],
      COST
    );
    expect(byTime.map((r) => [r.label, r.values])).toEqual([
      ["15:30 이전", [1]],
      ["15:30~15:40", [2]],
      ["15:40~16:00", [3]],
      ["16시 이후", [4]],
    ]);
  });
});

describe("computeExitStats", () => {
  it("0% 는 패로 센다", () => {
    expect(computeExitStats([1, 0])).toMatchObject({ winCount: 1, lossCount: 1 });
  });
});
