import {
  mockReportSummary,
  mockSentiment,
  mockIssues,
  mockBuyPlan,
} from "./mock-data";
import type { BuyPricePlan, IssueItem } from "@/types/research";
import { STOCK_UNIVERSE } from "@/lib/stocks/metadata";
import { collectRawSources } from "./pipeline/collect";
import { normalizeSources } from "./pipeline/normalize";
import { rankAndCluster } from "./pipeline/rank";
import { summarizeIssues } from "./pipeline/summarize";
import { generateRelatedStocks as genRelatedStocks } from "./pipeline/related-stocks";

/**
 * 리서치 AI 라우터
 */

export async function generateSearch(query: string) {
  const normQuery = query.toLowerCase().replace(/\s+/g, "");
  const results = Object.values(STOCK_UNIVERSE)
    .filter(item => 
      item.symbol.includes(normQuery) || 
      item.name.toLowerCase().includes(normQuery)
    )
    .map(item => ({
      symbol: item.symbol,
      name: item.name,
      type: item.market === "INDEX" ? "index" : "stock",
      market: item.market,
      matchScore: item.symbol === normQuery || item.name === query ? 100 : 50
    }))
    .sort((a, b) => b.matchScore - a.matchScore)
    .slice(0, 5);

  return results;
}

export async function generateReportSummary(symbol: string) {
  // AI 요약
  return summarizeIssues(symbol, []);
}

export async function generateSentiment(symbol: string) {
  return mockSentiment(symbol);
}

export async function generateIssues(symbol: string): Promise<IssueItem[]> {
  try {
    const { rawNews, disclosures } = await collectRawSources(symbol);
    
    if ((!rawNews || rawNews.length === 0) && (!disclosures || disclosures.length === 0)) {
      return mockIssues(symbol); // Fallback
    }

    const normalized = normalizeSources(rawNews, disclosures);
    const ranked = rankAndCluster(normalized);
    
    return ranked;
  } catch (e) {
    console.error(`[AI Router] generateIssues failed for ${symbol}:`, e);
    return mockIssues(symbol);
  }
}

export async function generateBuyPlan(symbol: string, averagePrice: number): Promise<BuyPricePlan> {
  return mockBuyPlan(symbol, averagePrice);
}

export async function generateRelatedStocks(symbol: string) {
  return genRelatedStocks(symbol);
}
