import { NextRequest, NextResponse } from "next/server";
import { generateSentiment } from "@/server/research/model-router";
import { getVectorStore } from "@/server/ai/vector-store";

export const runtime = "nodejs";

export async function GET(req: NextRequest, { params }: { params: Promise<{ symbol: string }> }) {
  const symbol = (await params).symbol;
  try {
    const sentiment = await generateSentiment(symbol);

    // DB snapshot 경로에서 basisSources는 { id } 스텁만 포함 — 실제 소스 데이터로 resolve
    if (
      sentiment.basisSources?.length > 0 &&
      !(sentiment.basisSources[0] as any).title
    ) {
      try {
        const ids = sentiment.basisSources.map(s => s.id);
        const resolved = await getVectorStore().getSourcesByIds(ids);
        if (resolved.length > 0) {
          (sentiment as any).basisSources = resolved.map(s => ({
            id: s.id,
            title: s.title,
            url: s.url,
            sourceType: s.sourceType,
            generatedAt: s.publishedAt ?? s.collectedAt,
            collectedAt: s.collectedAt,
            _qualityLabel: s.qualityLabel,
            _qualityScore: s.qualityScore,
          }));
        }
      } catch {
        // non-fatal — UI에서 출처 없이 렌더링
      }
    }

    return NextResponse.json({ ok: true, sentiment });
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
  }
}
