import {
  SECTOR_UNIVERSE,
  isSectorId,
  resolveSectorId,
  type SectorId,
} from "@/data/sectors/taxonomy";
import type { EmbeddedSource } from "@/server/ai/vector-store";

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

function sourceIdsBySector(recentSources: EmbeddedSource[] = []): Map<SectorId, string[]> {
  const ids = new Map<SectorId, string[]>();
  for (const source of recentSources) {
    if (!source.symbol || source.isMock) continue;
    for (const [sectorId, sector] of Object.entries(SECTOR_UNIVERSE)) {
      if (!sector.memberSymbols.includes(source.symbol)) continue;
      const current = ids.get(sectorId as SectorId) || [];
      current.push(source.id);
      ids.set(sectorId as SectorId, current);
    }
  }
  return ids;
}

function normalizeRepresentativeSymbols(raw: any, sectorId: SectorId): string[] {
  const sector = SECTOR_UNIVERSE[sectorId];
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

function normalizeSectors(raw: any, recentSources: EmbeddedSource[] = []): NormalizedTrendingSector[] {
  const sectorSourceIds = sourceIdsBySector(recentSources);
  const rawSectors = [
    ...asArray<any>(raw?.trendingSectors),
    ...asArray<any>(raw?.sectors),
    ...asArray<any>(raw?.sectorMomentum),
  ];

  const seen = new Set<SectorId>();
  const normalized: NormalizedTrendingSector[] = [];

  for (const item of rawSectors) {
    const sectorId = resolveRawSectorId(item);
    if (!sectorId || seen.has(sectorId) || !isSectorId(sectorId)) continue;

    const sector = SECTOR_UNIVERSE[sectorId];
    const basisSourceIds = Array.from(new Set([
      ...asArray<string>(item?.basisSourceIds),
      ...(sectorSourceIds.get(sectorId) || []),
    ])).slice(0, 6);
    const sourceCount = finiteNumber(item?.sourceCount) ?? (basisSourceIds.length || undefined);
    const whyNow = String(item?.whyNow || item?.description || item?.reason || sector.description);

    normalized.push({
      sectorId,
      id: sectorId,
      name: sector.name,
      whyNow,
      description: whyNow,
      representativeSymbols: normalizeRepresentativeSymbols(item, sectorId),
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
  return asArray<any>(raw?.stocks).map(stock => {
    const sourceCount = finiteNumber(stock?.sourceCount) ?? symbolCounts.get(stock?.symbol);
    return {
      ...stock,
      reason: stock?.whyNow || stock?.reason,
      sourceCount,
    };
  });
}

export function normalizeHomeIntelligence(raw: any, recentSources: EmbeddedSource[] = []) {
  const trendingSectors = normalizeSectors(raw, recentSources);
  const stocks = normalizeStocks(raw, recentSources);

  return {
    ...raw,
    stocks,
    trendingSectors,
    sectors: trendingSectors,
  };
}
