import { STOCK_UNIVERSE } from "@/lib/stocks/metadata";

export interface DisclosureItem {
    id: string;
    title: string;
    summary: string;
    timestamp: string;
    source: string;
    sourceType: "disclosure";
    impact: "positive" | "negative" | "neutral";
    link?: string;
}

/**
 * Open DART API 또는 유사한 공시 제공자 인터페이스.
 * 현재는 Open DART API 연동을 위한 규격과 Fallback을 제공합니다.
 */
export async function getDisclosures(symbol: string): Promise<DisclosureItem[]> {
    // TODO: Phase 11 이후 실제 DART_API_KEY 기반으로 Open DART API 연동
    // 현재는 구조 확립을 위한 Provider Interface 이며, 실패/미연동 시 Deterministic Fallback 반환
    
    const stock = Object.values(STOCK_UNIVERSE).find(s => s.symbol === symbol);
    const stockName = stock?.name || symbol;

    try {
        // 실제 API 호출 로직이 들어갈 자리 (예: fetch(`https://opendart.fss.or.kr/api/list.json?crtfc_key=${process.env.DART_API_KEY}&corp_code=${corpCode}`))
        // 강제로 에러를 발생시켜 fallback으로 넘어가도록 유도 (현재 API 키 없음)
        throw new Error("DART API Key missing or not configured");
    } catch (error) {
        console.warn(`[Disclosure Provider] API call failed for ${symbol}, using deterministic fallback. Error:`, error);
        
        // Deterministic Fallback
        return [
            {
                id: `dart-${symbol}-1`,
                title: `[기재정정]사업보고서 (2025.12)`,
                summary: `${stockName}의 2025년도 사업보고서 주요 기재사항 정정 (매출액 및 영업이익 등 핵심 지표 변동 없음)`,
                timestamp: new Date().toISOString(),
                source: "Open DART",
                sourceType: "disclosure",
                impact: "neutral",
                link: `https://dart.fss.or.kr/`
            },
            {
                id: `dart-${symbol}-2`,
                title: `현금ㆍ현물배당결정`,
                summary: `보통주 1주당 1,500원 현금 배당 결정. (배당기준일: 2025.12.31)`,
                timestamp: new Date(Date.now() - 86400000).toISOString(), // 1 day ago
                source: "Open DART",
                sourceType: "disclosure",
                impact: "positive",
                link: `https://dart.fss.or.kr/`
            }
        ];
    }
}
