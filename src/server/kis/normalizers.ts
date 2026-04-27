import { type StockQuote, type StockOrderbook, type OrderbookLevel, type MarketIndex } from "@/types/stock";

/**
 * KIS 원시 데이터를 Stockker 공통 도메인 타입으로 변환하는 함수 모음
 */

export function normalizeKisDomesticQuote(output: Record<string, unknown>): StockQuote {
  const currentPrice = Number(output.stck_prpr);
  const change = Number(output.prdy_vrss);
  const changeRate = Number(output.prdy_ctrt);

  return {
    symbol: String(output.stck_shrn_iscd || ""),
    name: "", // KIS quote don't always provide name, UI should handle or merge
    price: currentPrice,
    change: change,
    changeRate: changeRate,
    volume: Number(output.acml_vol),
    high: Number(output.stck_hgpr),
    low: Number(output.stck_lwpr),
    open: Number(output.stck_oprc),
    timestamp: new Date().toISOString(),
  };
}

export function normalizeKisDomesticOrderbook(output: Record<string, unknown>): StockOrderbook {
  const levels: OrderbookLevel[] = [];

  // KIS typically provides 10 levels
  for (let i = 1; i <= 10; i++) {
    levels.push({
      askPrice: Number(output[`askp${i}`]),
      askSize: Number(output[`askp_rsqn${i}`]),
      bidPrice: Number(output[`bidp${i}`]),
      bidSize: Number(output[`bidp_rsqn${i}`]),
    });
  }

  return {
    symbol: "", // Filled by caller if needed
    levels,
    totalAskSize: Number(output.tot_askp_rsqn),
    totalBidSize: Number(output.tot_bidp_rsqn),
    timestamp: new Date().toISOString(),
  };
}

export function normalizeKisDomesticIndex(output: Record<string, unknown> | Record<string, unknown>[]): MarketIndex {
  let data: Record<string, unknown> = {};
  
  if (Array.isArray(output)) {
    // 배열일 경우 가장 최신값 찾기 (주식 기간별시세 또는 업종 기간별시세)
    data = output.find(item => Number(item.bstp_nmix_prpr || item.bstp_nmpr || item.idx_prpr || item.stck_prpr || 0) > 0) || output[0] || {};
  } else {
    data = output;
  }

  return {
    name: String(data.bstp_nm || data.idx_nm || data.hts_kor_isnm || ""), // 업종명 또는 지수명
    value: Number(data.bstp_nmix_prpr || data.bstp_nmpr || data.idx_prpr || data.stck_prpr || 0),   // 업종/지수 현재가
    change: Number(data.bstp_nmix_prdy_vrss || data.prdy_vrss || 0),  // 전일 대비
    changeRate: Number(data.bstp_nmix_prdy_ctrt || data.prdy_ctrt || 0), // 전일 대비율
  };
}
