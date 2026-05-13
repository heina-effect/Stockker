import { NextRequest, NextResponse } from "next/server";
import { getStockAnalystOpinions } from "@/server/kis/analyst-opinion";

export const runtime = "nodejs";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ symbol: string }> }) {
  const symbol = (await params).symbol;
  try {
    const opinionData = await getStockAnalystOpinions(symbol).catch(() => ({
      items: [],
      avgTargetPrice: 0,
      updatedAt: new Date().toISOString(),
    }));

    return NextResponse.json({ ok: true, data: opinionData });
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
  }
}
