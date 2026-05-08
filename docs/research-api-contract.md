# Research API Contract

## 1. 개요
Stockker 리서치 도메인의 데이터 파이프라인 인터페이스를 정의합니다. 다중 소스(4-Source)에서 정규화된 데이터만을 취급합니다.

## 2. Core Interfaces (`src/types/research.ts`)

### SourceItem (정규화된 리서치 원시 데이터)
```typescript
export interface SourceItem {
  id: string;             // 식별자
  sourceType: "news" | "disclosure" | "analyst";
  title: string;
  snippet?: string;
  rawTextForEmbedding?: string;
  provider: string;       // KIS, Open DART, GNews, NewsAPI 등
  collectedAt: string;    // 앱 수집 시각
  generatedAt?: string;   // 실제 원본 기사/공시 발행 시각
  url?: string;
  language?: string;
  dedupeHash?: string;
  _qualityLabel?: SourceQualityLabel;
  _strategyTags?: string[];
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
  freshness?: "live" | "recent" | "stale" | "loading" | "error";
}
```

### RecommendationCandidate (추천 후보)
```typescript
export interface RecommendationCandidate {
  id: string;
  type: "stock" | "sector";
  targetId: string;
  name: string;
  recommendationType: "ai_pick" | "close_watch" | "checklist";
  reasons: RecommendationReason[];
  riskSummary: string;
  disclaimer: string;
  generatedAt: string;
}
```

## 3. 파이프라인 흐름 (4-Source Pipeline)
1. **`collect.ts`**: KIS, Open DART, GNews, NewsAPI를 병렬 호출하여 원시 데이터 수집.
2. **`normalize.ts`**: `SourceItem`으로 스키마 표준화, 제목 및 dedupeHash 기준 중복 1차 제거.
3. **`Persistence & Embedding`**: Supabase `news_sources` Upsert 및 빈 벡터 방어 포함 임베딩 랭킹 (`vector-store.ts`, `embedding-curator.ts`).
4. **`Snapshot Reuse`**: DB-first 원칙으로 기존 Snapshot을 우선 조회하고, 만료(TTL) 시 재생성 및 DB 적재 후 반환.
