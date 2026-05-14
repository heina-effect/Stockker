import { describe, it, expect, beforeAll } from "vitest";
import { searchStock, getServerStockName, rankSearchItems } from "./search-master";

describe("Search Master", () => {
  beforeAll(() => {
    // mock getSearchMaster logic to load normally or use the cache
  });

  it("should match HD현대중공업 using legacy alias", () => {
    const results = searchStock("현대중공업");
    // Should find HD현대중공업
    const found = results.find(r => r.symbol === "329180");
    expect(found).toBeDefined();
    expect(found?.name).toBe("HD현대중공업");
  });

  it("should match exactly by symbol", () => {
    const results = searchStock("329180");
    const found = results.find(r => r.symbol === "329180");
    expect(found).toBeDefined();
    expect(found?.name).toBe("HD현대중공업");
  });

  it("should return HD현대중공업 from getServerStockName", () => {
    const name = getServerStockName("329180");
    expect(name).toBe("HD현대중공업");
  });

  it("ranks exact common stock name above similarly prefixed stocks", () => {
    const results = searchStock("한화");
    expect(results[0]?.symbol).toBe("000880");
    expect(results[0]?.name).toBe("한화");
  });

  it("ranks DB stock master items with the same exact-match rules", () => {
    const results = rankSearchItems("한화", [
      { symbol: "124050", name: "한화에스브이명장제1호기업인수목적", type: "stock", market: "KOSDAQ", aliases: [] },
      { symbol: "000880", name: "한화", type: "stock", market: "KOSPI", aliases: [] },
      { symbol: "272210", name: "한화시스템", type: "stock", market: "KOSPI", aliases: [] },
    ]);

    expect(results[0]?.symbol).toBe("000880");
  });

  it("excludes DART-only unsupported symbols from the local fallback index", () => {
    expect(searchStock("지디").some(result => result.symbol === "155960")).toBe(false);
    expect(searchStock("젬").some(result => result.symbol === "248020")).toBe(false);
  });
});
