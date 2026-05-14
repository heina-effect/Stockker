import fs from "fs";
import path from "path";
import { STOCK_UNIVERSE } from "./metadata";
import { SECTOR_UNIVERSE } from "@/data/sectors/taxonomy";
import { isUnsupportedStockSymbol } from "./listing-status";

export interface StockMasterItem {
  symbol: string;
  name: string;
  type: "stock" | "index" | "etf" | "sector";
  market: string;
  aliases: string[];
}

let searchMasterCache: StockMasterItem[] | null = null;

const CUSTOM_ALIASES: Record<string, string[]> = {
  "329180": ["현대중공업", "HD현대중공업"],
  "079550": ["LIG넥스원", "엘아이지넥스원"],
  "000880": ["한화", "한화그룹"],
  // Add other legacy names or aliases here
};

const EXCLUDED_SYMBOLS = new Set([
  "037620", // 미래에셋증권 구형/우선주 중복
]);

export function getSearchMaster(): StockMasterItem[] {
  if (searchMasterCache) return searchMasterCache;

  const master: Map<string, StockMasterItem> = new Map();

  // 1. Load corp-master.json
  try {
    const p = path.join(process.cwd(), "src/data/dart/corp-master.json");
    const raw = fs.readFileSync(p, "utf-8");
    const corps = JSON.parse(raw);
    for (const c of Object.values(corps) as any[]) {
      if (!c.stock_code) continue;
      if (EXCLUDED_SYMBOLS.has(c.stock_code)) continue;
      if (isUnsupportedStockSymbol(c.stock_code)) continue;

      // Heuristic for market label
      let market = "KOSPI";
      if (c.stock_code.length === 6) {
        if (c.stock_code.startsWith("00")) {
          market = "KOSPI";
        } else {
          market = "KOSDAQ";
        }
      }

      master.set(c.stock_code, {
        symbol: c.stock_code,
        name: c.corp_name,
        type: "stock",
        market: market,
        aliases: CUSTOM_ALIASES[c.stock_code] || []
      });
    }
  } catch (e) {
    console.error("Failed to load corp-master.json for search index", e);
  }

  // 2. Merge STOCK_UNIVERSE (will override corp-master if present)
  for (const [symbol, meta] of Object.entries(STOCK_UNIVERSE)) {
    if (isUnsupportedStockSymbol(symbol)) continue;
    const existing = master.get(symbol);
    master.set(symbol, {
      symbol: meta.symbol,
      name: meta.name,
      type: meta.market === "INDEX" ? "index" : meta.market === "ETF" ? "etf" : "stock",
      market: meta.market,
      aliases: existing?.aliases || CUSTOM_ALIASES[symbol] || []
    });
  }

  // 3. Merge SECTOR_UNIVERSE
  for (const [sectorId, sec] of Object.entries(SECTOR_UNIVERSE)) {
    master.set(sectorId, {
      symbol: sec.sectorId,
      name: sec.name,
      type: "sector",
      market: "SECTOR",
      aliases: sec.aliases || []
    });
  }

  searchMasterCache = Array.from(master.values());
  return searchMasterCache;
}

export function getServerStockName(symbol: string): string {
  const master = getSearchMaster();
  const found = master.find(s => s.symbol === symbol);
  return found?.name || symbol;
}

export function rankSearchItems(query: string, master: StockMasterItem[]) {
  const normQuery = query.toLowerCase().replace(/\s+/g, "");
  if (!normQuery) return [];
  
  return master
    .map(item => {
      let matchScore = 0;
      const normName = item.name.toLowerCase().replace(/\s+/g, "");
      const normAliases = item.aliases.map(a => a.toLowerCase().replace(/\s+/g, ""));
      
      // Exact match
      if (item.symbol === normQuery || normName === normQuery) {
        matchScore = 120;
      } 
      // Alias match
      else if (normAliases.some(a => a === normQuery)) {
        matchScore = 110;
      }
      // Prefix match — exact-looking company names should beat broad substring matches
      else if (normName.startsWith(normQuery)) {
        matchScore = 80;
      }
      // Substring match
      else if (normName.includes(normQuery) || item.symbol.includes(normQuery)) {
        matchScore = 50;
      }
      // Alias substring match
      else if (normAliases.some(a => a.includes(normQuery))) {
        matchScore = 40;
      }

      return { ...item, matchScore };
    })
    .filter(item => item.matchScore > 0)
    .sort((a, b) => {
      if (b.matchScore !== a.matchScore) return b.matchScore - a.matchScore;
      const typePriority = (item: StockMasterItem) => item.type === "stock" ? 0 : item.type === "sector" ? 1 : 2;
      const typeDiff = typePriority(a) - typePriority(b);
      if (typeDiff !== 0) return typeDiff;
      return a.name.length - b.name.length;
    })
    .slice(0, 6);
}

export function searchStock(query: string) {
  return rankSearchItems(query, getSearchMaster());
}
