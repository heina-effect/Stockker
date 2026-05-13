import corpMaster from "@/data/dart/corp-master.json";
import { SECTOR_UNIVERSE, resolveSectorId } from "@/data/sectors/taxonomy";
import { STOCK_UNIVERSE, type StockMetadata } from "./metadata";

export type MasterValidationSeverity = "error" | "warning";

export interface MasterValidationIssue {
  severity: MasterValidationSeverity;
  code: string;
  symbol?: string;
  message: string;
}

const DISPLAY_NAME_ALIASES: Record<string, string[]> = {
  "005380": ["현대자동차"],
  "036570": ["NC"],
  "010120": ["엘에스일렉트릭"],
  "000810": ["삼성화재해상보험"],
  "000060": ["메리츠화재해상보험"],
  "010620": ["에이치디현대미포"],
  "030200": ["케이티"],
};

function corpNameBySymbol(): Record<string, string> {
  const map: Record<string, string> = {};
  for (const row of Object.values(corpMaster as Record<string, any>)) {
    if (row?.stock_code && row?.corp_name) map[row.stock_code] = row.corp_name;
  }
  return map;
}

function sectorIdForMemberSymbol(symbol: string): string | null {
  for (const sector of Object.values(SECTOR_UNIVERSE)) {
    if (sector.memberSymbols.includes(symbol)) return sector.sectorId;
  }
  return null;
}

function isAcceptedDisplayName(symbol: string, name: string, dartName: string): boolean {
  if (name === dartName) return true;
  return (DISPLAY_NAME_ALIASES[symbol] || []).includes(dartName);
}

export function validateStaticMaster(): MasterValidationIssue[] {
  const issues: MasterValidationIssue[] = [];
  const dartNames = corpNameBySymbol();

  for (const [symbol, stock] of Object.entries(STOCK_UNIVERSE)) {
    if (stock.market === "INDEX" || stock.market === "ETF") continue;

    const dartName = dartNames[symbol];
    if (!dartName) {
      issues.push({
        severity: "warning",
        code: "stock_missing_in_dart",
        symbol,
        message: `${symbol} ${stock.name} is not present in local DART corp-master`,
      });
    } else if (!isAcceptedDisplayName(symbol, stock.name, dartName)) {
      issues.push({
        severity: "error",
        code: "stock_name_mismatch",
        symbol,
        message: `${symbol} metadata name "${stock.name}" does not match DART "${dartName}"`,
      });
    }

    const hasCanonicalSector = Boolean(sectorIdForMemberSymbol(symbol) || resolveSectorId(stock.sector));
    if (stock.sector && !hasCanonicalSector) {
      issues.push({
        severity: "warning",
        code: "stock_sector_unmapped",
        symbol,
        message: `${symbol} ${stock.name} has sector tag "${stock.sector}" that is not canonical`,
      });
    }
  }

  for (const sector of Object.values(SECTOR_UNIVERSE)) {
    for (const symbol of sector.memberSymbols) {
      const stock: StockMetadata | undefined = STOCK_UNIVERSE[symbol];
      const dartName = dartNames[symbol];
      if (!stock && !dartName) {
        issues.push({
          severity: "error",
          code: "sector_member_unknown_symbol",
          symbol,
          message: `${sector.sectorId} includes unknown member symbol ${symbol}`,
        });
      }
      if (stock && dartName && !isAcceptedDisplayName(symbol, stock.name, dartName)) {
        issues.push({
          severity: "error",
          code: "sector_member_name_mismatch",
          symbol,
          message: `${sector.sectorId} member ${symbol} metadata name "${stock.name}" does not match DART "${dartName}"`,
        });
      }
    }

    for (const symbol of sector.representativeSymbols) {
      if (!sector.memberSymbols.includes(symbol)) {
        issues.push({
          severity: "error",
          code: "representative_not_member",
          symbol,
          message: `${sector.sectorId} representative ${symbol} is not in memberSymbols`,
        });
      }
    }
  }

  return issues;
}

export function assertStaticMasterValid(): void {
  const errors = validateStaticMaster().filter(issue => issue.severity === "error");
  if (errors.length > 0) {
    throw new Error(errors.map(issue => `[${issue.code}] ${issue.message}`).join("\n"));
  }
}
