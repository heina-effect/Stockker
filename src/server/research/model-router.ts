import {
  mockReportSummary,
  mockSentiment,
  mockIssues,
  mockBuyPlan,
  mockRelatedStocks
} from "./mock-data";
import { getDomesticStockNews } from "@/server/kis/rest-client";
import { getDisclosures } from "@/server/research/providers/disclosure-provider";
import type { BuyPricePlan, IssueItem } from "@/types/research";

/**
 * 리서치 AI 라우터
 * 현재는 LLM 키 바인딩 대신 결정론적 Mock 데이터를 반환합니다.
 * Phase 6/7 연동 시 `gemini-3.1-flash-lite-preview` / `gemini-3-flash-preview` 등으로 라우팅 됨.
 */

import { STOCK_UNIVERSE } from "@/lib/stocks/metadata";

export async function generateSearch(query: string) {
  const normQuery = query.toLowerCase().replace(/\s+/g, "");
  const results = Object.values(STOCK_UNIVERSE)
    .filter(item => 
      item.symbol.includes(normQuery) || 
      item.name.toLowerCase().includes(normQuery)
    )
    .map(item => ({
      symbol: item.symbol,
      name: item.name,
      type: item.market === "INDEX" ? "index" : "stock",
      market: item.market,
      matchScore: item.symbol === normQuery || item.name === query ? 100 : 50
    }))
    .sort((a, b) => b.matchScore - a.matchScore)
    .slice(0, 5);

  return results;
}

export async function generateReportSummary(symbol: string) {
  // 실제 LLM 연동 시:
  // - Gemini 3 Flash 사용해 간략 리포트 요약 생성
  return mockReportSummary(symbol);
}

export async function generateSentiment(symbol: string) {
  // 실제 LLM 연동 시:
  // - Gemini 3.1 Flash-Lite를 통해 여러 뉴스 파싱 후 구조화 JSON 반환
  return mockSentiment(symbol);
}

export async function generateIssues(symbol: string): Promise<IssueItem[]> {
  try {
    const [rawNews, disclosures] = await Promise.all([
      getDomesticStockNews(symbol).catch(() => []),
      getDisclosures(symbol).catch(() => [])
    ]);
    
    if ((!rawNews || rawNews.length === 0) && disclosures.length === 0) {
      return mockIssues(symbol); // Fallback to mock if both APIs fail
    }

    const issues: IssueItem[] = rawNews.slice(0, 5).map((item: any, idx: number) => ({
      id: `news-${idx}`,
      title: item.hts_kor_isnm || item.title || "뉴스 제목 없음",
      summary: item.cont || "본문 내용이 없습니다.",
      timestamp: new Date(
        item.data_dt?.substring(0, 4) + "-" + 
        item.data_dt?.substring(4, 6) + "-" + 
        item.data_dt?.substring(6, 8) + "T" + 
        (item.data_tm?.substring(0, 2) || "00") + ":" + 
        (item.data_tm?.substring(2, 4) || "00") + ":00Z"
      ).toISOString(),
      source: item.isnm || "KIS News",
      sourceType: "news",
      impact: "positive" // Initial sentiment - ideally LLM would score this
    }));

    // Merge news and disclosures
    const combined = [...issues, ...disclosures];
    
    // Dedup and sort
    const seenTitles = new Set<string>();
    return combined
      .filter(item => {
        if (seenTitles.has(item.title)) return false;
        seenTitles.add(item.title);
        return true;
      })
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, 10);
  } catch (e) {
    console.error(`[AI Router] generateIssues failed for ${symbol}:`, e);
    return mockIssues(symbol);
  }
}

export async function generateBuyPlan(symbol: string, averagePrice: number): Promise<BuyPricePlan> {
  // 사용자의 매수가를 기반으로 가이드 제공 (GPT 등 고도화 분석 활용 지점)
  return mockBuyPlan(symbol, averagePrice);
}

export async function generateRelatedStocks(symbol: string) {
  return mockRelatedStocks(symbol);
}
