import { NextRequest, NextResponse } from "next/server";
import { getStockAnalystOpinions } from "@/server/kis/analyst-opinion";
import { getDomesticStockQuote } from "@/server/kis/rest-client";

export const runtime = "nodejs";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ symbol: string }> }) {
  const symbol = (await params).symbol;
  try {
    const [opinionResult, quoteResult] = await Promise.allSettled([
      getStockAnalystOpinions(symbol),
      getDomesticStockQuote(symbol),
    ]);

    const opinionData = opinionResult.status === "fulfilled"
      ? opinionResult.value
      : {
          items: [],
          avgTargetPrice: 0,
          updatedAt: new Date().toISOString(),
        };

    const currentPrice = quoteResult.status === "fulfilled" ? quoteResult.value.price : undefined;

    return NextResponse.json({ ok: true, data: { ...opinionData, currentPrice } });
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
  }
}
