import { IssueCluster, SourceItem } from "@/types/research";
import { getSearchMaster } from "@/lib/stocks/search-master";

function extractRelatedSymbols(source: SourceItem): string[] {
    const text = `${source.title} ${source.snippet || ""} ${source.rawTextForEmbedding || ""}`.toLowerCase().replace(/\s+/g, "");
    return getSearchMaster()
        .filter(item => item.type === "stock")
        .filter(item => text.includes(item.symbol) || text.includes(item.name.toLowerCase().replace(/\s+/g, "")))
        .map(item => item.symbol)
        .slice(0, 6);
}

export function rankAndCluster(sources: SourceItem[]): IssueCluster[] {
    // Take top 5 sources ordered by recency (normalizeSources already sorted them)
    return sources.slice(0, 5).map((s, idx) => ({
        id: `cluster-${idx}-${s.id}`,
        title: s.title,
        summary: `${s.provider} 발 소식: ${s.title}`,
        sentiment: s.sourceType === "disclosure" ? "neutral" : "positive",
        representativeSource: s.provider,
        sourceCount: 1,
        relatedSymbols: extractRelatedSymbols(s),
        basisSourceIds: [s.id],
        timestamp: s.generatedAt || s.collectedAt,
    }));
}
