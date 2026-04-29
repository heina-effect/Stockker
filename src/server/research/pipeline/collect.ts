import { getDomesticStockNews } from "@/server/kis/rest-client";
import { getDisclosures } from "@/server/research/providers/disclosure-provider";

export async function collectRawSources(symbol: string) {
    const [rawNews, disclosures] = await Promise.all([
        getDomesticStockNews(symbol).catch(() => []),
        getDisclosures(symbol).catch(() => [])
    ]);

    return { rawNews, disclosures };
}
