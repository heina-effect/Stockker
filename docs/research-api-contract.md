# Research API Contract

## 1. 개요
Stockker 리서치 도메인의 데이터 파이프라인 계약 및 인터페이스를 정의합니다.

## 2. Core Interfaces (`src/types/research.ts`)

### IssueItem (AI 이슈/리포트 원문)
```typescript
export interface IssueItem {
  id: string;             // 식별자 (news-{id}, dart-{id})
  title: string;          // 이슈/공시 제목
  summary: string;        // 본문 또는 AI 요약
  timestamp: string;      // 수집/발생 시간 (ISO 8601)
  source: string;         // 제공처 (예: 한국경제, Open DART)
  sourceType: "news" | "disclosure" | "sns" | "analyst";
  impact: "positive" | "negative" | "neutral";
  link?: string;          // 원문 링크 (가능한 경우)
}
```

### RelatedStock (AI 포착 연관 종목)
```typescript
export interface RelatedStock {
  symbol: string;
  name: string;
  reason: string;         // 연관 이유
  price?: number;
  changeRate?: number;
  freshness?: "live" | "recent" | "stale" | "loading" | "error"; // 데이터 신선도
}
```

## 3. 파이프라인 흐름
1. **`collect.ts`**: `getDomesticStockNews`와 `getDisclosures`를 병렬 호출하여 원시(raw) 데이터를 수집.
2. **`normalize.ts`**: 서로 다른 스키마를 가진 뉴스/공시를 `IssueItem` 배열로 매핑 및 중복 제목 제거.
3. **`rank.ts`**: 시간순 정렬 및 우선순위(클러스터링) 산정.
4. **`summarize.ts`**: (추후) 최상위 이슈들을 LLM API에 전달하여 1~2줄 요약 리포트 생성.

## 4. Provider 연동
- **Disclosure**: `opendart.fss.or.kr/api/list.json` 연동. API 실패 시 Deterministic Mock으로 우회.
- **News**: 기존 KIS News API (`FHKST01012200`) 사용. In-flight Dedupe 캐시 레이어 거침.
