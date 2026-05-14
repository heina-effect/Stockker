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
import { getCanonicalSectorForSymbol } from "@/lib/stocks/sector-utils";
import {
  applyReportEvidence,
  filterClustersForSymbol,
  filterSourcesForSymbol,
  hasUsableSnapshotEvidence,
} from "./entity-guard";
import { isUnsupportedStockSymbol } from "@/lib/stocks/listing-status";

/**
 * 리서치 AI 라우터
 */

import {
  searchStock,
  getServerStockName,
  getSearchMaster,
  rankSearchItems,
  type StockMasterItem,
} from "@/lib/stocks/search-master";
import { getDBSectorUniverse, getDBStockUniverse } from "@/lib/stocks/db-registry";
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
  if (snapshot && hasUsableSnapshotEvidence(snapshot)) {
    const age = now - new Date(snapshot.updated_at).getTime();
    if (age < SNAPSHOT_TTL_MS) {
      // Fresh DB Hit
      return {
        report: {
          symbol, name, currentPrice: 0, change: 0, changeRate: 0,
          aiHeadline: snapshot.ai_headline,
          aiSummary: snapshot.ai_summary,
          priceFreshness: "stale", reportFreshness: "recent",
          lastUpdated: snapshot.updated_at,
          _meta: { source: "db_snapshot", evidenceSourceCount: snapshot.basis_source_ids.length }
        },
        sentiment: {
          score: snapshot.sentiment_score,
          label: snapshot.sentiment_label as any,
          trend: snapshot.sentiment_trend as any,
          positiveFactors: snapshot.positive_factors,
          negativeFactors: snapshot.negative_factors,
          basisSources: snapshot.basis_source_ids.map(id => ({ id } as any)),
          freshness: "recent",
          generatedAt: snapshot.updated_at,
          _isFallback: snapshot.is_fallback,
          _meta: { source: "db_snapshot", evidenceSourceCount: snapshot.basis_source_ids.length }
        }
      };
    } else if (age < SNAPSHOT_TTL_MS + 24 * 60 * 60 * 1000) {
      // Stale while revalidate: return stale immediately, regen in background
      if (!snapshotPromiseCache.has(symbol)) {
        const p = (async () => {
          try {
            const { clusters, sources } = await generateIssues(symbol);
            const guardedClusters = filterClustersForSymbol(clusters, sources, symbol);
            const guardedSources = filterSourcesForSymbol(sources, symbol);
            const [report, sentiment] = await Promise.all([
              aiSummarizeIssues(symbol, guardedClusters),
              aiAnalyzeSentiment(symbol, guardedSources)
            ]);
            const guardedReport = applyReportEvidence(report, guardedSources.length);
            if (guardedSources.length >= 2) {
              await saveStockSnapshot(symbol, name, guardedReport, sentiment);
            }
            return { report: guardedReport, sentiment };
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
  } else if (snapshot) {
    console.warn(`[AI Router] Ignoring weak snapshot for ${symbol}: insufficient basis or fallback`);
  }

  // 2. Generate if miss or stale
  if (snapshotPromiseCache.has(symbol)) {
    return snapshotPromiseCache.get(symbol)!;
  }

  const p = (async () => {
    try {
      const { clusters, sources } = await generateIssues(symbol);
      const guardedClusters = filterClustersForSymbol(clusters, sources, symbol);
      const guardedSources = filterSourcesForSymbol(sources, symbol);
      const [report, sentiment] = await Promise.all([
        aiSummarizeIssues(symbol, guardedClusters),
        aiAnalyzeSentiment(symbol, guardedSources)
      ]);
      const guardedReport = applyReportEvidence(report, guardedSources.length);

      // Fire and forget save
      if (guardedSources.length >= 2) {
        saveStockSnapshot(symbol, name, guardedReport, sentiment).catch(e => console.error("Save snapshot error:", e));
      }

      return { report: guardedReport, sentiment };
    } finally {
      snapshotPromiseCache.delete(symbol);
    }
  })();

  snapshotPromiseCache.set(symbol, p);
  return p;
}

export async function generateSearch(query: string) {
  try {
    const [stocks, sectors] = await Promise.all([
      getDBStockUniverse(),
      getDBSectorUniverse(),
    ]);

    const stockItems: StockMasterItem[] = Object.values(stocks)
      .filter((stock) => !isUnsupportedStockSymbol(stock.symbol))
      .map((stock) => ({
        symbol: stock.symbol,
        name: stock.name,
        type: stock.market === "INDEX" ? "index" : stock.market === "ETF" ? "etf" : "stock",
        market: stock.market,
        aliases: [],
      }));

    const sectorItems: StockMasterItem[] = Object.values(sectors).map((sector) => ({
      symbol: sector.sectorId,
      name: sector.name,
      type: "sector",
      market: "SECTOR",
      aliases: sector.aliases ?? [],
    }));

    const results = rankSearchItems(query, [...stockItems, ...sectorItems]);
    if (results.length > 0) return results;
  } catch (error) {
    console.warn("[AI Router] DB-first search failed, falling back to local master:", error);
  }

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
  const sector = getCanonicalSectorForSymbol(symbol);
  const companyAliases = getSearchMaster().find(item => item.symbol === symbol)?.aliases || [];
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
      const filtered = filterSourcesForSymbol(
        normalizeSources(dbNews, dbDisclosures, { companyName: name, companyAliases, sectorMemberSymbols: sector?.memberSymbols }),
        symbol
      );
      if (filtered.length >= 3) {
        console.log(`[AI Router] Using ${filtered.length}/${recentSources.length} DB-cached sources (after relevance filter) for ${symbol}`);
        const clusters = filterClustersForSymbol(rankAndCluster(filtered), filtered, symbol);
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
    const normalized = filterSourcesForSymbol(
      normalizeSources(rawNews, disclosures, { companyName: name, companyAliases, sectorMemberSymbols: sector?.memberSymbols }),
      symbol
    );

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
    const clusters = filterClustersForSymbol(rankAndCluster(sources), sources, symbol);

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
