import { describe, expect, it, vi } from "vitest";

vi.mock("@/server/kis/rest-client", () => ({ getDomesticStockDailyAdjustedRecent: vi.fn() }));
vi.mock("@/server/screening/rate-limit-retry", () => ({ withRateLimitRetry: (fn: () => unknown) => fn() }));

import { getDomesticStockDailyAdjustedRecent } from "@/server/kis/rest-client";
import {
  CORPORATE_ACTIONS,
  findCorporateActionInRange,
  findLatestAdjustedRawGap,
  warnUnknownCorporateActions,
} from "./corporate-actions";

const bar = (date: string, close: number) => ({ stck_bsop_date: date, stck_clpr: String(close) });

describe("findCorporateActionInRange", () => {
  const actions = [{ symbol: "111111", date: "20260731", flngClsCode: "00" }];

  it("발굴일 뒤, 마지막 저장일까지의 이벤트를 찾는다", () => {
    expect(findCorporateActionInRange("111111", "20260707", "20260731", actions)?.date).toBe("20260731");
    expect(findCorporateActionInRange("111111", "20260707", "20260820", actions)?.date).toBe("20260731");
  });

  it("발굴일 당일·이전 이벤트와 마지막 저장일 이후 이벤트는 해당하지 않는다", () => {
    expect(findCorporateActionInRange("111111", "20260731", "20260820", actions)).toBeNull();
    expect(findCorporateActionInRange("111111", "20260801", "20260820", actions)).toBeNull();
    expect(findCorporateActionInRange("111111", "20260707", "20260730", actions)).toBeNull();
  });

  it("다른 종목은 해당하지 않는다", () => {
    expect(findCorporateActionInRange("222222", "20260707", "20260820", actions)).toBeNull();
  });

  it("조사한 왜곡 5그룹이 기본 목록으로 걸리고, 이벤트에 닿지 않은 그룹은 걸리지 않는다", () => {
    expect(CORPORATE_ACTIONS).toHaveLength(9);
    for (const [s, entry, last] of [
      ["001210", "20260707", "20260820"],
      ["001210", "20260708", "20260821"],
      ["001210", "20260709", "20260824"],
      ["225190", "20260812", "20260928"],
      ["225190", "20260813", "20260929"],
    ]) {
      expect(findCorporateActionInRange(s, entry, last)).not.toBeNull();
    }
    expect(findCorporateActionInRange("018000", "20260827", "20261015")).toBeNull();
    expect(findCorporateActionInRange("001210", "20261012", "20261103")).toBeNull();
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
