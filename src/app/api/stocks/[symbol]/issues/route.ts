import { NextRequest, NextResponse } from "next/server";
import { generateIssues } from "@/server/research/model-router";
import { withDedupeAndCache } from "@/server/kis/cache";

export const runtime = "nodejs";

export async function GET(req: NextRequest, { params }: { params: Promise<{ symbol: string }> }) {
  const symbol = (await params).symbol;
  try {
    // 60초 TTL: IssueTimelineCard + SourceListCard 동시 요청에서 GNews 중복 호출 방지
    const data = await withDedupeAndCache(
      `issues_${symbol}`,
      60_000,
      () => generateIssues(symbol)
    );
    return NextResponse.json({ ok: true, clusters: data.clusters, sources: data.sources });
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
  }
}
