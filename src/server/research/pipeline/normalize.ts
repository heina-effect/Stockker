import { SourceItem } from "@/types/research";

const MAX_AGE_DAYS = 30;

export function normalizeSources(
  rawNews: SourceItem[],
  disclosures: SourceItem[],
  options?: { companyName?: string }
): SourceItem[] {
  const cutoff = Date.now() - MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
  const companyName = options?.companyName?.toLowerCase();

  const combined = [...(rawNews || []), ...(disclosures || [])];

  const seenTitles = new Set<string>();
  return combined
    .filter(item => {
      // 1) Mock 소스 제거
      if ((item as any)._isMock) return false;
      // 2) 제목 없음 제거
      if (!item.title || item.title === "제목 없음") return false;
      // 3) 날짜 기반 신선도 필터 (30일 이내)
      const ts = new Date(item.generatedAt || item.collectedAt).getTime();
      if (ts < cutoff) return false;
      // 4) 회사명 관련성 필터 (companyName 있을 때)
      if (companyName && companyName.length > 1) {
        const titleLower = item.title.toLowerCase();
        const hasRelevance = titleLower.includes(companyName.slice(0, 2)) ||
          item.provider !== "Mock News";
        if (!hasRelevance) return false;
      }
      return true;
    })
    .filter(item => {
      // 5) 제목 중복 제거
      const titleKey = item.title.replace(/\s+/g, "").toLowerCase();
      if (seenTitles.has(titleKey)) return false;
      seenTitles.add(titleKey);
      return true;
    })
    .sort(
      (a, b) =>
        new Date(b.generatedAt || b.collectedAt).getTime() -
        new Date(a.generatedAt || a.collectedAt).getTime()
    );
}
