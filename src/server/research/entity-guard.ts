import type { IssueCluster, SourceItem, StockReportSummary } from "@/types/research";
import { SECTOR_UNIVERSE } from "@/data/sectors/taxonomy";
import { getSearchMaster, getServerStockName } from "@/lib/stocks/search-master";
import { getCanonicalSectorForSymbol } from "@/lib/stocks/sector-utils";

const MIN_BASIS_SOURCE_IDS = 2;

function normalize(value: string): string {
  return value.toLowerCase().replace(/\s+/g, "");
}

function aliasesForSymbol(symbol: string): string[] {
  const name = getServerStockName(symbol);
  const fromMaster = getSearchMaster().find(item => item.symbol === symbol);
  return Array.from(new Set([symbol, name, ...(fromMaster?.aliases || [])].filter(Boolean)));
}

function includesAny(text: string, candidates: string[]): boolean {
  const normalized = normalize(text);
  return candidates.some(candidate => {
    const c = normalize(candidate);
    return c.length >= 2 && normalized.includes(c);
  });
}

function sourceText(source: SourceItem): string {
  return [source.title, source.snippet, source.rawTextForEmbedding].filter(Boolean).join(" ");
}

function getOtherSectorKeywords(symbol: string): string[] {
  const ownSector = getCanonicalSectorForSymbol(symbol);
  const ownId = ownSector?.sectorId;
  return Object.values(SECTOR_UNIVERSE)
    .filter(sector => sector.sectorId !== ownId)
    .flatMap(sector => [sector.name, ...sector.aliases])
    .filter(keyword => normalize(keyword).length >= 2);
}

export function isSourceRelevantToSymbol(source: SourceItem, symbol: string): boolean {
  if ((source as any)._isMock) return false;
  const text = sourceText(source);
  const aliases = aliasesForSymbol(symbol);
  if (includesAny(text, aliases)) return true;

  const sector = getCanonicalSectorForSymbol(symbol);
  if (!sector) return false;

  const sectorMentioned = includesAny(text, [sector.name, ...sector.aliases]);
  const peerMentioned = sector.memberSymbols
    .filter(member => member !== symbol)
    .some(member => includesAny(text, aliasesForSymbol(member)));

  return sectorMentioned && !peerMentioned;
}

export function filterSourcesForSymbol(sources: SourceItem[], symbol: string): SourceItem[] {
  return sources.filter(source => isSourceRelevantToSymbol(source, symbol));
}

export function filterClustersForSymbol(clusters: IssueCluster[], sources: SourceItem[], symbol: string): IssueCluster[] {
  const validSourceIds = new Set(filterSourcesForSymbol(sources, symbol).map(source => source.id));
  const aliases = aliasesForSymbol(symbol);
  const otherSectorKeywords = getOtherSectorKeywords(symbol);

  return clusters.filter(cluster => {
    const text = [cluster.title, cluster.summary].join(" ");
    const hasValidBasis = (cluster.basisSourceIds || []).some(id => validSourceIds.has(id));
    const hasCompanyMention = includesAny(text, aliases);
    const hasOtherSectorOnly = includesAny(text, otherSectorKeywords) && !hasCompanyMention;
    return (hasValidBasis || hasCompanyMention) && !hasOtherSectorOnly;
  });
}

export function getEvidenceState(sourceCount: number) {
  if (sourceCount >= 3) return { state: "live" as const, label: "근거 충분" };
  if (sourceCount >= 2) return { state: "recent" as const, label: "근거 보통" };
  if (sourceCount >= 1) return { state: "stale" as const, label: "근거 부족" };
  return { state: "stale" as const, label: "최신 데이터 없음" };
}

export function hasUsableSnapshotEvidence(snapshot: { basis_source_ids?: string[] | null; is_fallback?: boolean | null }) {
  return !snapshot.is_fallback && (snapshot.basis_source_ids || []).length >= MIN_BASIS_SOURCE_IDS;
}

export function applyReportEvidence(report: StockReportSummary, sourceCount: number): StockReportSummary {
  const evidence = getEvidenceState(sourceCount);
  return {
    ...report,
    reportFreshness: evidence.state,
    _meta: { ...(report._meta || {}), evidenceLabel: evidence.label, evidenceSourceCount: sourceCount },
  };
}
