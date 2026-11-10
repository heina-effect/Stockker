import type { StockReportSummary } from "@/types/research";
import { getServerStockName } from "@/lib/stocks/search-master";

export const mockReportSummary = (symbol: string): StockReportSummary => {
  const name = getServerStockName(symbol);
  return {
    symbol,
    name,
    currentPrice: 0, // 0 triggers UI fallback to live market price
    change: 0,
    changeRate: 0,
    aiHeadline: `${name} — 충분한 실시간 분석 근거를 확보하지 못했습니다`,
    aiSummary: `${name}에 대한 최신 뉴스 및 공시 데이터를 수집하지 못했거나, 분석에 필요한 근거가 부족합니다. 잠시 후 다시 시도하거나, 해당 종목의 최신 공시·뉴스를 직접 확인하시기 바랍니다.`,
    priceFreshness: "stale",
    reportFreshness: "stale",
    lastUpdated: new Date().toISOString()
  };
};

export const mockSentiment = (symbol: string): any => {
  const name = getServerStockName(symbol);
  return {
    score: 50,
    label: "중립",
    trend: "flat",
    positiveFactors: [
      `${name} 관련 최신 뉴스 수집 대기 중`,
    ],
    negativeFactors: [
      `${name} 관련 데이터 수집 불완전 — 실시간 데이터를 기반으로 한 분석이 이루어지지 않았습니다`,
    ],
    basisSources: [],
    freshness: "stale",
    generatedAt: new Date().toISOString(),
    _isFallback: true,
  };
};
