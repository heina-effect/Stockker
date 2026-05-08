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
import { curateSourcesWithEmbedding } from "@/server/ai/embedding-curator";

/**
 * 리서치 AI 라우터
 */

import { searchStock, getServerStockName } from "@/lib/stocks/search-master";
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

export async function generateIssues(symbol: string): Promise<{ clusters: IssueCluster[]; sources: SourceItem[] }> {
  const name = getServerStockName(symbol);
  try {
    // ── Step 1: Fetch raw sources ────────────────────────────────────────────
    const { rawNews, disclosures } = await collectRawSources(symbol);

    if ((!rawNews || rawNews.length === 0) && (!disclosures || disclosures.length === 0)) {
      console.warn(`[AI Router] No real sources for ${symbol} (${name}), using mock issues.`);
      return mockIssues(symbol) as any;
    }

    // ── Step 2: Normalize (dedup, recency filter, relevance filter) ──────────
    const normalized = normalizeSources(rawNews, disclosures, { companyName: name });

    if (normalized.length === 0) {
      console.warn(`[AI Router] All sources filtered out for ${symbol} (${name}), using mock issues.`);
      return mockIssues(symbol) as any;
    }

    // ── Step 3: Embedding curation (spam filter, quality score, semantic dedup)
    // Non-blocking: if embedding unavailable or fails, falls back to normalized
    let sources = normalized;
    try {
      const { curated } = await curateSourcesWithEmbedding(normalized, { symbol, companyName: name });
      if (curated.length > 0) {
        sources = curated;
        console.log(`[AI Router] Embedding curation: ${normalized.length} → ${curated.length} sources for ${symbol}`);
      } else {
        console.warn(`[AI Router] Embedding curation returned 0 sources for ${symbol}, using normalized.`);
      }
    } catch (embErr) {
      console.warn(`[AI Router] Embedding curation failed for ${symbol} (non-fatal):`, embErr);
    }

    // ── Step 4: Rank and cluster ─────────────────────────────────────────────
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
