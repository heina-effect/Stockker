import { NextRequest, NextResponse } from "next/server";
import { collectRawSources } from "@/server/research/pipeline/collect";
import { normalizeSources } from "@/server/research/pipeline/normalize";
import { getServerStockName } from "@/lib/stocks/search-master";
import { getVectorStore } from "@/server/ai/vector-store";

export const runtime = "nodejs";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ symbol: string }> }
) {
  const symbol = (await params).symbol;
  const { searchParams } = new URL(req.url);
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
  const limit = Math.min(20, Math.max(1, parseInt(searchParams.get("limit") || "5", 10)));

  try {
    const name = getServerStockName(symbol);

    // ── DB 우선 조회 (Supabase configured → use stored curated sources) ────
    const vectorStore = getVectorStore();
    const dbSources = await vectorStore.getRecentCuratedSources(symbol, 60 * 60 * 1000); // 1h window

    if (dbSources.length > 0) {
      const total = dbSources.length;
      const start = (page - 1) * limit;
      const items = dbSources.slice(start, start + limit).map(s => ({
        id: s.id,
        sourceType: s.sourceType,
        title: s.title,
        provider: s.provider,
        collectedAt: s.collectedAt,
        generatedAt: s.publishedAt,
        url: s.url,
        _qualityScore: s.qualityScore,
        _qualityLabel: s.qualityLabel,
        _strategyTags: s.strategyTags,
        _crossConfirmCount: s.crossConfirmCount,
      }));
      const hasMore = start + limit < total;

      return NextResponse.json({
        ok: true,
        sources: items,   // SourceListCard expects "sources"
        items,            // legacy alias
        page, limit, total,
        hasMore,
        nextPage: hasMore ? page + 1 : null,
        freshness: "cached",
        fromDb: true,
      });
    }

    // ── Fallback: 즉석 fetch + normalize ─────────────────────────────────
    const { rawNews, disclosures } = await collectRawSources(symbol);
    const allSources = normalizeSources(rawNews, disclosures, { companyName: name });

    const total = allSources.length;
    const start = (page - 1) * limit;
    const items = allSources.slice(start, start + limit);
    const hasMore = start + limit < total;

    return NextResponse.json({
      ok: true,
      sources: items,
      items,
      page, limit, total,
      hasMore,
      nextPage: hasMore ? page + 1 : null,
      freshness: items.length > 0 ? "live" : "stale",
      fromDb: false,
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
  }
}
