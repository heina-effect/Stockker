import { describe, expect, it } from "vitest";
import { formatGapPct, maArrangement, maGaps } from "./market-state";

describe("시장 상태 카드 계산", () => {
  const kosdaq = { ma5: 743.99, ma20: 809.16, ma60: 819.68, ma120: 886.02 };

  it("괴리율은 지수 대비 (지수/이평 − 1)", () => {
    expect(maGaps(724.38, kosdaq).map((g) => formatGapPct(g.gapPct))).toEqual(["−2.6%", "−10.5%", "−11.6%", "−18.2%"]);
  });

  it("배열은 정배열·역배열·혼조 세 상태", () => {
    expect(maArrangement(kosdaq)).toBe("역배열");
    expect(maArrangement({ ma5: 4, ma20: 3, ma60: 2, ma120: 1 })).toBe("정배열");
    expect(maArrangement({ ma5: 3, ma20: 4, ma60: 2, ma120: 1 })).toBe("혼조");
  });

  it("이평선이 없으면 만들지 않는다", () => {
    expect(maGaps(724.38, null)).toEqual([]);
    expect(maArrangement(null)).toBeNull();
    expect(maArrangement({ ma5: 4, ma20: 0, ma60: 2, ma120: 1 })).toBeNull();
    expect(maGaps(724.38, { ma5: 700, ma20: 0, ma60: 0, ma120: 0 }).map((g) => g.period)).toEqual([5]);
  });

  it("양수는 +, 0 은 부호 없음", () => {
    expect(formatGapPct(1.04)).toBe("+1.0%");
    expect(formatGapPct(-0.01)).toBe("0.0%");
  });
});
