import { aiGenerateHomeIntelligence } from "./orchestrator";

let cachedIntelligence: any = null;
let lastFetched = 0;
const TTL = 1000 * 60 * 15; // 15 minutes

let inFlightPromise: Promise<any> | null = null;

export async function getHomeIntelligence() {
  const now = Date.now();
  if (cachedIntelligence && now - lastFetched < TTL) {
    return cachedIntelligence;
  }

  if (inFlightPromise) {
    return inFlightPromise;
  }

  inFlightPromise = (async () => {
    try {
      const fresh = await aiGenerateHomeIntelligence();
      if (fresh) {
        cachedIntelligence = fresh;
        lastFetched = Date.now();
        return fresh;
      }
      return getMockHomeIntelligence();
    } catch (e) {
      console.error("[getHomeIntelligence Error]", e);
      return getMockHomeIntelligence();
    } finally {
      inFlightPromise = null;
    }
  })();

  return inFlightPromise;
}

function getMockHomeIntelligence() {
  return {
    issues: [
      {
        id: "issue-global-1",
        title: "연준 금리 동결, 하반기 IT 투자 심리 회복 기대감 상승",
        description: "글로벌 금리 인하 기대가 다소 후퇴했으나, AI 발 인프라 투자 지속으로 반도체 등 핵심 부품 공급망의 안정성이 부각되고 있습니다.",
        trendStrength: 95,
        timestamp: new Date().toISOString()
      }
    ],
    stocks: [
      {
        symbol: "005930",
        name: "삼성전자",
        reason: "HBM3E 양산 기대감",
        trendStrength: 92,
        changeRate: 1.5,
        price: 75000
      }
    ],
    sectors: [
      {
        id: "sec-semiconductor",
        name: "반도체",
        description: "글로벌 AI 인프라 투자 지속에 따른 실적 턴어라운드",
        trendStrength: 94,
        representativeSymbols: ["005930", "000660"]
      }
    ],
    aiPicks: [
      {
        id: "pick-1",
        type: "stock",
        targetId: "000660",
        name: "SK하이닉스",
        recommendationType: "close_watch",
        reasons: [{ summary: "외국인 연속 순매수 기록", sourceType: "technical" }],
        riskSummary: "단기 급등에 따른 차익 실현 매물 출회 가능성",
        disclaimer: "정보 제공 목적이며 투자 판단과 책임은 이용자 본인에게 있습니다."
      }
    ]
  };
}
