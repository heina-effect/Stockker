export interface StockQuote {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changeRate: number;
  volume: number;
  high: number;
  low: number;
  open: number;
  timestamp: string;
  kisIndustryCode?: string; // bstp_cls_code (업종구분코드, e.g. "0013")
  kisIndustryName?: string; // bstp_kor_isnm (업종명, e.g. "전기·전자")
}

export interface OrderbookLevel {
  askPrice: number;
  askSize: number;
  bidPrice: number;
  bidSize: number;
}

export interface StockOrderbook {
  symbol: string;
  levels: OrderbookLevel[];
  totalAskSize?: number;
  totalBidSize?: number;
  timestamp: string;
}

export interface MarketIndex {
  name: string;
  value: number;
  change: number;
  changeRate: number;
}

export interface PricePoint {
  time: string;
  price: number;
}

export interface Orderbook {
  symbol: string;
  asks: { price: number; volume: number }[]; 
  bids: { price: number; volume: number }[]; 
  timestamp: string;
}
export enum MarketState {
  LIVE = 'live',                 // 정상 실시간 수신 중
  CONNECTING = 'connecting',     // 초기 연결 시도 중
  RECONNECTING = 'reconnecting', // 연결 끊김 후 재시도 중
  MOCK_FALLBACK = 'mock-fallback', // 실시간 실패 후 Mock으로 작동 중
  STALE = 'stale',               // 일정 시간 데이터 업데이트 없음
  ERROR = 'error'                // 치명적 에러 발생
}

export interface SymbolState {
  symbol: string;
  quote: StockQuote | null;
  orderbook: StockOrderbook | null;
  chart: PricePoint[];
  source: MarketState;
  lastUpdated: number;
}

export type MarketStore = Record<string, SymbolState>;

