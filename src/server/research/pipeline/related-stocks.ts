import { getServerStockName } from "@/lib/stocks/search-master";
import { getDBSectorUniverse } from "@/lib/stocks/db-registry";
import { getDomesticStockQuote } from "@/server/kis/rest-client";
import { resolveKisSectorId } from "@/server/kis/sector-map";
import type { RelatedStock } from "@/types/research";

async function findSectorForSymbol(symbol: string) {
  const universe = await getDBSectorUniverse();

  // 1차: taxonomy/DB memberSymbols 직접 매핑
  for (const sector of Object.values(universe)) {
    if (sector.memberSymbols.includes(symbol)) return sector;
  }

  // 2차: KIS quote의 bstp_cls_code로 업종 자동 추론
  try {
    const quote = await getDomesticStockQuote(symbol);
    const sectorId = resolveKisSectorId(quote.kisIndustryCode, quote.kisIndustryName);
    if (sectorId && universe[sectorId]) return universe[sectorId];
  } catch {
    // non-fatal
  }

  return null;
}

export async function generateRelatedStocks(symbol: string): Promise<RelatedStock[]> {
  const results: RelatedStock[] = [];
  const seen = new Set<string>([symbol]);

  // 1. Sector peers — deterministic, no API calls
  const sector = await findSectorForSymbol(symbol);
  if (sector) {
    const peers = sector.memberSymbols.filter(s => !seen.has(s)).slice(0, 3);
    for (const peerSymbol of peers) {
      seen.add(peerSymbol);
      results.push({
        symbol: peerSymbol,
        name: getServerStockName(peerSymbol),
        reason: `${sector.name} 섹터 동종 기업`,
        relationType: "sector_peer",
        relationReason: `${sector.name} 섹터 내 동종 기업으로 동일 시장 환경에 노출됨`,
        quoteMode: "live-sync",
      });
    }
  }

  // 2. Issue co-mentions — DB-first, non-blocking
  try {
    const { getVectorStore } = await import("@/server/ai/vector-store");
    const vectorStore = getVectorStore();
    const recentSources = await vectorStore.getRecentCuratedSources(symbol, 60 * 60 * 1000);
    if (recentSources && recentSources.length >= 2) {
      const { rankAndCluster } = await import("./rank");
      const clusters = rankAndCluster(recentSources);
      for (const cluster of clusters.slice(0, 4)) {
        if (!cluster.relatedSymbols) continue;
        for (const relSym of cluster.relatedSymbols) {
          if (seen.has(relSym) || results.length >= 5) continue;
          seen.add(relSym);
          results.push({
            symbol: relSym,
            name: getServerStockName(relSym),
            reason: cluster.title.length > 40 ? cluster.title.slice(0, 37) + "..." : cluster.title,
            relationType: "issue_mention",
            relationReason: `이슈 "${cluster.title.length > 30 ? cluster.title.slice(0, 27) + "..." : cluster.title}" 에서 함께 언급됨`,
            basisSourceCount: cluster.sourceCount,
            quoteMode: "live-sync",
          });
        }
      }
    }
  } catch (e) {
    console.warn("[RelatedStocks] Issue co-mention lookup failed (non-fatal):", e);
  }

  return results;
}
