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
import { getDomesticStockQuote } from "@/server/kis/rest-client";

/**
 * 리서치 AI 라우터
 */

import { searchStock, getServerStockName } from "@/lib/stocks/search-master";
import { aiSummarizeIssues, aiAnalyzeSentiment } from "@/server/ai/orchestrator";
import { getStockSnapshot, saveStockSnapshot } from "./snapshots/snapshot-manager";
import type { StockReportSummary, SentimentScore } from "@/types/research";

const SNAPSHOT_TTL_MS = 60 * 60 * 1000; // 1 hr freshness
const snapshotPromiseCache = new Map<string, Promise<{ report: StockReportSummary, sentiment: SentimentScore }>>();

async function getOrGenerateSnapshot(symbol: string): Promise<{ report: StockReportSummary, sentiment: SentimentScore }> {
  const name = getServerStockName(symbol);
  
  // 1. Check DB Snapshot
  const snapshot = await getStockSnapshot(symbol);
  const now = Date.now();
  if (snapshot) {
    const age = now - new Date(snapshot.updated_at).getTime();
    if (age < SNAPSHOT_TTL_MS) {
      // Fresh DB Hit
      return {
        report: {
          symbol, name, currentPrice: 0, change: 0, changeRate: 0,
          aiHeadline: snapshot.ai_headline,
          aiSummary: snapshot.ai_summary,
          priceFreshness: "stale", reportFreshness: "live",
          lastUpdated: snapshot.updated_at,
          _meta: { source: "db_snapshot" }
        },
        sentiment: {
          score: snapshot.sentiment_score,
          label: snapshot.sentiment_label as any,
          trend: snapshot.sentiment_trend as any,
          positiveFactors: snapshot.positive_factors,
          negativeFactors: snapshot.negative_factors,
          basisSources: snapshot.basis_source_ids.map(id => ({ id } as any)),
          freshness: "live",
          generatedAt: snapshot.updated_at,
          _isFallback: snapshot.is_fallback,
          _meta: { source: "db_snapshot" }
        }
      };
    }
  }

  // 2. Generate if miss or stale
  if (snapshotPromiseCache.has(symbol)) {
    return snapshotPromiseCache.get(symbol)!;
  }

  const p = (async () => {
    try {
      const { clusters, sources } = await generateIssues(symbol);
      const [report, sentiment] = await Promise.all([
        aiSummarizeIssues(symbol, clusters),
        aiAnalyzeSentiment(symbol, sources)
      ]);

      // Fire and forget save
      saveStockSnapshot(symbol, name, report, sentiment).catch(e => console.error("Save snapshot error:", e));

      return { report, sentiment };
    } finally {
      snapshotPromiseCache.delete(symbol);
    }
  })();

  snapshotPromiseCache.set(symbol, p);
  return p;
}

export async function generateSearch(query: string) {
  return searchStock(query);
}

export async function generateReportSummary(symbol: string) {
  const { report } = await getOrGenerateSnapshot(symbol);
  return report;
}

export async function generateSentiment(symbol: string) {
  const { sentiment } = await getOrGenerateSnapshot(symbol);
  return sentiment;
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
  try {
    const quote = await getDomesticStockQuote(symbol);
    return mockBuyPlan(symbol, averagePrice, quote.price);
  } catch (e) {
    console.warn(`[BuyPlan] Failed to fetch live price for ${symbol}, falling back to mock:`, e);
    return mockBuyPlan(symbol, averagePrice);
  }
}

export async function generateRelatedStocks(symbol: string) {
  return genRelatedStocks(symbol);
}
