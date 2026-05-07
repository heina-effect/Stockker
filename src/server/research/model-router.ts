import {
  mockReportSummary,
  mockSentiment,
  mockIssues,
  mockBuyPlan,
} from "./mock-data";
import type { BuyPricePlan, IssueCluster, SourceItem } from "@/types/research";
import { STOCK_UNIVERSE } from "@/lib/stocks/metadata";
import { collectRawSources } from "./pipeline/collect";
import { normalizeSources } from "./pipeline/normalize";
import { rankAndCluster } from "./pipeline/rank";
import { summarizeIssues } from "./pipeline/summarize";
import { generateRelatedStocks as genRelatedStocks } from "./pipeline/related-stocks";

/**
 * 리서치 AI 라우터
 */

import fs from "fs";
import path from "path";
import { SECTOR_UNIVERSE } from "@/data/sectors/taxonomy";

let corpMasterCache: any[] | null = null;
function getCorpMaster() {
  if (!corpMasterCache) {
    try {
      const p = path.join(process.cwd(), "src/data/dart/corp-master.json");
      corpMasterCache = JSON.parse(fs.readFileSync(p, "utf-8"));
    } catch (e) {
      corpMasterCache = [];
    }
  }
  return corpMasterCache;
}

export async function generateSearch(query: string) {
  const normQuery = query.toLowerCase().replace(/\s+/g, "");
  
  // 1. Search sectors
  const sectorResults = Object.values(SECTOR_UNIVERSE)
    .filter(sec => 
      sec.name.includes(normQuery) || 
      sec.aliases.some(a => a.toLowerCase().includes(normQuery)) ||
      sec.sectorId.toLowerCase().includes(normQuery)
    )
    .map(sec => ({
      symbol: sec.sectorId,
      name: sec.name,
      type: "sector",
      market: "SECTOR",
      matchScore: sec.name === query ? 100 : 80
    }));

  // 2. Search stocks from corp-master
  const corps = getCorpMaster() || [];
  const stockResults = corps
    .filter(c => 
      c.stock_code.includes(normQuery) || 
      c.corp_name.toLowerCase().includes(normQuery)
    )
    .map(c => ({
      symbol: c.stock_code,
      name: c.corp_name,
      type: "stock",
      market: "KRX", // corp-master doesn't have exact market, fallback
      matchScore: c.stock_code === normQuery || c.corp_name === query ? 100 : 50
    }))
    .slice(0, 5); // Limit performance

  // 3. Fallback to STOCK_UNIVERSE if corp-master fails
  let fallbackResults: any[] = [];
  if (stockResults.length === 0) {
    fallbackResults = Object.values(STOCK_UNIVERSE)
      .filter(item => 
        item.symbol.includes(normQuery) || 
        item.name.toLowerCase().includes(normQuery)
      )
      .map(item => ({
        symbol: item.symbol,
        name: item.name,
        type: item.market === "INDEX" ? "index" : "stock",
        market: item.market,
        matchScore: item.symbol === normQuery || item.name === query ? 100 : 50
      }))
      .slice(0, 5);
  }

  const results = [...sectorResults, ...(stockResults.length > 0 ? stockResults : fallbackResults)]
    .sort((a, b) => b.matchScore - a.matchScore)
    .slice(0, 6);

  return results;
}

export async function generateReportSummary(symbol: string) {
  // AI 요약
  return summarizeIssues(symbol, []);
}

export async function generateSentiment(symbol: string) {
  return mockSentiment(symbol);
}

export async function generateIssues(symbol: string): Promise<{ clusters: IssueCluster[], sources: SourceItem[] }> {
  try {
    const { rawNews, disclosures } = await collectRawSources(symbol);
    
    if ((!rawNews || rawNews.length === 0) && (!disclosures || disclosures.length === 0)) {
      return mockIssues(symbol) as any; // Fallback
    }

    const sources = normalizeSources(rawNews, disclosures);
    const clusters = rankAndCluster(sources);
    
    return { clusters, sources };
  } catch (e) {
    console.error(`[AI Router] generateIssues failed for ${symbol}:`, e);
    return mockIssues(symbol) as any;
  }
}

export async function generateBuyPlan(symbol: string, averagePrice: number): Promise<BuyPricePlan> {
  return mockBuyPlan(symbol, averagePrice);
}

export async function generateRelatedStocks(symbol: string) {
  return genRelatedStocks(symbol);
}
