import {
  mockBuyPlan,
} from "./mock-data";
import type { BuyPricePlan, IssueCluster, SourceItem } from "@/types/research";
import { collectRawSources } from "./pipeline/collect";
import { normalizeSources } from "./pipeline/normalize";
import { rankAndCluster } from "./pipeline/rank";
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
    } else if (age < SNAPSHOT_TTL_MS + 24 * 60 * 60 * 1000) {
      // Stale while revalidate: return stale immediately, regen in background
      if (!snapshotPromiseCache.has(symbol)) {
        const p = (async () => {
          try {
            const { clusters, sources } = await generateIssues(symbol);
            const [report, sentiment] = await Promise.all([
              aiSummarizeIssues(symbol, clusters),
              aiAnalyzeSentiment(symbol, sources)
            ]);
            await saveStockSnapshot(symbol, name, report, sentiment);
            return { report, sentiment };
          } catch(e) {
            console.error("Background snapshot regen error:", e);
            throw e;
          } finally {
            snapshotPromiseCache.delete(symbol);
          }
        })();
        snapshotPromiseCache.set(symbol, p);
      }

      return {
        report: {
          symbol, name, currentPrice: 0, change: 0, changeRate: 0,
          aiHeadline: snapshot.ai_headline,
          aiSummary: snapshot.ai_summary,
          priceFreshness: "stale", reportFreshness: "stale",
          lastUpdated: snapshot.updated_at,
          _meta: { source: "db_snapshot_stale" }
        },
        sentiment: {
          score: snapshot.sentiment_score,
          label: snapshot.sentiment_label as any,
          trend: snapshot.sentiment_trend as any,
          positiveFactors: snapshot.positive_factors,
          negativeFactors: snapshot.negative_factors,
          basisSources: snapshot.basis_source_ids.map(id => ({ id } as any)),
          freshness: "stale",
          generatedAt: snapshot.updated_at,
          _isFallback: snapshot.is_fallback,
          _meta: { source: "db_snapshot_stale" }
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
    const { getVectorStore } = await import("@/server/ai/vector-store");
    const vectorStore = getVectorStore();
    
    // DB-first: check if we have enough fresh sources (e.g., from the last 1 hour)
    const recentSources = await vectorStore.getRecentCuratedSources(symbol, 60 * 60 * 1000);

    // If we have a reasonable amount of fresh curated sources, skip external fetch
    if (recentSources && recentSources.length >= 3) {
      // EmbeddedSource has publishedAt; SourceItem expects generatedAt — bridge the gap here
      const dbAsSourceItems = recentSources.map(s => ({ ...s, generatedAt: s.publishedAt ?? s.collectedAt })) as any[];
      // DB 소스도 회사명 관련성 필터 적용 — Phase 29 이전에 캐시된 오염 소스 차단
      const dbNews = dbAsSourceItems.filter((s: any) => s.sourceType !== "disclosure");
      const dbDisclosures = dbAsSourceItems.filter((s: any) => s.sourceType === "disclosure");
      const filtered = normalizeSources(dbNews, dbDisclosures, { companyName: name });
      if (filtered.length >= 3) {
        console.log(`[AI Router] Using ${filtered.length}/${recentSources.length} DB-cached sources (after relevance filter) for ${symbol}`);
        const clusters = rankAndCluster(filtered);
        return { clusters, sources: filtered };
      }
      console.log(`[AI Router] DB sources filtered to ${filtered.length} (< 3) for ${symbol}, refetching`);
    }

    // ── Step 1: Fetch raw sources ────────────────────────────────────────────
    const { rawNews, disclosures } = await collectRawSources(symbol);

    if ((!rawNews || rawNews.length === 0) && (!disclosures || disclosures.length === 0)) {
      console.warn(`[AI Router] No real sources for ${symbol} (${name}), returning empty.`);
      return { clusters: [], sources: [] };
    }

    // ── Step 2: Normalize (dedup, recency filter, relevance filter) ──────────
    const normalized = normalizeSources(rawNews, disclosures, { companyName: name });

    if (normalized.length === 0) {
      console.warn(`[AI Router] All sources filtered out for ${symbol} (${name}), returning empty.`);
      return { clusters: [], sources: [] };
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
    return { clusters: [], sources: [] };
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
