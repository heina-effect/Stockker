import { describe, it, expect, vi, beforeAll } from "vitest";
import { searchStock, getServerStockName } from "./search-master";

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
});
