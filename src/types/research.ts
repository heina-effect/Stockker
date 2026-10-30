export type FreshnessState = "live" | "recent" | "stale" | "loading" | "error";

export interface StockSearchItem {
  symbol: string;
  name: string;
  type: "stock" | "index" | "etf" | "sector";
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
  _isFallback?: boolean;
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

export type SourceQualityLabel = "high" | "medium" | "low" | "rejected";

export interface SourceItem {
  id: string;
  sourceType: "news" | "disclosure" | "analyst";
  title: string;
  snippet?: string;
  rawTextForEmbedding?: string;
  provider: string;
  collectedAt: string;
  generatedAt?: string;
  url?: string;
  language?: string;
  dedupeHash?: string;
  // Phase 19 quality metadata (optional, set by embedding curator)
  _qualityScore?: number;          // 0-100
  _qualityLabel?: SourceQualityLabel; // high / medium / low / rejected
  _strategyTags?: string[];         // e.g. ["earnings", "guidance"]
  _crossConfirmCount?: number;      // # of independent sources confirming same story
  _isMock?: boolean;               // internal flag
}

/**
 * 평단가 대비 현재 수익률 — 사실 세 가지(평단가·현재가·수익률)만 담는다.
 * 현재가 조회에 실패하면 priceStatus="unavailable" 이고 currentPrice·수익률은 null 이다.
 * 대체 가격을 넣지 않는다(2026-10-30 — 하드코딩 폴백 가격과 템플릿 대응 가이드 제거).
 */
export interface BuyPricePlan {
  targetPrice: number;
  currentPrice: number | null;
  currentProfitLossRate: number | null;
  priceStatus: "ok" | "unavailable";
  generatedAt: string;
}

export type RelationType = "sector_peer" | "issue_mention" | "supply_chain" | "disclosure_linked" | "peer" | "ai_inferred";

export interface RelatedStock {
  symbol: string;
  name: string;
  reason: string;
  relationType: RelationType;
  relationReason: string;
  basisSourceCount?: number;
  quoteMode: "live-sync" | "cached" | "unavailable";
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

export interface AnalystOpinionItem {
  firmName: string;
  opinion: string;
  targetPrice: number;
  date: string;
  prevOpinion?: string;
  prevTargetPrice?: number;
}

export interface AnalystOpinionSummary {
  items: AnalystOpinionItem[];
  avgTargetPrice: number;
  currentPrice?: number;
  updatedAt: string;
  _meta?: {
    source: "kis-openapi";
    kisMode: "real" | "mock";
    endpointMode: "real" | "mock";
    isMockData: false;
    note?: string;
  };
}
