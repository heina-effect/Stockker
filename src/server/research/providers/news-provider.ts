import { IssueItem } from "@/types/research";
import { mockIssues } from "../mock-data";

export interface NewsProviderConfig {
  symbol: string;
  limit?: number;
}

/**
 * 리서치 파이프라인의 핵심: 뉴스/공시 수력 프로바이더 (Interface)
 * 향후 실제 API(예: KIS 뉴스검색, 네이버 뉴스 API 등)를 연동할 수 있도록 분리된 추상화 계층입니다.
 */
export async function fetchCompanyNews(config: NewsProviderConfig): Promise<IssueItem[]> {
  // 실제 연동 시 fetch('https://open-api.news.com/...', ...)
  // 현재는 외부 API 키 제약으로 Mock Fallback 사용
  const data = mockIssues(config.symbol);
  
  // 수집 시점 명시 (Pipeline 규칙)
  return data.map(item => ({
    ...item,
    timestamp: new Date().toISOString() // 수집 시점 갱신
  })).slice(0, config.limit || 5);
}
