import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/client";

export async function GET() {
  const db = getSupabaseAdmin();
  if (!db) {
    return NextResponse.json({ ok: false, error: "Database not connected" }, { status: 503 });
  }

  try {
    const [{ count: totalSources }, { count: totalEmbeddings }, { count: totalSnapshots }] = await Promise.all([
      db.from("news_sources").select("*", { count: "exact", head: true }),
      db.from("source_embeddings").select("*", { count: "exact", head: true }),
      db.from("stock_research_snapshots").select("*", { count: "exact", head: true }),
    ]);

    // Calculate ratio of curated vs total
    const curationRatio = totalSources && totalSources > 0 
      ? Math.round(((totalEmbeddings || 0) / totalSources) * 100) 
      : 0;

    return NextResponse.json({
      ok: true,
      metrics: {
        totalRawSources: totalSources,
        totalCuratedEmbeddings: totalEmbeddings,
        curationRatio: `${curationRatio}%`,
        totalStockSnapshots: totalSnapshots,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
