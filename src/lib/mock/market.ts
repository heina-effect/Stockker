import { StockQuote, Orderbook, MarketIndex, PricePoint } from "@/types/stock";

export const MOCK_WATCHLIST: StockQuote[] = [
  {
    symbol: "005930",
    name: "삼성전자",
    price: 72500,
    change: 1200,
    changeRate: 1.68,
    volume: 12500000,
    high: 73000,
    low: 71500,
    open: 71800,
    timestamp: new Date().toISOString(),
  },
  {
    symbol: "000660",
    name: "SK하이닉스",
    price: 135000,
    change: -2500,
    changeRate: -1.82,
    volume: 3500000,
    high: 138000,
    low: 134500,
    open: 137500,
    timestamp: new Date().toISOString(),
  },
  {
    symbol: "035420",
    name: "NAVER",
    price: 215000,
    change: 500,
    changeRate: 0.23,
    volume: 850000,
    high: 218000,
    low: 214000,
    open: 215000,
    timestamp: new Date().toISOString(),
  },
  {
    symbol: "035720",
    name: "카카오",
    price: 52000,
    change: 1200,
    changeRate: 2.36,
    volume: 1500000,
    high: 52500,
    low: 50500,
    open: 51000,
    timestamp: new Date().toISOString(),
  },
  {
    symbol: "005380",
    name: "현대차",
    price: 198000,
    change: 0,
    changeRate: 0.0,
    volume: 450000,
    high: 200000,
    low: 197000,
    open: 198500,
    timestamp: new Date().toISOString(),
  },
];

export const MOCK_MARKET_INDICES: MarketIndex[] = [
  {
    name: "KOSPI",
    value: 2580.45,
    change: 15.2,
    changeRate: 0.59,
  },
  {
    name: "KOSDAQ",
    value: 865.12,
    change: -2.3,
    changeRate: -0.26,
  },
];

export const generateMockOrderbook = (symbol: string, basePrice: number): Orderbook => {
  const asks = Array.from({ length: 5 }, (_, i) => ({
    price: basePrice + (5 - i) * 100,
    volume: Math.floor(Math.random() * 10000) + 1000,
  }));
  const bids = Array.from({ length: 5 }, (_, i) => ({
    price: basePrice - (i + 1) * 100,
    volume: Math.floor(Math.random() * 10000) + 1000,
  }));

  return {
    symbol,
    asks,
    bids,
    timestamp: new Date().toISOString(),
  };
};

export const generateMockChartData = (basePrice: number, points: number = 30): PricePoint[] => {
  const data: PricePoint[] = [];
  let currentPrice = basePrice - 500;
  const now = new Date();

  for (let i = 0; i < points; i++) {
    const time = new Date(now.getTime() - (points - i) * 60000); // 1분 전부터 현재까지
    currentPrice += (Math.random() - 0.5) * 200;
    data.push({
      time: time.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" }),
      price: Math.floor(currentPrice),
    });
  }

  return data;
};
