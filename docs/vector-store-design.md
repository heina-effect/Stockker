# Vector Store Design — Stockker Phase 19

## 1. 설계 원칙

Gemini Embedding은 **의미적 필터/랭커**로만 사용됩니다.
뉴스를 가져오거나, 사용자 대면 요약을 생성하지 않습니다.

```
[Fetch] → [Normalize] → [Embed + Quality Score] → [Cluster/Dedupe] → [Curated Sources] → [Gemini Flash 생성]
```

## 2. 아키텍처

### 2.1 스토리지 선택

| 어댑터 | 상태 | 활성화 조건 |
|---|---|---|
| **In-Memory** | ✅ 기본값 (즉시 동작) | 항상 (Supabase 없을 때) |
| **Supabase pgvector** | ✅ 구현됨 | `SUPABASE_URL` + `SUPABASE_SERVICE_KEY` 설정 시 |
| **Pinecone** | 🔜 어댑터 인터페이스 호환 | 미래 확장 |

### 2.2 어댑터 인터페이스

```typescript
interface VectorStoreAdapter {
  upsertSourceEmbeddings(items: EmbeddedSource[]): Promise<void>;
  searchSimilarSources(queryVector: number[], filters: { symbol?: string; limit?: number }): Promise<EmbeddedSource[]>;
  fetchSourceCluster(seedId: string): Promise<EmbeddedSource[]>;
  findNearestTrustedCentroid(vector: number[]): Promise<number>;
  findNearestSpamCentroid(vector: number[]): Promise<number>;
}
```

## 3. Embedding 모델

- **Model**: `text-embedding-004` (Google Gemini Embedding)
- **Dimensions**: 768
- **Rate**: 소스당 50ms 딜레이 (Free Tier 보호)
- **입력**: `title + provider` 텍스트

## 4. 품질 스코어링

### 4.1 점수 산정 공식

```
qualityScore = (
  spamPenalty × 40 +      // 스팸 유사도 반비례
  trustBoost × 40 +        // (신뢰 센트로이드 유사도 × 0.3) + (provider 신뢰도 × 0.3)
  freshness × 10 +          // 시간 기반 신선도
  strategyBonus × 10 +      // 전략 태그 수
  confirmBonus × 10         // 크로스 소스 확인 수
) × 2
```

### 4.2 품질 레이블

| 레이블 | 점수 범위 | UI 표시 |
|---|---|---|
| `high` | 70~100 | `근거 충분` (녹색) |
| `medium` | 45~69 | `근거 보통` (노란색) |
| `low` | 30~44 | `근거 부족` (회색) |
| `rejected` | 0~29 | 필터링됨, 사용자 미표시 |

> ⚠️ "신뢰도 95%" 같은 정밀한 수치는 절대 표시하지 않습니다.
> 레이블 기반 표현(근거 충분/보통/부족)만 사용합니다.

### 4.3 스팸 필터

스팸성 헤드라인 레퍼런스 셋을 임베딩 후 센트로이드 계산:
- `"지금 사야 할 종목 TOP 5"`, `"단기 급등 예상 종목"`, `"수익률 보장 특급 정보"` 등
- 유사도 ≥ 0.82 → 즉시 `rejected`

### 4.4 전략 태그

| 태그 | 키워드 |
|---|---|
| `earnings` | 실적, 영업이익, 매출, 분기, 어닝, EPS, 컨센서스 |
| `guidance` | 가이던스, 전망, 목표주가 |
| `institutional` | 외국인, 기관, 매수, 순매수 |
| `order_wins` | 수주, 계약, 공급, MOU |
| `regulation` | 규제, 정책, 법안, 허가 |
| `supply_chain` | 공급망, 소재, 부품 |
| `sector_momentum` | 섹터, 업종, 테마 |

### 4.5 Provider 신뢰도 가중치

| Provider | 신뢰도 |
|---|---|
| Open DART | 1.0 |
| 연합뉴스 | 0.9 |
| 한국경제, 이데일리, 머니투데이 | 0.8~0.85 |
| KIS News | 0.8 |
| 헤럴드경제 | 0.75 |
| Mock News | 0.0 (항상 rejected) |

## 5. 클러스터링 / 중복 제거

- 유사도 ≥ 0.88 → 동일 이슈 클러스터
- 클러스터 내 품질 점수 최고 소스를 대표로 선택
- `crossConfirmCount`: 동일 이슈를 독립적으로 다룬 소스 수
  → `근거 충분 (N개 소스 확인)` UI 배지로 표시

## 6. Supabase pgvector 설정

```sql
-- 필요한 테이블 스키마
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE source_embeddings (
  id TEXT PRIMARY KEY,
  symbol TEXT NOT NULL,
  company_name TEXT,
  source_type TEXT,
  provider TEXT,
  title TEXT,
  snippet TEXT,
  raw_text TEXT,
  url TEXT,
  collected_at TIMESTAMPTZ,
  published_at TIMESTAMPTZ,
  embedding vector(768),
  quality_score FLOAT,
  quality_label TEXT,
  strategy_tags TEXT[],
  cluster_group TEXT,
  cross_confirm_count INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 인덱스 (IVFFlat)
CREATE INDEX ON source_embeddings USING ivfflat (embedding vector_cosine_ops);

-- Similarity search RPC
CREATE OR REPLACE FUNCTION match_source_embeddings(
  query_embedding vector(768),
  match_symbol TEXT,
  match_count INT,
  match_threshold FLOAT
)
RETURNS TABLE (
  id TEXT, symbol TEXT, title TEXT, quality_score FLOAT, quality_label TEXT,
  similarity FLOAT
)
LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  SELECT id, symbol, title, quality_score, quality_label,
    1 - (embedding <=> query_embedding) AS similarity
  FROM source_embeddings
  WHERE (match_symbol IS NULL OR symbol = match_symbol)
    AND 1 - (embedding <=> query_embedding) > match_threshold
  ORDER BY similarity DESC
  LIMIT match_count;
END;
$$;
```

## 7. 환경 변수

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your_service_role_key
```
