import { NextRequest, NextResponse } from "next/server";
import { generateReportSummary } from "@/server/research/model-router";

export const runtime = "nodejs";

export async function GET(req: NextRequest, { params }: { params: Promise<{ symbol: string }> }) {
  const symbol = (await params).symbol;
  try {
    const report = await generateReportSummary(symbol);
    return NextResponse.json({ ok: true, report });
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
  }
}
