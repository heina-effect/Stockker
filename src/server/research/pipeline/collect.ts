import { fetchCompanyNews } from "@/server/research/providers/news-provider";
import { getDisclosures } from "@/server/research/providers/disclosure-provider";
import { fetchGNews } from "@/server/research/providers/gnews-provider";
import { fetchNewsApi } from "@/server/research/providers/newsapi-provider";

export async function collectRawSources(symbol: string) {
    const [kisNews, disclosures, gnews, newsapi] = await Promise.all([
        fetchCompanyNews({ symbol }).catch(() => []),
        getDisclosures(symbol).catch(() => []),
        fetchGNews({ symbol }).catch(() => []),
        fetchNewsApi({ symbol }).catch(() => [])
    ]);

    const rawNews = [...kisNews, ...gnews, ...newsapi];

    return { rawNews, disclosures };
}
