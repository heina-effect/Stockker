import { SourceItem } from "@/types/research";
import { getDomesticStockNews } from "@/server/kis/rest-client";

export interface NewsProviderConfig {
  symbol: string;
  limit?: number;
}

export async function fetchCompanyNews(config: NewsProviderConfig): Promise<SourceItem[]> {
  try {
    const rawNews = await getDomesticStockNews(config.symbol);
    if (!rawNews || rawNews.length === 0) {
      return [];
    }

    const seen = new Set<string>();
    const results: SourceItem[] = [];

    for (const item of rawNews) {
      const title = item.hts_kor_isnm || item.title || "제목 없음";
      if (seen.has(title)) continue;
      seen.add(title);

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

      results.push({
        id: `news-${item.data_dt}-${item.data_tm}-${Math.random().toString(36).substr(2, 9)}`,
        sourceType: "news",
        title: title,
        provider: item.isnm || "KIS News",
        collectedAt: new Date().toISOString(),
        generatedAt: timestamp,
      });

      if (results.length >= (config.limit || 10)) break;
    }

    return results.length > 0 ? results : [];

  } catch (e: any) {
    // getDomesticStockNews\uc5d0\uc11c \uc774\ubbf8 \ud574\ub2f9 \uc5d0\ub7ec\ub97c \ub85c\uae45\ud568 \u2014 \uc5ec\uae30\uc11c\ub294 debug\ub9cc
    console.debug(`[News Provider] fetch failed for ${config.symbol}:`, e?.message ?? e);
    return [];
  }
}

/** @internal Only exported for testing. Do NOT call in production code paths. */
export function getMockNewsForTesting(symbol: string): SourceItem[] {
  return [
    {
      id: `news-${symbol}-fallback-1`,
      sourceType: "news",
      title: `${symbol} 글로벌 시장 점유율 확대 전망`,
      provider: "Mock News",
      collectedAt: new Date().toISOString(),
      generatedAt: new Date(Date.now() - 3600000).toISOString(),
      _isMock: true,
    } as any,
    {
      id: `news-${symbol}-fallback-2`,
      sourceType: "news",
      title: `${symbol} 신제품 출시 및 실적 기대감`,
      provider: "Mock News",
      collectedAt: new Date().toISOString(),
      generatedAt: new Date(Date.now() - 7200000).toISOString(),
      _isMock: true,
    } as any
  ];
}
