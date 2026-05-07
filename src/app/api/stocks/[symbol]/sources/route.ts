import { NextRequest, NextResponse } from "next/server";
import { collectRawSources } from "@/server/research/pipeline/collect";
import { normalizeSources } from "@/server/research/pipeline/normalize";
import { getServerStockName } from "@/lib/stocks/search-master";

export const runtime = "nodejs";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ symbol: string }> }
) {
  const symbol = (await params).symbol;
  const { searchParams } = new URL(req.url);
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
  const limit = Math.min(20, Math.max(1, parseInt(searchParams.get("limit") || "10", 10)));

  try {
    const name = getServerStockName(symbol);
    const { rawNews, disclosures } = await collectRawSources(symbol);
    const allSources = normalizeSources(rawNews, disclosures, { companyName: name });

    const total = allSources.length;
    const start = (page - 1) * limit;
    const items = allSources.slice(start, start + limit);
    const hasNext = start + limit < total;

    return NextResponse.json({
      ok: true,
      items,
      page,
      limit,
      total,
      nextPage: hasNext ? page + 1 : null,
      freshness: items.length > 0 ? "live" : "stale",
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
  }
}
