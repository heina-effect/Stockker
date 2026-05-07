import fs from "fs";
import path from "path";
import { STOCK_UNIVERSE } from "./metadata";
import { SECTOR_UNIVERSE } from "@/data/sectors/taxonomy";

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
  // Add other legacy names or aliases here
};

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
      master.set(c.stock_code, {
        symbol: c.stock_code,
        name: c.corp_name,
        type: "stock",
        market: "KRX",
        aliases: CUSTOM_ALIASES[c.stock_code] || []
      });
    }
  } catch (e) {
    console.error("Failed to load corp-master.json for search index", e);
  }

  // 2. Merge STOCK_UNIVERSE (will override corp-master if present)
  for (const [symbol, meta] of Object.entries(STOCK_UNIVERSE)) {
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

export function searchStock(query: string) {
  const normQuery = query.toLowerCase().replace(/\s+/g, "");
  if (!normQuery) return [];

  const master = getSearchMaster();
  
  return master
    .map(item => {
      let matchScore = 0;
      
      // Exact match
      if (item.symbol === normQuery || item.name === query) {
        matchScore = 100;
      } 
      // Alias match
      else if (item.aliases.some(a => a === query || a.replace(/\s+/g,"") === normQuery)) {
        matchScore = 95;
      }
      // Substring match
      else if (item.name.toLowerCase().includes(normQuery) || item.symbol.includes(normQuery)) {
        matchScore = 50;
      }
      // Alias substring match
      else if (item.aliases.some(a => a.toLowerCase().includes(normQuery))) {
        matchScore = 40;
      }

      return { ...item, matchScore };
    })
    .filter(item => item.matchScore > 0)
    .sort((a, b) => b.matchScore - a.matchScore)
    .slice(0, 6);
}
