# Stockker Architecture (Phase 23 - Intelligence Quality & Snapshot Reuse)

## 1. 개요
Stockker는 다중 뉴스/공시 소스(KIS, DART, GNews, NewsAPI)를 기반으로 작동하는 **검색 기반 주식 리서치 서비스(Research-first)** 입니다. 실시간 API 의존도를 낮추고, 저장된 리서치 자산(Research Snapshots)을 적극적으로 재사용하여 고품질의 일간 리서치를 빠르고 일관되게 제공합니다.

## 2. 코어 모델(Research Domain) 라우팅 및 파이프라인
- **Model Router (`src/server/research/model-router.ts`)**: 클라이언트 요청을 처리하며 Snapshot 캐시 히트를 우선적으로 시도합니다.
- **Pipeline (`src/server/research/pipeline/*`)**:
  - `collect.ts`: 4-Source (KIS, DART, GNews, NewsAPI) 병렬 수집.
  - `normalize.ts`: `SourceItem` 규격으로 통일 및 제목 기준 중복 제거.
  - **Persistence**: Supabase `news_sources` 테이블에 즉시 Upsert.
  - **Embedding Curation**: Gemini Embedding 모델을 통한 품질 검증 및 랭킹 (Supabase `source_embeddings` 적재).

## 3. 로컬 스토리지 어댑터 및 워크플로우 (Persistence Layer)
- `src/lib/user-storage/local-adapter.ts`를 통한 로컬 기반 사용자 상태 저장.
- **스키마 (Schema)**: `watchlist`, `recentSearches`, `recentViewed`, `buyPrices`, `bookmarkedReports`, `preferences`.
- **Saved Workflows**: 저장된 데이터를 기반으로 관심 종목 모아보기, 최근 본 종목 히스토리 등의 개인화된 리서치 경로 제공 (Explicit Save 정책 유지).

## 4. 프론트엔드 및 가드레일 정책
- **Metadata-First Detail Rendering**: 종목 상세 진입 시 티커, 종목명 등 메타데이터가 스켈레톤 없이 즉각 노출.
- **Intraday Hidden**: 장중 복잡한 당일 분봉 차트 숨김 (UX 및 안정성).
- **Recommendation Guardrails**: AI 추천 정보는 필수적으로 Disclaimer, 위험 고지, 근거 출처를 동반하며, 절대 보장성/지시성 문구를 사용하지 않음.

## 5. AI Model Routing (Gemini-Only Architecture)
비용과 Latency 최적화를 위해 Gemini 3 Flash 계열 모델로 통일하여 사용합니다.

| 기능 | 권장 모델 | 역할 |
|---|---|---|
| 전처리 및 단순 추출 | **Gemini 3.1 Flash-Lite** | 가벼운 파싱, 뉴스 클러스터링 전처리 |
| 홈/섹터/종목 요약 및 분석 | **Gemini 3.1 Flash** | 고품질 텍스트 생성, 핵심 이슈 요약, 감성 분석 |
| 품질 스코어링 / 임베딩 | **Gemini text-embedding-004** | 벡터 생성 및 의미 기반 스팸/노이즈 필터링 |

## 6. 스냅샷 기반 캐시 및 홈 동시성 제어
- `stock_research_snapshots`, `sector_research_snapshots` (Supabase DB)에 생성된 리포트를 저장하고 TTL 내 재사용합니다.
- 홈 화면의 여러 카드는 `/api/home/intelligence` 단일 엔드포인트에서 1회만 호출되어 in-flight deduplication을 수행, 다중 렌더링에 의한 중복 호출을 막습니다.
