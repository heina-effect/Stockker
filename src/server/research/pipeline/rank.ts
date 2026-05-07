import { IssueCluster, SourceItem } from "@/types/research";

export function rankAndCluster(sources: SourceItem[]): IssueCluster[] {
    // Basic clustering: Just map top sources to clusters for now
    const clusters: IssueCluster[] = sources.slice(0, 5).map((s, idx) => ({
        id: `cluster-${idx}-${s.id}`,
        title: s.title,
        summary: `AI 분석 요약: ${s.title} 관련 동향 및 시장 영향 예측.`,
        sentiment: s.sourceType === "disclosure" ? "neutral" : "positive", // Simple dummy logic
        representativeSource: s.provider,
        sourceCount: 1,
        timestamp: s.generatedAt || s.collectedAt
    }));

    return clusters;
}
