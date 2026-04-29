import { IssueItem } from "@/types/research";

export function normalizeSources(rawNews: any[], disclosures: any[]): IssueItem[] {
    const issues: IssueItem[] = (rawNews || []).slice(0, 10).map((item: any, idx: number) => {
        let timestamp = new Date().toISOString();
        if (item.data_dt && item.data_tm) {
            timestamp = new Date(
                item.data_dt.substring(0, 4) + "-" + 
                item.data_dt.substring(4, 6) + "-" + 
                item.data_dt.substring(6, 8) + "T" + 
                item.data_tm.substring(0, 2) + ":" + 
                item.data_tm.substring(2, 4) + ":00Z"
            ).toISOString();
        }

        return {
            id: `news-${idx}`,
            title: item.hts_kor_isnm || item.title || "뉴스 제목 없음",
            summary: item.cont || "본문 내용이 없습니다.",
            timestamp,
            source: item.isnm || "KIS News",
            sourceType: "news",
            impact: "neutral" // basic parsing
        };
    });

    const combined = [...issues, ...disclosures];

    const seenTitles = new Set<string>();
    return combined.filter(item => {
        if (seenTitles.has(item.title)) return false;
        seenTitles.add(item.title);
        return true;
    });
}
