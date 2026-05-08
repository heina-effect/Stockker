import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/client";

export async function GET() {
  const db = getSupabaseAdmin();
  if (!db) {
    return NextResponse.json({ ok: false, error: "Database not connected" }, { status: 503 });
  }

  try {
    const cutoff24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    
    const [
      { count: totalSources }, 
      { count: totalEmbeddings }, 
      { count: totalSnapshots },
      { data: embeddingsData }
    ] = await Promise.all([
      db.from("news_sources").select("*", { count: "exact", head: true }),
      db.from("source_embeddings").select("*", { count: "exact", head: true }),
      db.from("stock_research_snapshots").select("*", { count: "exact", head: true }),
      // Fetch recent embeddings to get provider and quality stats
      db.from("source_embeddings").select("provider, quality_label").gte("collected_at", cutoff24h)
    ]);

    const curationRatio = totalSources && totalSources > 0 
      ? Math.round(((totalEmbeddings || 0) / totalSources) * 100) 
      : 0;

    // Quality & Provider Breakdown (24h)
    const providerCount: Record<string, number> = {};
    const qualityCount: Record<string, number> = { high: 0, medium: 0, low: 0, rejected: 0 };
    
    if (embeddingsData) {
      embeddingsData.forEach(e => {
        const p = e.provider || "unknown";
        providerCount[p] = (providerCount[p] || 0) + 1;
        const q = e.quality_label || "unknown";
        qualityCount[q] = (qualityCount[q] || 0) + 1;
      });
    }

    return NextResponse.json({
      ok: true,
      metrics: {
        totalRawSources: totalSources,
        totalCuratedEmbeddings: totalEmbeddings,
        curationRatio: `${curationRatio}%`,
        totalStockSnapshots: totalSnapshots,
        recent24h: {
          totalCurated: embeddingsData?.length || 0,
          providerBreakdown: providerCount,
          qualityBreakdown: qualityCount,
          rejectedRatio: embeddingsData?.length 
            ? `${Math.round((qualityCount.rejected / embeddingsData.length) * 100)}%` 
            : "0%"
        },
        timestamp: new Date().toISOString()
      }
    });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
