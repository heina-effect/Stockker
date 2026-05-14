export interface UnsupportedStockInfo {
  symbol: string;
  name: string;
  reason: "delisted" | "unsupported_market";
  note: string;
}

export const UNSUPPORTED_STOCKS: Record<string, UnsupportedStockInfo> = {
  "155960": {
    symbol: "155960",
    name: "지디",
    reason: "delisted",
    note: "DART corp-master에는 남아 있으나 상장폐지 이력이 있어 검색/상세 지원 대상에서 제외합니다.",
  },
  "248020": {
    symbol: "248020",
    name: "젬",
    reason: "unsupported_market",
    note: "KONEX 종목으로 KOSPI/KOSDAQ 중심 Stockker 런타임 지원 범위에서 제외합니다.",
  },
};

export function isUnsupportedStockSymbol(symbol: string | undefined | null): boolean {
  return Boolean(symbol && UNSUPPORTED_STOCKS[symbol]);
}

export function getUnsupportedStockInfo(symbol: string | undefined | null): UnsupportedStockInfo | null {
  if (!symbol) return null;
  return UNSUPPORTED_STOCKS[symbol] ?? null;
}
