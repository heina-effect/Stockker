import { describe, expect, it } from "vitest";
import { normalizeHomeIntelligence } from "./home-intelligence-normalizer";
import type { EmbeddedSource } from "./vector-store";

const recentSources: EmbeddedSource[] = [
  {
    id: "src-1",
    symbol: "005930",
    companyName: "삼성전자",
    sourceType: "news",
    provider: "News",
    title: "HBM 공급망 확대",
    rawTextForEmbedding: "HBM 공급망 확대",
    collectedAt: new Date().toISOString(),
  },
  {
    id: "src-2",
    symbol: "000660",
    companyName: "SK하이닉스",
    sourceType: "news",
    provider: "News",
    title: "AI 메모리 수요",
    rawTextForEmbedding: "AI 메모리 수요",
    collectedAt: new Date().toISOString(),
  },
];

describe("normalizeHomeIntelligence", () => {
  it("maps sector names and aliases to canonical route ids", () => {
    const normalized = normalizeHomeIntelligence({
      trendingSectors: [
        { name: "반도체", whyNow: "HBM 이슈", representativeSymbols: ["005930"] },
        { sectorId: "sec-defense", name: "방산", whyNow: "invalid" },
      ],
    }, recentSources);

    expect(normalized.trendingSectors).toHaveLength(1);
    expect(normalized.trendingSectors[0].sectorId).toBe("sec-semiconductor");
    expect(normalized.trendingSectors[0].id).toBe("sec-semiconductor");
    expect(normalized.trendingSectors[0].name).toBe("반도체");
    expect(normalized.trendingSectors[0].sourceCount).toBe(2);
    expect(normalized.sectors[0].sectorId).toBe("sec-semiconductor");
  });

  it("adds grounded stock source counts when available", () => {
    const normalized = normalizeHomeIntelligence({
      stocks: [{ symbol: "005930", name: "삼성전자", reason: "HBM" }],
    }, recentSources);

    expect(normalized.stocks[0].sourceCount).toBe(1);
  });
});
