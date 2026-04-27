import type { 
  StockSearchItem, 
  StockReportSummary, 
  SentimentInsight, 
  IssueItem, 
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

export const mockReportSummary = (symbol: string): StockReportSummary => ({
  symbol,
  name: symbol === "005930" ? "삼성전자" : symbol === "000660" ? "SK하이닉스" : "Unknown",
  currentPrice: symbol === "005930" ? 75000 : 150000,
  change: 1500,
  changeRate: 2.0,
  aiHeadline: "반도체 수급 개선 및 HBM3 수주 기대로 단기 모멘텀 유지",
  aiSummary: "최근 글로벌 파운드리 수요 회복과 AI 가속기 탑재 메모리 공급 부족 현상이 겹치며, 관련 밸류체인 전 영역에서 기대감이 높아지고 있습니다. 특히 4분기 실적 컨센서스를 상회할 가능성이 제기되면서 기관 매수세가 강하게 유입 중입니다.",
  priceFreshness: "live",
  reportFreshness: "recent",
  lastUpdated: new Date().toISOString()
});

export const mockSentiment = (symbol: string): SentimentInsight => ({
  score: 75,
  label: "강세",
  positiveFactors: [
    "HBM 양산 본궤도 진입 및 주요 고객사 인증 임박",
    "파운드리 가동률 상승에 따른 고정비 완화 구조 진입",
    "외국인 연속 순매수 기록 지속"
  ],
  negativeFactors: [
    "경쟁사 대비 차세대 공정 수율 확보 지연 가능성",
    "글로벌 거시 경제 불확실성에 따른 하반기 세트(Set) 수요 부진 우려"
  ],
  freshness: "recent",
  lastUpdated: new Date().toISOString()
});

export const mockIssues = (symbol: string): IssueItem[] => [
  {
    id: "issue-1",
    title: "AI 메모리 수요 폭발... 차세대 HBM 수주전 승자는?",
    summary: "글로벌 빅테크들의 자체 AI 칩 개발 가속화로 인해 커스텀 다이(Custom Die)를 포함한 차세대 메모리 요구치가 급증하고 있습니다.",
    timestamp: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
    source: "한국경제",
    sourceType: "news",
    impact: "positive"
  },
  {
    id: "issue-2",
    title: "반도체 장비 반입량 증가세 지속, 업사이클 초입 분석",
    summary: "관세청 수출입 무역통계에 따르면, 핵심 장비 수입액이 전년 평균을 상회하며 Capa 확장 신호로 해석됩니다.",
    timestamp: new Date(Date.now() - 1000 * 60 * 120).toISOString(),
    source: "증권사 리포트",
    sourceType: "analyst",
    impact: "positive"
  },
  {
    id: "issue-3",
    title: "경쟁사 3분기 어닝쇼크 발표, 섹터 투자 심리 일시 냉각 우려",
    summary: "동종 업계 경쟁사의 예상 밖 부진으로 전반적인 IT 섹터 밸류에이션 재점검 필요성이 제기됨.",
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 5).toISOString(),
    source: "금융감독원",
    sourceType: "disclosure",
    impact: "negative"
  }
];

export const mockBuyPlan = (symbol: string, targetPrice: number): BuyPricePlan => {
  const current = symbol === "005930" ? 75000 : 150000;
  const plRate = ((current - targetPrice) / targetPrice) * 100;
  
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
  { symbol: "000660", name: "SK하이닉스", reason: "AI 메모리 경쟁 동종 섹터", price: 152000, changeRate: 1.5 },
  { symbol: "042700", name: "한미반도체", reason: "TC 본더 등 핵심 장비 밸류체인", price: 82000, changeRate: -0.5 },
  { symbol: "039030", name: "이오테크닉스", reason: "후공정 레이저 장비 공급", price: 125000, changeRate: 3.2 }
];
