import { NextRequest, NextResponse } from "next/server";
import { generateBuyPlan } from "@/server/research/model-router";

export const runtime = "nodejs";

export async function POST(req: NextRequest, { params }: { params: Promise<{ symbol: string }> }) {
  const symbol = (await params).symbol;
  try {
    const body = await req.json();
    const targetPrice = Number(body.targetPrice);

    if (isNaN(targetPrice) || targetPrice <= 0) {
      return NextResponse.json({ ok: false, error: "Invalid target price" }, { status: 400 });
    }

    const buyPlan = await generateBuyPlan(symbol, targetPrice);
    return NextResponse.json({ ok: true, buyPlan });
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
  }
}
