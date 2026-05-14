import { NextRequest, NextResponse } from "next/server";
import { SECTOR_UNIVERSE } from "@/data/sectors/taxonomy";
import { getDomesticIndex, getDomesticStockQuote } from "@/server/kis/rest-client";
import { getStockName } from "@/lib/stocks/metadata";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ sectorId: string }> }
) {
  const { sectorId } = await params;
  const sector = SECTOR_UNIVERSE[sectorId];
  if (!sector) {
    return NextResponse.json({ ok: false, error: "Unknown sector" }, { status: 404 });
  }

  const representativeSymbols = sector.representativeSymbols.slice(0, 3);
  const quotes = await Promise.allSettled(representativeSymbols.map(symbol => getDomesticStockQuote(symbol)));
  const representativeQuotes = quotes.map((result, index) => {
    const symbol = representativeSymbols[index];
    if (result.status !== "fulfilled") {
      return { symbol, name: getStockName(symbol), quote: null };
    }
    return { symbol, name: getStockName(symbol), quote: result.value };
  });

  const firstQuote = representativeQuotes.find(item => item.quote?.kisIndustryCode)?.quote;
  let industryIndex = null;
  if (firstQuote?.kisIndustryCode) {
    try {
      industryIndex = await getDomesticIndex(firstQuote.kisIndustryCode);
    } catch {
      industryIndex = null;
    }
  }

  const validQuotes = representativeQuotes
    .map(item => item.quote)
    .filter((quote): quote is NonNullable<typeof quote> => !!quote && Number.isFinite(quote.changeRate));
  const avgRepresentativeChangeRate = validQuotes.length
    ? validQuotes.reduce((sum, quote) => sum + quote.changeRate, 0) / validQuotes.length
    : null;

  return NextResponse.json({
    ok: true,
    sectorId,
    sectorName: sector.name,
    industryCode: firstQuote?.kisIndustryCode ?? null,
    industryName: firstQuote?.kisIndustryName ?? null,
    industryIndex,
    representativeQuotes: representativeQuotes.map(item => ({
      symbol: item.symbol,
      name: item.name,
      price: item.quote?.price ?? null,
      changeRate: item.quote?.changeRate ?? null,
      volume: item.quote?.volume ?? null,
    })),
    avgRepresentativeChangeRate,
    whyNow: industryIndex
      ? `KIS 업종기간별시세 기준 ${industryIndex.name || sector.name} 흐름과 대표 종목 등락률을 함께 확인합니다.`
      : "",
    fetchedAt: new Date().toISOString(),
  });
}
