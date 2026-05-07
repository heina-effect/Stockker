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
  _meta?: any;
}

export interface SentimentScore {
  score: number; // 0 to 100
  label: "긍정" | "중립" | "부정";
  trend: "up" | "down" | "flat";
  positiveFactors: string[];
  negativeFactors: string[];
  basisSources: SourceItem[];
  freshness: FreshnessState;
  generatedAt: string;
  _meta?: any;
}

export interface IssueCluster {
  id: string;
  title: string;
  summary: string;
  sentiment: "positive" | "negative" | "neutral";
  representativeSource: string;
  sourceCount: number;
  relatedSymbols?: string[];
  basisSourceIds?: string[];   // IDs referencing SourceItem.id
  timestamp: string;
}

export interface SourceItem {
  id: string;
  sourceType: "news" | "disclosure" | "analyst";
  title: string;
  provider: string;
  collectedAt: string;
  generatedAt?: string;
  url?: string;
}

export interface BuyPricePlan {
  targetPrice: number;
  currentProfitLossRate: number;
  positionAnalysis: string;
  actionGuides: string[];
  generatedAt: string;
  _meta?: any;
}

export interface RelatedStock {
  symbol: string;
  name: string;
  reason: string;
  price?: number;
  changeRate?: number;
  freshness?: FreshnessState;
}

export interface ResearchSourceItem {
  id: string;
  title: string;
  publisher: string;
  publishedAt: string;
  url?: string;
}

export interface RecommendationReason {
  summary: string;
  sourceType?: "news" | "disclosure" | "technical" | "fundamental";
  referenceId?: string;
}

export interface RecommendationCandidate {
  id: string;
  type: "stock" | "sector";
  targetId: string; // symbol or sectorId
  name: string;
  recommendationType: "ai_pick" | "close_watch" | "checklist";
  reasons: RecommendationReason[];
  riskSummary: string;
  confidenceScore?: number; // 0 to 100
  disclaimer: string;
  generatedAt: string;
  _meta?: any;
}

export interface TrendSurfaceItem {
  id: string;
  type: "issue" | "stock" | "sector";
  title: string;
  description: string;
  targetId?: string; // related symbol or sectorId
  trendStrength: number; // 0 to 100
  timestamp: string;
}

export interface SectorTheme {
  sectorId: string;
  name: string;
  aliases: string[];
  description: string;
  memberSymbols: string[];
  representativeSymbols: string[];
}
