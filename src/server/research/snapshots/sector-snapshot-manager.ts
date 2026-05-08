import { getSupabaseAdmin } from "@/lib/supabase/client";
import { SECTOR_UNIVERSE } from "@/data/sectors/taxonomy";
import { aiSummarizeSector } from "@/server/ai/orchestrator";
import { generateIssues } from "@/server/research/model-router";

export interface SectorResearchSnapshot {
  sector_id: string;
  name: string;
  description: string;
  trend_strength: number;
  ai_summary: string;
  representative_symbols: string[];
  related_issues: any[];
  created_at: string;
  updated_at: string;
}

const SNAPSHOT_TTL_MS = 60 * 60 * 1000; // 1 hour

export async function getSectorSnapshot(sectorId: string): Promise<SectorResearchSnapshot | null> {
  const db = getSupabaseAdmin();
  if (!db) return null;

  const { data, error } = await db
    .from("sector_research_snapshots")
    .select("*")
    .eq("sector_id", sectorId)
    .single();

  if (error || !data) return null;

  const age = Date.now() - new Date(data.updated_at).getTime();
  if (age > SNAPSHOT_TTL_MS) {
    // Generate async in background, return stale data
    generateSectorSnapshot(sectorId).catch(console.error);
  }

  return data as SectorResearchSnapshot;
}

export async function generateSectorSnapshot(sectorId: string): Promise<SectorResearchSnapshot | null> {
  const sector = SECTOR_UNIVERSE[sectorId];
  if (!sector) return null;

  // Gather clusters from representative symbols
  let allClusters: any[] = [];
  for (const sym of sector.representativeSymbols) {
    try {
      const { clusters } = await generateIssues(sym);
      allClusters = [...allClusters, ...clusters];
    } catch (e) {
      console.warn(`[SectorSnapshot] Failed to get issues for ${sym}:`, e);
    }
  }

  // Dedupe and sort by recent
  const sortedClusters = allClusters
    .filter((v, i, a) => a.findIndex(t => t.id === v.id) === i)
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, 10);

  const { summary, trendStrength } = await aiSummarizeSector(sector, sortedClusters);

  const snapshot = {
    sector_id: sector.sectorId,
    name: sector.name,
    description: sector.description,
    trend_strength: trendStrength,
    ai_summary: summary,
    representative_symbols: sector.representativeSymbols,
    related_issues: sortedClusters.slice(0, 5),
    updated_at: new Date().toISOString()
  };

  const db = getSupabaseAdmin();
  if (db) {
    const { error } = await db.from("sector_research_snapshots").upsert(snapshot, { onConflict: "sector_id" });
    if (error) console.error("[SectorSnapshot] Failed to save:", error.message);
  }

  return snapshot as any;
}
