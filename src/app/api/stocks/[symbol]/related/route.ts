import { NextRequest, NextResponse } from "next/server";
import { generateRelatedStocks } from "@/server/research/model-router";

export const runtime = "nodejs";

export async function GET(req: NextRequest, { params }: { params: Promise<{ symbol: string }> }) {
  const symbol = (await params).symbol;
  try {
    const related = await generateRelatedStocks(symbol);
    return NextResponse.json({ ok: true, related });
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
  }
}
