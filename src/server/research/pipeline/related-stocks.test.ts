import { describe, it, expect, vi } from "vitest";

// Mock external dependencies
vi.mock("@/server/ai/vector-store", () => ({
  getVectorStore: () => ({
    getRecentCuratedSources: async () => [],
  }),
}));

vi.mock("@/server/kis/rest-client", () => ({
  getDomesticStockQuote: async () => ({ kisIndustryCode: undefined, kisIndustryName: undefined }),
}));

vi.mock("@/data/sectors/taxonomy", () => ({
  SECTOR_UNIVERSE: {
    "sec-semiconductor": {
      sectorId: "sec-semiconductor",
      name: "반도체",
      aliases: ["메모리"],
      description: "반도체 섹터",
      memberSymbols: ["005930", "000660", "042700"],
      representativeSymbols: ["005930", "000660"],
      iconKey: "cpu",
    },
  },
  resolveSectorId: (value?: string) => (value === "반도체" || value === "sec-semiconductor" ? "sec-semiconductor" : null),
}));

vi.mock("@/lib/stocks/search-master", () => ({
  getServerStockName: (sym: string) =>
    ({ "005930": "삼성전자", "000660": "SK하이닉스", "042700": "한미반도체" }[sym] || sym),
  getSearchMaster: () => [
    { symbol: "005930", name: "삼성전자", type: "stock", market: "KOSPI", aliases: [] },
    { symbol: "000660", name: "SK하이닉스", type: "stock", market: "KOSPI", aliases: [] },
    { symbol: "042700", name: "한미반도체", type: "stock", market: "KOSPI", aliases: [] },
  ],
}));

import { generateRelatedStocks } from "./related-stocks";

describe("generateRelatedStocks", () => {
  it("returns sector peers for a known sector symbol", async () => {
    const results = await generateRelatedStocks("005930");
    expect(results.length).toBeGreaterThan(0);
  });

  it("excludes the queried symbol from results", async () => {
    const results = await generateRelatedStocks("005930");
    const symbols = results.map(r => r.symbol);
    expect(symbols).not.toContain("005930");
  });

  it("each result has required relationType and relationReason fields", async () => {
    const results = await generateRelatedStocks("005930");
    for (const r of results) {
      expect(r.relationType).toBeDefined();
      expect(["sector_peer", "issue_mention", "supply_chain", "disclosure_linked", "peer", "ai_inferred"]).toContain(r.relationType);
      expect(typeof r.relationReason).toBe("string");
      expect(r.relationReason.length).toBeGreaterThan(0);
    }
  });

  it("each result has quoteMode field", async () => {
    const results = await generateRelatedStocks("005930");
    for (const r of results) {
      expect(r.quoteMode).toBeDefined();
      expect(["live-sync", "cached", "unavailable"]).toContain(r.quoteMode);
    }
  });

  it("sector peers have relationType sector_peer", async () => {
    const results = await generateRelatedStocks("005930");
    const sectorPeers = results.filter(r => r.relationType === "sector_peer");
    expect(sectorPeers.length).toBeGreaterThan(0);
  });

  it("returns empty array for unknown symbol without crashing", async () => {
    const results = await generateRelatedStocks("UNKNOWN_SYM");
    expect(Array.isArray(results)).toBe(true);
  });
});
