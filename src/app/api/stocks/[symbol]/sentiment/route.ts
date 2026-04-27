import { NextRequest, NextResponse } from "next/server";
import { generateSentiment } from "@/server/research/model-router";

export const runtime = "nodejs";

export async function GET(req: NextRequest, { params }: { params: Promise<{ symbol: string }> }) {
  const symbol = (await params).symbol;
  try {
    const sentiment = await generateSentiment(symbol);
    return NextResponse.json({ ok: true, sentiment });
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
  }
}
