import { NextRequest, NextResponse } from "next/server";
import { collectRawSources } from "@/server/research/pipeline/collect";
import { normalizeSources } from "@/server/research/pipeline/normalize";
import { getSearchMaster, getServerStockName } from "@/lib/stocks/search-master";
import { getVectorStore } from "@/server/ai/vector-store";
import { filterSourcesForSymbol } from "@/server/research/entity-guard";
import { getCanonicalSectorForSymbol } from "@/lib/stocks/sector-utils";

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
    const companyAliases = getSearchMaster().find(item => item.symbol === symbol)?.aliases || [];
    const sector = getCanonicalSectorForSymbol(symbol);

    // ── DB 우선 조회 (Supabase configured → use stored curated sources) ────
    const vectorStore = getVectorStore();
    const dbSources = await vectorStore.getRecentCuratedSources(symbol, 60 * 60 * 1000); // 1h window

    if (dbSources.length > 0) {
      // 날짜 내림차순 정렬 (publishedAt 우선, 없으면 collectedAt)
      const filteredDbSources = filterSourcesForSymbol(dbSources.map(s => ({
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
      })), symbol);
      const sorted = [...filteredDbSources].sort(
        (a, b) =>
          new Date(b.generatedAt || b.collectedAt).getTime() -
          new Date(a.generatedAt || a.collectedAt).getTime()
      );
      const total = sorted.length;
      const start = (page - 1) * limit;
      const items = sorted.slice(start, start + limit);
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
    const allSources = filterSourcesForSymbol(
      normalizeSources(rawNews, disclosures, { companyName: name, companyAliases, sectorMemberSymbols: sector?.memberSymbols }),
      symbol
    );

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
