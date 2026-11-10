import { SourceItem } from "@/types/research";
import { getServerStockName } from "@/lib/stocks/search-master";
import { describeHttpError } from "./http-error";

// djb2 hash → base36 string, deterministic per (symbol, title)
function stableId(prefix: string, symbol: string, title: string): string {
  const key = `${symbol}::${title}`;
  let h = 5381;
  for (let i = 0; i < key.length; i++) h = (((h << 5) + h) ^ key.charCodeAt(i)) >>> 0;
  return `${prefix}-${symbol}-${h.toString(36)}`;
}

export interface GNewsProviderConfig {
  symbol: string;
  limit?: number;
}

export async function fetchGNews(config: GNewsProviderConfig): Promise<SourceItem[]> {
  const apiKey = process.env.GNEWS_API_KEY;
  if (!apiKey) {
    console.warn("[GNews] API key not configured, skipping.");
    return [];
  }

  const companyName = getServerStockName(config.symbol);
  if (!companyName) return [];

  // GNews endpoint
  // lang=ko, country=kr
  const q = encodeURIComponent(`"${companyName}" OR "${config.symbol}"`);
  const limit = config.limit || 10;
  const url = `https://gnews.io/api/v4/search?q=${q}&lang=ko&country=kr&max=${limit}&apikey=${apiKey}&sortby=publishedAt`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000); // 8s timeout
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);

    if (!response.ok) {
      // 일일 한도 소진인지 초당 제한인지 가리려고 상태코드와 오류 메시지를 남긴다(URL·키는 남기지 않음).
      const detail = await describeHttpError(response, apiKey);
      if (response.status === 429) {
         console.warn(`[GNews] Rate limit exceeded for ${config.symbol}: ${detail}`);
         return [];
      }
      throw new Error(`[GNews] HTTP error ${detail}`);
    }

    const data = await response.json();
    if (!data.articles || !Array.isArray(data.articles)) {
      return [];
    }

    return data.articles.map((article: any) => {
      const providerName = article.source?.name || "GNews";
      return {
        id: stableId("gnews", config.symbol, article.title),
        sourceType: "news",
        title: article.title,
        snippet: article.description,
        rawTextForEmbedding: `${article.title} ${article.description || ""}`.trim(),
        provider: providerName,
        url: article.url,
        language: "ko",
        collectedAt: new Date().toISOString(),
        generatedAt: new Date(article.publishedAt).toISOString(),
      };
    });

  } catch (error: any) {
    if (error.name === "AbortError") {
      console.warn(`[GNews] Timeout fetching for ${config.symbol}`);
    } else {
      console.error(`[GNews] Failed to fetch for ${config.symbol}:`, error.message);
    }
    return [];
  }
}
