import { describe, expect, it } from "vitest";

import { isQuantBackfillConfirmed, planQuantSignalBackfill } from "./quant-signal-backfill";

describe("planQuantSignalBackfill", () => {
  it("대상 행과 바뀌는 quant_signal·rsi14 건수를 센다", () => {
    const plan = planQuantSignalBackfill(
      [
        { date: "20261001", symbol: "A", rsi14: 70, quant_signal: false }, // false→true
        { date: "20261001", symbol: "B", rsi14: 55, quant_signal: true }, // true→false, rsi14 지워짐
        { date: "20261001", symbol: "C", rsi14: "55.5", quant_signal: true }, // 그대로
        { date: "20261001", symbol: "D", rsi14: null, quant_signal: false }, // day0 없음
      ],
      new Map([
        ["A::20261001", { rsi14: 55, vol_ratio_20: 300 }],
        ["B::20261001", { rsi14: null, vol_ratio_20: 300 }],
        ["C::20261001", { rsi14: 55.5, vol_ratio_20: 300 }],
      ])
    );
    expect(plan).toMatchObject({
      totalTargets: 4,
      skipped: 1,
      quantSignalChanged: 2,
      falseToTrue: 1,
      trueToFalse: 1,
      rsi14Changed: 2,
      rsi14ToNull: 1,
    });
    expect(plan.updates).toHaveLength(3);
  });
});

describe("isQuantBackfillConfirmed", () => {
  it("apply 와 대상 행 수가 모두 맞아야 쓴다", () => {
    expect(isQuantBackfillConfirmed({}, 10)).toBe(false);
    expect(isQuantBackfillConfirmed({ apply: true }, 10)).toBe(false);
    expect(isQuantBackfillConfirmed({ apply: true, confirmTargetCount: 9 }, 10)).toBe(false);
    expect(isQuantBackfillConfirmed({ confirmTargetCount: 10 }, 10)).toBe(false);
    expect(isQuantBackfillConfirmed({ apply: true, confirmTargetCount: 10 }, 10)).toBe(true);
  });
});
