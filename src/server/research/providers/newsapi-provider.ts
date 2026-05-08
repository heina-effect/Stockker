import { SourceItem } from "@/types/research";
import { getServerStockName } from "@/lib/stocks/search-master";

export interface NewsApiProviderConfig {
  symbol: string;
  limit?: number;
}

export async function fetchNewsApi(config: NewsApiProviderConfig): Promise<SourceItem[]> {
  const apiKey = process.env.NEWSAPI_KEY;
  if (!apiKey) {
    console.warn("[NewsAPI] API key not configured, skipping.");
    return [];
  }

  const companyName = getServerStockName(config.symbol);
  if (!companyName) return [];

  // NewsAPI endpoint
  // search in title or description, language korean
  const q = encodeURIComponent(`"${companyName}" OR "${config.symbol}"`);
  const limit = config.limit || 10;
  const url = `https://newsapi.org/v2/everything?q=${q}&language=ko&sortBy=publishedAt&pageSize=${limit}`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000); // 8s timeout
    const response = await fetch(url, { 
        headers: { "X-Api-Key": apiKey },
        signal: controller.signal 
    });
    clearTimeout(timeout);

    if (!response.ok) {
      if (response.status === 429) {
         console.warn("[NewsAPI] Rate limit exceeded.");
         return [];
      }
      throw new Error(`[NewsAPI] HTTP error ${response.status}`);
    }

    const data = await response.json();
    if (!data.articles || !Array.isArray(data.articles)) {
      return [];
    }

    return data.articles
      .filter((article: any) => article.title && article.title !== "[Removed]")
      .map((article: any, idx: number) => {
        const providerName = article.source?.name || "NewsAPI";
        return {
          id: `newsapi-${config.symbol}-${Date.now()}-${idx}`,
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
      console.warn(`[NewsAPI] Timeout fetching for ${config.symbol}`);
    } else {
      console.error(`[NewsAPI] Failed to fetch for ${config.symbol}:`, error.message);
    }
    return [];
  }
}
