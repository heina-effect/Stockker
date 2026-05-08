import { getSupabaseAdmin } from "@/lib/supabase/client";
import type { SentimentScore, StockReportSummary } from "@/types/research";

export interface StockResearchSnapshot {
  symbol: string;
  company_name: string;
  ai_headline: string;
  ai_summary: string;
  sentiment_score: number;
  sentiment_label: string;
  sentiment_trend: string;
  positive_factors: string[];
  negative_factors: string[];
  basis_source_ids: string[];
  is_fallback: boolean;
  created_at: string;
  updated_at: string;
}

export async function getStockSnapshot(symbol: string): Promise<StockResearchSnapshot | null> {
  const db = getSupabaseAdmin();
  if (!db) return null;

  const { data, error } = await db
    .from("stock_research_snapshots")
    .select("*")
    .eq("symbol", symbol)
    .single();

  if (error || !data) return null;
  return data as StockResearchSnapshot;
}

export async function saveStockSnapshot(
  symbol: string,
  companyName: string,
  report: StockReportSummary,
  sentiment: SentimentScore
): Promise<void> {
  const db = getSupabaseAdmin();
  if (!db) return;

  const snapshot = {
    symbol,
    company_name: companyName,
    ai_headline: report.aiHeadline,
    ai_summary: report.aiSummary,
    sentiment_score: sentiment.score,
    sentiment_label: sentiment.label,
    sentiment_trend: sentiment.trend,
    positive_factors: sentiment.positiveFactors || [],
    negative_factors: sentiment.negativeFactors || [],
    basis_source_ids: sentiment.basisSources?.map(s => s.id) || [],
    is_fallback: sentiment._isFallback ?? false,
    updated_at: new Date().toISOString()
  };

  const { error } = await db
    .from("stock_research_snapshots")
    .upsert(snapshot, { onConflict: "symbol" });

  if (error) {
    console.error("[SnapshotManager] Failed to save stock snapshot:", error.message);
  }
}
