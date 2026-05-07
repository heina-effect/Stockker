import { fetchCompanyNews } from "@/server/research/providers/news-provider";
import { getDisclosures } from "@/server/research/providers/disclosure-provider";

export async function collectRawSources(symbol: string) {
    const [rawNews, disclosures] = await Promise.all([
        fetchCompanyNews({ symbol }).catch(() => []),
        getDisclosures(symbol).catch(() => [])
    ]);

    return { rawNews, disclosures };
}
