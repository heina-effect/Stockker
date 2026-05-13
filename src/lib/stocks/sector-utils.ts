import { SECTOR_UNIVERSE, type SectorTheme, resolveSectorId } from "@/data/sectors/taxonomy";
import { getStockMeta } from "@/lib/stocks/metadata";

export function getCanonicalSectorForSymbol(symbol: string): SectorTheme | null {
  for (const sector of Object.values(SECTOR_UNIVERSE)) {
    if (sector.memberSymbols.includes(symbol)) return sector;
  }

  const metaSector = getStockMeta(symbol)?.sector;
  const sectorId = resolveSectorId(metaSector);
  return sectorId ? SECTOR_UNIVERSE[sectorId] : null;
}

export function getSectorPeerSymbols(symbol: string, limit = 5): string[] {
  const sector = getCanonicalSectorForSymbol(symbol);
  if (!sector) return [];
  return sector.memberSymbols.filter(peer => peer !== symbol).slice(0, limit);
}
