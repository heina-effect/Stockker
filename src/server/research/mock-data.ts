import type { 
  StockSearchItem, 
  StockReportSummary, 
  SentimentScore, 
  IssueCluster,
  SourceItem,
  BuyPricePlan, 
  RelatedStock 
} from "@/types/research";

export const mockSearchData: StockSearchItem[] = [
  { symbol: "005930", name: "삼성전자", type: "stock", market: "KOSPI", matchScore: 100 },
  { symbol: "000660", name: "SK하이닉스", type: "stock", market: "KOSPI", matchScore: 90 },
  { symbol: "035420", name: "NAVER", type: "stock", market: "KOSPI", matchScore: 80 },
  { symbol: "035720", name: "카카오", type: "stock", market: "KOSPI", matchScore: 70 },
  { symbol: "0001", name: "KOSPI", type: "index", matchScore: 60 },
];

import { getServerStockName } from "@/lib/stocks/search-master";

export const mockReportSummary = (symbol: string): StockReportSummary => {
  const name = getServerStockName(symbol);
  return {
    symbol,
    name,
    currentPrice: symbol === "005930" ? 75000 : symbol === "000660" ? 182000 : 150000,
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

export const mockIssues = (symbol: string): { clusters: any[], sources: any[] } => ({
  clusters: [
    {
      id: "cluster-1",
      title: "AI 메모리 수요 폭발... 차세대 HBM 수주전 승자는?",
      summary: "글로벌 빅테크들의 자체 AI 칩 개발 가속화로 인해 커스텀 다이(Custom Die)를 포함한 차세대 메모리 요구치가 급증하고 있습니다.",
      sentiment: "positive",
      representativeSource: "한국경제",
      sourceCount: 3,
      timestamp: new Date(Date.now() - 1000 * 60 * 30).toISOString()
    },
    {
      id: "cluster-2",
      title: "경쟁사 3분기 어닝쇼크 발표",
      summary: "동종 업계 경쟁사의 예상 밖 부진으로 전반적인 IT 섹터 밸류에이션 재점검 필요성이 제기됨.",
      sentiment: "negative",
      representativeSource: "금융감독원",
      sourceCount: 1,
      timestamp: new Date(Date.now() - 1000 * 60 * 60 * 5).toISOString()
    }
  ],
  sources: [
    {
      id: "issue-1",
      title: "AI 메모리 수요 폭발... 차세대 HBM 수주전 승자는?",
      sourceType: "news",
      provider: "한국경제",
      collectedAt: new Date().toISOString(),
      generatedAt: new Date(Date.now() - 1000 * 60 * 30).toISOString()
    },
    {
      id: "issue-2",
      title: "반도체 장비 반입량 증가세 지속, 업사이클 초입 분석",
      sourceType: "analyst",
      provider: "증권사 리포트",
      collectedAt: new Date().toISOString(),
      generatedAt: new Date(Date.now() - 1000 * 60 * 120).toISOString()
    },
    {
      id: "issue-3",
      title: "경쟁사 3분기 어닝쇼크 발표, 섹터 투자 심리 일시 냉각 우려",
      sourceType: "disclosure",
      provider: "금융감독원",
      collectedAt: new Date().toISOString(),
      generatedAt: new Date(Date.now() - 1000 * 60 * 60 * 5).toISOString()
    }
  ]
});

import { calculateProfitLossRate } from "./buy-plan-utils";

export const mockBuyPlan = (symbol: string, targetPrice: number): BuyPricePlan => {
  const current = symbol === "005930" ? 75000 : 150000;
  const plRate = calculateProfitLossRate(current, targetPrice);
  
  let analysis = "현재가 대비 충분한 안전마진을 확보한 상태입니다.";
  let actionGuides = [
    "장기 보유 관점 유지 추천",
    "비중 확대를 고려할 만한 구간",
    "거시경제 이벤트만 주의할 것"
  ];

  if (plRate < -5) {
    analysis = "평균 매수가 대비 소폭 손실권에 위치해 있습니다.";
    actionGuides = [
      "추가 하락 시 분할 매수 관점 상시 오픈",
      "기술적 반등 구간(M/A 20일선)에서 비중 축소 후 재접근 전략",
      "현재 이슈 타임라인 모니터링 필수"
    ];
  }

  return {
    targetPrice,
    currentProfitLossRate: parseFloat(plRate.toFixed(2)),
    positionAnalysis: analysis,
    actionGuides,
    generatedAt: new Date().toISOString()
  };
};

export const mockRelatedStocks = (symbol: string): RelatedStock[] => [
  { symbol: "000660", name: "SK하이닉스", reason: "AI 메모리 경쟁 동종 섹터", price: 152000, changeRate: 1.5, freshness: "recent" },
  { symbol: "042700", name: "한미반도체", reason: "TC 본더 등 핵심 장비 밸류체인", price: 82000, changeRate: -0.5, freshness: "recent" },
  { symbol: "039030", name: "이오테크닉스", reason: "후공정 레이저 장비 공급", price: 125000, changeRate: 3.2, freshness: "recent" }
];
