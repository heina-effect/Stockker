import { IssueCluster, SourceItem } from "@/types/research";

export function rankAndCluster(sources: SourceItem[]): IssueCluster[] {
    // Take top 5 sources ordered by recency (normalizeSources already sorted them)
    return sources.slice(0, 5).map((s, idx) => ({
        id: `cluster-${idx}-${s.id}`,
        title: s.title,
        summary: `${s.provider} 발 소식: ${s.title}`,
        sentiment: s.sourceType === "disclosure" ? "neutral" : "positive",
        representativeSource: s.provider,
        sourceCount: 1,
        basisSourceIds: [s.id],
        timestamp: s.generatedAt || s.collectedAt,
    }));
}
