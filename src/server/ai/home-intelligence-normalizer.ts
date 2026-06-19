import {
  resolveSectorId,
  type SectorId,
  type SectorTheme,
} from "@/data/sectors/taxonomy";
import type { EmbeddedSource } from "@/server/ai/vector-store";
import { getSearchMaster } from "@/lib/stocks/search-master";

export interface NormalizedTrendingSector {
  sectorId: SectorId;
  id: SectorId;
  name: string;
  whyNow: string;
  description: string;
  representativeSymbols: string[];
  sourceCount?: number;
  trendStrength?: number;
  basisSourceIds?: string[];
}

function asArray<T>(value: T[] | undefined | null): T[] {
  return Array.isArray(value) ? value : [];
}

function finiteNumber(value: unknown): number | undefined {
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function sourceCountsBySymbol(recentSources: EmbeddedSource[] = []): Map<string, number> {
  const counts = new Map<string, number>();
  for (const source of recentSources) {
    if (!source.symbol || source.isMock) continue;
    counts.set(source.symbol, (counts.get(source.symbol) || 0) + 1);
  }
  return counts;
}

function sourceIdsBySector(
  recentSources: EmbeddedSource[] = [],
  sectorUniverse: Record<string, SectorTheme>
): Map<SectorId, string[]> {
  const ids = new Map<SectorId, string[]>();
  for (const source of recentSources) {
    if (!source.symbol || source.isMock) continue;
    for (const [sectorId, sector] of Object.entries(sectorUniverse)) {
      if (!sector.memberSymbols.includes(source.symbol)) continue;
      const current = ids.get(sectorId as SectorId) || [];
      current.push(source.id);
      ids.set(sectorId as SectorId, current);
    }
  }
  return ids;
}

function normalizeRepresentativeSymbols(
  raw: any,
  sectorId: SectorId,
  sectorUniverse: Record<string, SectorTheme>
): string[] {
  const sector = sectorUniverse[sectorId];
  if (!sector) return [];
  const input = [
    ...asArray<string>(raw?.representativeSymbols),
    ...asArray<string>(raw?.leaders),
  ];
  const canonical = input.filter(symbol => sector.memberSymbols.includes(symbol));
  const fallback = sector.representativeSymbols.filter(symbol => sector.memberSymbols.includes(symbol));
  return Array.from(new Set(canonical.length > 0 ? canonical : fallback)).slice(0, 3);
}

function resolveRawSectorId(raw: any): SectorId | null {
  return (
    resolveSectorId(raw?.sectorId) ||
    resolveSectorId(raw?.id) ||
    resolveSectorId(raw?.name) ||
    resolveSectorId(raw?.theme) ||
    null
  );
}

function normalizeSectors(
  raw: any,
  recentSources: EmbeddedSource[] = [],
  sectorUniverse: Record<string, SectorTheme>
): NormalizedTrendingSector[] {
  const sectorSourceIds = sourceIdsBySector(recentSources, sectorUniverse);
  const rawSectors = [
    ...asArray<any>(raw?.trendingSectors),
    ...asArray<any>(raw?.sectors),
    ...asArray<any>(raw?.sectorMomentum),
  ];

  const seen = new Set<SectorId>();
  const normalized: NormalizedTrendingSector[] = [];

  for (const item of rawSectors) {
    const sectorId = resolveRawSectorId(item);
    if (!sectorId || seen.has(sectorId) || !Object.prototype.hasOwnProperty.call(sectorUniverse, sectorId)) continue;

    const sector = sectorUniverse[sectorId];
    const basisSourceIds = Array.from(new Set([
      ...asArray<string>(item?.basisSourceIds),
      ...(sectorSourceIds.get(sectorId) || []),
    ])).slice(0, 6);
    const sourceCount = finiteNumber(item?.sourceCount) ?? (basisSourceIds.length || undefined);
    if (!sourceCount || sourceCount <= 0) continue;
    const whyNow = String(item?.whyNow || item?.description || item?.reason || sector.description);

    normalized.push({
      sectorId,
      id: sectorId,
      name: sector.name,
      whyNow,
      description: whyNow,
      representativeSymbols: normalizeRepresentativeSymbols(item, sectorId, sectorUniverse),
      sourceCount,
      trendStrength: finiteNumber(item?.trendStrength ?? item?.strength),
      basisSourceIds,
    });
    seen.add(sectorId);
  }

  return normalized;
}

function normalizeStocks(raw: any, recentSources: EmbeddedSource[] = []) {
  const symbolCounts = sourceCountsBySymbol(recentSources);
  const master = getSearchMaster();

  return asArray<any>(raw?.stocks)
    .map(stock => {
      let symbol = stock?.symbol;
      let name = stock?.name;

      if (name) {
        const foundByName = master.find(s => s.name === name || (s.aliases && s.aliases.includes(name)));
        if (foundByName) {
          symbol = foundByName.symbol;
        } else if (symbol) {
          const foundBySymbol = master.find(s => s.symbol === symbol);
          if (foundBySymbol) {
            name = foundBySymbol.name;
          }
        }
      } else if (symbol) {
        const foundBySymbol = master.find(s => s.symbol === symbol);
        if (foundBySymbol) {
          name = foundBySymbol.name;
        }
      }

      const sourceCount = finiteNumber(stock?.sourceCount) ?? symbolCounts.get(symbol);

      return {
        ...stock,
        symbol,
        name,
        reason: stock?.whyNow || stock?.reason,
        sourceCount,
      };
    })
    .filter(stock => master.some(s => s.symbol === stock.symbol));
}

function normalizeAiPicks(raw: any) {
  const master = getSearchMaster();
  return asArray<any>(raw?.aiPicks)
    .map(pick => {
      if (pick.type !== "stock") return pick;

      let targetId = pick.targetId;
      let name = pick.name;

      if (name) {
        const foundByName = master.find(s => s.name === name || (s.aliases && s.aliases.includes(name)));
        if (foundByName) {
          targetId = foundByName.symbol;
        } else if (targetId) {
          const foundBySymbol = master.find(s => s.symbol === targetId);
          if (foundBySymbol) {
            name = foundBySymbol.name;
          }
        }
      } else if (targetId) {
        const foundBySymbol = master.find(s => s.symbol === targetId);
        if (foundBySymbol) {
          name = foundBySymbol.name;
        }
      }

      return {
        ...pick,
        targetId,
        name,
      };
    })
    .filter(pick => {
      if (pick.type === "stock") {
        return master.some(s => s.symbol === pick.targetId);
      }
      return true;
    });
}

export function normalizeHomeIntelligence(
  raw: any,
  recentSources: EmbeddedSource[] = [],
  sectorUniverse: Record<string, SectorTheme>
) {
  const trendingSectors = normalizeSectors(raw, recentSources, sectorUniverse);
  const stocks = normalizeStocks(raw, recentSources);
  const aiPicks = normalizeAiPicks(raw);

  return {
    ...raw,
    stocks,
    trendingSectors,
    sectors: trendingSectors,
    aiPicks,
  };
}
