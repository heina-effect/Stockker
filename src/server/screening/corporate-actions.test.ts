import { describe, expect, it, vi } from "vitest";

vi.mock("@/server/kis/rest-client", () => ({ getDomesticStockDailyAdjustedRecent: vi.fn() }));
vi.mock("@/server/screening/rate-limit-retry", () => ({ withRateLimitRetry: (fn: () => unknown) => fn() }));

import { getDomesticStockDailyAdjustedRecent } from "@/server/kis/rest-client";
import {
  CORPORATE_ACTIONS,
  corporateAdjustmentLabel,
  findCorporateActionsInRange,
  findLatestAdjustedRawGap,
  lastDateUsedByQuantItem,
  priceAdjustmentFactor,
  warnUnknownCorporateActions,
} from "./corporate-actions";

const bar = (date: string, close: number) => ({ stck_bsop_date: date, stck_clpr: String(close) });

describe("findCorporateActionsInRange", () => {
  const actions = [
    { symbol: "111111", date: "20260731", flngClsCode: "00", adjustment: { kind: "merge", ratio: 5 }, rceptNo: "1" },
  ] as const;
  const dates = (s: string, entry: string, last: string) =>
    findCorporateActionsInRange(s, entry, last, actions).map((a) => a.date);

  it("발굴일 뒤, 마지막 날짜까지의 이벤트를 찾는다", () => {
    expect(dates("111111", "20260707", "20260731")).toEqual(["20260731"]);
    expect(dates("111111", "20260707", "20260820")).toEqual(["20260731"]);
  });

  it("발굴일 당일·이전 이벤트와 마지막 날짜 이후 이벤트, 다른 종목은 해당하지 않는다", () => {
    expect(dates("111111", "20260731", "20260820")).toEqual([]);
    expect(dates("111111", "20260707", "20260730")).toEqual([]);
    expect(dates("222222", "20260707", "20260820")).toEqual([]);
  });
});

describe("등재한 이벤트", () => {
  it("207940 만 비율이 없고, 나머지는 접수번호가 있다", () => {
    expect(CORPORATE_ACTIONS).toHaveLength(9);
    expect(CORPORATE_ACTIONS.filter((a) => !a.adjustment).map((a) => a.symbol)).toEqual(["207940"]);
    expect(CORPORATE_ACTIONS.filter((a) => a.adjustment && !a.rceptNo)).toEqual([]);
  });
});

describe("priceAdjustmentFactor", () => {
  it("병합 전 가격은 비율을 곱하고, 이벤트 당일부터는 1이다", () => {
    expect(priceAdjustmentFactor("225190", "20260923")).toBe(5);
    expect(priceAdjustmentFactor("225190", "20260928")).toBe(1);
  });

  it("권리락은 기준가/전일 종가로 맞춰 KIS 수정주가와 같아진다", () => {
    expect(Math.round(347000 * priceAdjustmentFactor("196170", "20260804"))).toBe(267000);
    expect(Math.round(2040 * priceAdjustmentFactor("321370", "20260706"))).toBe(1851);
  });

  it("비율이 없는 이벤트는 배율을 만들지 않는다", () => {
    expect(priceAdjustmentFactor("207940", "20261001")).toBe(1);
  });

  it("LK삼양 8/12 진입가 1,131 대비 9/28 종가 4,215 는 보정하면 손실이다", () => {
    const entry = 1131 * priceAdjustmentFactor("225190", "20260812");
    const close = 4215 * priceAdjustmentFactor("225190", "20260928");
    expect(Number((((close - entry) / entry) * 100).toFixed(1))).toBe(-25.5);
  });
});

describe("corporateAdjustmentLabel", () => {
  it("병합은 비율, 권리락은 사유로 표시하고 비율 없는 이벤트는 표시하지 않는다", () => {
    const of = (s: string) => CORPORATE_ACTIONS.filter((a) => a.symbol === s);
    expect(corporateAdjustmentLabel(of("225190"))).toBe("5:1");
    expect(corporateAdjustmentLabel(of("196170"))).toBe("권리락 무상증자");
    expect(corporateAdjustmentLabel(of("207940"))).toBeNull();
  });
});

describe("A트랙 제외 범위", () => {
  // 001210 7/7: 7/15 거래정지 시작으로 유효 구간이 7/14 에서 끊긴다. 합친 시계열은 이벤트(7/31)를 지난다.
  const haltedValid = ["20260707", "20260708", "20260709", "20260710", "20260713", "20260714"];
  const days = Array.from({ length: 21 }, (_, i) => `202609${String(i + 1).padStart(2, "0")}`);

  it("001210 7/7 은 계산 구간이 이벤트 앞이라 걸리지 않는다", () => {
    const last = lastDateUsedByQuantItem(haltedValid, 32.83, 10, 10);
    expect(last).toBe("20260714");
    expect(findCorporateActionsInRange("001210", "20260707", last)).toEqual([]);
  });

  it("day3 가 임계값 미만이면 0~10일 창의 끝까지만 본다", () => {
    expect(lastDateUsedByQuantItem(days, 3, 10, 10)).toBe("20260911");
  });

  it("day3 가 임계값 이상이면 최고점 상한이 보는 유효 구간 끝까지 본다", () => {
    expect(lastDateUsedByQuantItem(days, 10, 10, 10)).toBe("20260921");
  });

  it("3일차 전이면 유효 구간 끝까지 본다", () => {
    expect(lastDateUsedByQuantItem(["20260901", "20260902"], null, 10, 10)).toBe("20260902");
  });

  it("225190 8/12 사이클은 합친 시계열 끝까지 보는 B트랙 판정에 걸린다", () => {
    expect(findCorporateActionsInRange("225190", "20260812", "20260929").map((a) => a.date)).toEqual(["20260928"]);
  });
});

describe("findLatestAdjustedRawGap", () => {
  it("두 기준 종가가 다른 가장 늦은 날을 찾는다", () => {
    const raw = [bar("20261101", 1000), bar("20261102", 1040), bar("20261103", 5100)];
    const adj = [bar("20261101", 5000), bar("20261102", 5200), bar("20261103", 5100)];
    expect(findLatestAdjustedRawGap("111111", raw, adj, "20261104")).toEqual({
      symbol: "111111",
      date: "20261102",
      adjustedClose: 5200,
      rawClose: 1040,
    });
  });

  it("같으면 null 이고, 당일 봉 차이는 보지 않는다", () => {
    const raw = [bar("20261103", 1000), bar("20261104", 1010)];
    const adj = [bar("20261103", 1000), bar("20261104", 1020)];
    expect(findLatestAdjustedRawGap("111111", raw, adj, "20261104")).toBeNull();
  });
});

describe("warnUnknownCorporateActions", () => {
  it("목록에 없는 차이만 경고하고, 목록의 이벤트와 조회 실패는 결과에 넣지 않는다", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const fetchAdjusted = vi.mocked(getDomesticStockDailyAdjustedRecent);
    fetchAdjusted.mockImplementation(async (symbol: string) => {
      if (symbol === "333333") throw new Error("boom");
      return [bar("20261103", 5220)];
    });
    const raw = [bar("20261103", 1044)];
    const found = await warnUnknownCorporateActions(
      new Map([["018000", raw], ["999999", raw], ["333333", raw]]),
      "20261104",
      "test"
    );
    expect(found.map((g) => g.symbol)).toEqual(["999999"]);
    expect(warn).toHaveBeenCalledTimes(2);
    warn.mockRestore();
  });
});
