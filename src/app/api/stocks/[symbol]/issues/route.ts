import { NextRequest, NextResponse } from "next/server";
import { generateIssues } from "@/server/research/model-router";

export const runtime = "nodejs";

export async function GET(req: NextRequest, { params }: { params: Promise<{ symbol: string }> }) {
  const symbol = (await params).symbol;
  try {
    const data = await generateIssues(symbol);
    return NextResponse.json({ ok: true, clusters: data.clusters, sources: data.sources });
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
  }
}
