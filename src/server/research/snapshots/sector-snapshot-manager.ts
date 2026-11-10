import { getSupabaseAdmin } from "@/lib/supabase/client";
import { aiSummarizeSector } from "@/server/ai/orchestrator";
import { generateIssues } from "@/server/research/model-router";
import { getDBSectorUniverse } from "@/lib/stocks/db-registry";

export interface SectorResearchSnapshot {
  sector_id: string;
  name: string;
  description: string;
  trend_strength: number;
  ai_summary: string;
  representative_symbols: string[];
  related_issues: any[];
  leaders?: string[];
  laggards?: string[];
  watch_candidates?: any[];
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
  const universe = await getDBSectorUniverse();
  const sector = universe[sectorId];
  if (!sector) return null;

  // Gather clusters from representative symbols in parallel
  const promises = sector.representativeSymbols.map(async (sym) => {
    try {
      const { clusters } = await generateIssues(sym);
      return clusters;
    } catch (e) {
      console.warn(`[SectorSnapshot] Failed to get issues for ${sym}:`, e);
      return [];
    }
  });
  const clusterResults = await Promise.all(promises);
  const allClusters = clusterResults.flat();

  // Dedupe and sort by recent
  const sortedClusters = allClusters
    .filter((v, i, a) => a.findIndex(t => t.id === v.id) === i)
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, 10);

  const { summary, trendStrength, leaders, laggards, watchCandidates, failed: summaryFailed } = await aiSummarizeSector(sector, sortedClusters);

  const snapshot = {
    sector_id: sector.sectorId,
    name: sector.name,
    description: sector.description,
    trend_strength: trendStrength,
    ai_summary: summary,
    representative_symbols: sector.representativeSymbols,
    related_issues: sortedClusters.slice(0, 5),
    leaders: leaders || [],
    laggards: laggards || [],
    watch_candidates: watchCandidates || [],
    updated_at: new Date().toISOString()
  };

  const db = getSupabaseAdmin();
  if (db) {
    // 재생성이 실패한 결과(이슈 0개, 또는 AI 요약 실패의 자리표시 문구)로 기존 스냅샷을 덮지 않는다.
    // 기존 행이 없으면(첫 생성) 그대로 저장해 "아직 없음"과 "만들다 실패"를 구분한다.
    // watch_candidates·leaders·laggards가 비는 것은 AI가 정상적으로 "없음"이라고 답한 것일 수 있어 실패로 보지 않는다.
    const skipReason = snapshot.related_issues.length === 0
      ? "no_issues"
      : summaryFailed
        ? "summary_failed"
        : null;

    if (skipReason) {
      const { data: existing } = await db
        .from("sector_research_snapshots")
        .select("*")
        .eq("sector_id", sector.sectorId)
        .maybeSingle();
      if (existing) {
        console.warn(`[SectorSnapshot] Skip upsert sector=${sector.sectorId} reason=${skipReason} at=${new Date().toISOString()} (keeping snapshot updated_at=${existing.updated_at})`);
        return existing as SectorResearchSnapshot;
      }
    }

    const { error } = await db.from("sector_research_snapshots").upsert(snapshot, { onConflict: "sector_id" });
    if (error) console.error("[SectorSnapshot] Failed to save:", error.message);
  }

  return snapshot as any;
}
