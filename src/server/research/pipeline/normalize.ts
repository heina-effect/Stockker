import { SourceItem } from "@/types/research";

export function normalizeSources(rawNews: SourceItem[], disclosures: SourceItem[]): SourceItem[] {
    const combined = [...(rawNews || []), ...(disclosures || [])];

    const seenTitles = new Set<string>();
    return combined.filter(item => {
        const titleKey = item.title.replace(/\s+/g, '').toLowerCase();
        if (seenTitles.has(titleKey)) return false;
        seenTitles.add(titleKey);
        return true;
    }).sort((a, b) => new Date(b.generatedAt || b.collectedAt).getTime() - new Date(a.generatedAt || a.collectedAt).getTime());
}
