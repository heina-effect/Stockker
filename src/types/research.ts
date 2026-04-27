export type FreshnessState = "live" | "recent" | "stale" | "loading" | "error";

export interface StockSearchItem {
  symbol: string;
  name: string;
  type: "stock" | "index" | "etf";
  market?: string; 
  matchScore?: number;
}

export interface StockReportSummary {
  symbol: string;
  name: string;
  currentPrice: number;
  change: number;
  changeRate: number;
  aiHeadline: string;
  aiSummary: string;
  priceFreshness: FreshnessState;
  reportFreshness: FreshnessState;
  lastUpdated: string;
}

export interface SentimentInsight {
  score: number; // 0 (Worst) to 100 (Best)
  label: "강세" | "약세" | "중립" | "주의";
  positiveFactors: string[];
  negativeFactors: string[];
  freshness: FreshnessState;
  lastUpdated: string;
}

export interface IssueItem {
  id: string;
  title: string;
  summary: string;
  timestamp: string;
  source: string;
  sourceType: "news" | "disclosure" | "sns" | "analyst";
  impact: "positive" | "negative" | "neutral";
  url?: string;
}

export interface BuyPricePlan {
  targetPrice: number;
  currentProfitLossRate: number;
  positionAnalysis: string;
  actionGuides: string[];
  generatedAt: string;
}

export interface RelatedStock {
  symbol: string;
  name: string;
  reason: string;
  price?: number;
  changeRate?: number;
}

export interface ResearchSourceItem {
  id: string;
  title: string;
  publisher: string;
  publishedAt: string;
  url?: string;
}
