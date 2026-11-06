import { describe, expect, it } from "vitest";
import { buildQuantBreakdown, computeExitStats, findDuplicateSignals, judgedTimeBucket } from "./quant-breakdown";

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

describe("findDuplicateSignals", () => {
  const days = ["20261103", "20261104", "20261105", "20261106", "20261109", "20261110", "20261111", "20261112", "20261113", "20261116"];
  const signal = (discoveryDate: string, symbol = "035420") => ({ symbol, discoveryDate });
  const find = (...items: { symbol: string; discoveryDate: string }[]) => [...findDuplicateSignals(items, days, 3).entries()];

  it("보유 구간 안의 재신호는 중복이다", () => {
    expect(find(signal("20261105"), signal("20261106"))).toEqual([["035420::20261106", "20261105"]]);
  });

  it("3일차 당일의 재신호는 아직 지나지 않아 중복이다", () => {
    expect(find(signal("20261105"), signal("20261110"))).toEqual([["035420::20261110", "20261105"]]);
  });

  it("3일차가 지난 뒤의 재신호는 중복이 아니다", () => {
    expect(find(signal("20261105"), signal("20261111"))).toEqual([]);
  });

  it("주말을 건너 거래일로 센다", () => {
    expect(find(signal("20261106"), signal("20261111"))).toEqual([["035420::20261111", "20261106"]]);
    expect(find(signal("20261106"), signal("20261112"))).toEqual([]);
  });

  it("연속 신호는 보유 구간이 끝날 때마다 새로 센다", () => {
    const all = ["20261103", "20261104", "20261105", "20261106", "20261109", "20261110", "20261111"].map((d) => signal(d));
    expect(find(...all)).toEqual([
      ["035420::20261104", "20261103"],
      ["035420::20261105", "20261103"],
      ["035420::20261106", "20261103"],
      ["035420::20261110", "20261109"],
      ["035420::20261111", "20261109"],
    ]);
  });

  it("중복 건 뒤의 판단은 마지막으로 센 건 기준이다", () => {
    expect(find(signal("20261103"), signal("20261106"), signal("20261109"))).toEqual([["035420::20261106", "20261103"]]);
  });

  it("종목별로 따로 센다", () => {
    expect(find(signal("20261105"), signal("20261106", "000001"))).toEqual([]);
  });

  it("입력 순서와 무관하다", () => {
    expect(find(signal("20261106"), signal("20261105"))).toEqual([["035420::20261106", "20261105"]]);
  });

  it("당일이 캘린더에 아직 없어도 같게 센다", () => {
    expect([...findDuplicateSignals([signal("20261105"), signal("20261106")], ["20261105"], 3).keys()]).toEqual(["035420::20261106"]);
  });
});

describe("중복 신호와 집계", () => {
  const values = [-4.98, -8.04, -12.31, 15.94, 33.95, -5.35, -4.63, -4.65, -11.14, 0.86];
  const base = values.map((v) => item(v));

  it("중복 건은 모든 줄에서 빠지고 비교 줄에만 남는다", () => {
    const b = buildQuantBreakdown([...base, { ...item(99), duplicateOf: "20261105" }], COST);
    expect(b.sensitivity[0]).toMatchObject({ total: 10 });
    expect(b.sensitivity[0].stats?.expectancy).toBe(-0.04);
    expect(b.sensitivity[1].values).not.toContain(99);
    expect(b.byBasis[1].values).not.toContain(99);
    expect(b.byTime[2].values).not.toContain(99);
    expect(b.withDuplicates.values).toContain(99);
    expect(b).toMatchObject({ duplicateCount: 1, duplicateResultCount: 1 });
  });

  it("11/10·11/11 에 NAVER 결과가 들어와도 11/6 건은 집계에 안 들어간다", () => {
    const before = buildQuantBreakdown([...base, item(null), { ...item(null), duplicateOf: "20261105" }], COST);
    expect(before.sensitivity[0]).toMatchObject({ total: 11 });
    expect(before.sensitivity[0].stats?.n).toBe(10);
    expect(before).toMatchObject({ duplicateCount: 1, duplicateResultCount: 0 });

    const on1110 = buildQuantBreakdown([...base, item(5), { ...item(null), duplicateOf: "20261105" }], COST);
    expect(on1110.sensitivity[0].stats?.n).toBe(11);

    const on1111 = buildQuantBreakdown([...base, item(5), { ...item(7), duplicateOf: "20261105" }], COST);
    expect(on1111.sensitivity[0].stats?.n).toBe(11);
    expect(on1111.sensitivity[0].stats?.expectancy).toBe(on1110.sensitivity[0].stats?.expectancy);
    expect(on1111.withDuplicates.stats?.n).toBe(12);
    expect(on1111.duplicateResultCount).toBe(1);
  });
});

describe("computeExitStats", () => {
  it("0% 는 패로 센다", () => {
    expect(computeExitStats([1, 0])).toMatchObject({ winCount: 1, lossCount: 1 });
  });
});
