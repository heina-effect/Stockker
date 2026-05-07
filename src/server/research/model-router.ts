import {
  mockReportSummary,
  mockSentiment,
  mockIssues,
  mockBuyPlan,
} from "./mock-data";
import type { BuyPricePlan, IssueCluster, SourceItem } from "@/types/research";
import { STOCK_UNIVERSE } from "@/lib/stocks/metadata";
import { collectRawSources } from "./pipeline/collect";
import { normalizeSources } from "./pipeline/normalize";
import { rankAndCluster } from "./pipeline/rank";
import { summarizeIssues } from "./pipeline/summarize";
import { generateRelatedStocks as genRelatedStocks } from "./pipeline/related-stocks";

/**
 * 리서치 AI 라우터
 */

import { searchStock } from "@/lib/stocks/search-master";
import { aiSummarizeIssues, aiAnalyzeSentiment } from "@/server/ai/orchestrator";

export async function generateSearch(query: string) {
  return searchStock(query);
}

export async function generateReportSummary(symbol: string) {
  const { clusters } = await generateIssues(symbol);
  return aiSummarizeIssues(symbol, clusters);
}

export async function generateSentiment(symbol: string) {
  const { sources } = await generateIssues(symbol);
  return aiAnalyzeSentiment(symbol, sources);
}

export async function generateIssues(symbol: string): Promise<{ clusters: IssueCluster[], sources: SourceItem[] }> {
  try {
    const { rawNews, disclosures } = await collectRawSources(symbol);
    
    if ((!rawNews || rawNews.length === 0) && (!disclosures || disclosures.length === 0)) {
      return mockIssues(symbol) as any; // Fallback
    }

    const sources = normalizeSources(rawNews, disclosures);
    const clusters = rankAndCluster(sources);
    
    return { clusters, sources };
  } catch (e) {
    console.error(`[AI Router] generateIssues failed for ${symbol}:`, e);
    return mockIssues(symbol) as any;
  }
}

export async function generateBuyPlan(symbol: string, averagePrice: number): Promise<BuyPricePlan> {
  return mockBuyPlan(symbol, averagePrice);
}

export async function generateRelatedStocks(symbol: string) {
  return genRelatedStocks(symbol);
}
