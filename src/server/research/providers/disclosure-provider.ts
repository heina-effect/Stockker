import corpMaster from "@/data/dart/corp-master.json";
import { SourceItem } from "@/types/research";
import { getDBStockUniverse } from "@/lib/stocks/db-registry";

const DART_API_KEY = process.env.DART_API_KEY;

/**
 * Open DART API 기반 공시 수집 프로바이더.
 * 일일 허용건수 40,000건.
 */
export async function getDisclosures(symbol: string): Promise<SourceItem[]> {
    const universe = await getDBStockUniverse();
    const stock = universe[symbol];
    const stockName = stock?.name || symbol;
    const corpCodeObj = (corpMaster as Record<string, any>)[symbol];
    const corpCode = corpCodeObj?.corp_code;

    // Fallback if no corpCode found (e.g., Index or ETF)
    if (!DART_API_KEY) {
        console.warn("[Disclosure Provider] DART_API_KEY is missing in .env.local — returning empty.");
        return [];
    }
    if (!corpCode) {
        console.warn(`[Disclosure Provider] No corp_code found for ${symbol} — returning empty.`);
        return [];
    }

    try {
        const today = new Date();
        const bgnDate = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000); // last 30 days
        const bgnDe = bgnDate.toISOString().split('T')[0].replace(/-/g, '');
        const endDe = today.toISOString().split('T')[0].replace(/-/g, '');

        const response = await fetch(
            `https://opendart.fss.or.kr/api/list.json?crtfc_key=${DART_API_KEY}&corp_code=${corpCode}&bgn_de=${bgnDe}&end_de=${endDe}&page_count=10`,
            { next: { revalidate: 3600 } } // 1 hour cache to avoid rate limit
        );

        if (!response.ok) {
            throw new Error(`DART API HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        
        if (data.status !== "000") {
            // "013" means no data
            if (data.status === "013") return [];
            throw new Error(`DART API error: ${data.message}`);
        }

        return data.list.slice(0, 5).map((item: any) => {
            const dateStr = item.rcept_dt; // YYYYMMDD
            const timestamp = dateStr 
                ? new Date(`${dateStr.substring(0,4)}-${dateStr.substring(4,6)}-${dateStr.substring(6,8)}T00:00:00+09:00`).toISOString()
                : new Date().toISOString();

            return {
                id: `dart-${item.rcept_no}`,
                sourceType: "disclosure",
                title: `${stockName} 공시: ${item.report_nm}`,
                provider: "Open DART",
                collectedAt: new Date().toISOString(),
                generatedAt: timestamp,
                url: `https://dart.fss.or.kr/dsaf001/main.do?rcpNo=${item.rcept_no}`
            };
        });

    } catch (error) {
        console.warn(`[Disclosure Provider] API call failed for ${symbol}, returning empty. Error:`, error);
        return [];
    }
}

/** @internal Only exported for testing. Do NOT call in production code paths. */
export function getMockDisclosuresForTesting(symbol: string, stockName: string): SourceItem[] {
    void stockName;
    return [
        {
            id: `dart-${symbol}-1`,
            sourceType: "disclosure",
            title: `[기재정정]사업보고서 (2025.12)`,
            provider: "Open DART",
            collectedAt: new Date().toISOString(),
            generatedAt: new Date().toISOString(),
            url: `https://dart.fss.or.kr/`,
            _isMock: true,
        } as any,
        {
            id: `dart-${symbol}-2`,
            sourceType: "disclosure",
            title: `현금ㆍ현물배당결정`,
            provider: "Open DART",
            collectedAt: new Date().toISOString(),
            generatedAt: new Date(Date.now() - 86400000).toISOString(),
            url: `https://dart.fss.or.kr/`,
            _isMock: true,
        } as any
    ];
}
