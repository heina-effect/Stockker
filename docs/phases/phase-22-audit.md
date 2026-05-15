# Phase 22 Audit — Multi-Source News Expansion, Supabase Persistence, and Curated Research Delivery

## 1. 현재 상태 및 기반 기술 (Context Audit)

- **뉴스/공시 소스 파이프라인**: `src/server/research/pipeline/collect.ts`에서 `fetchCompanyNews` (KIS)와 `getDisclosures` (DART)를 병렬 호출.
- **정규화**: `normalizeSources`에서 제목 기반 dedupe 및 30일 recency 필터를 적용하고, `SourceItem`으로 매핑.
- **임베딩 큐레이션**: `src/server/ai/embedding-curator.ts`에서 Supabase의 `news_sources`와 `source_embeddings`를 사용하여 DB에 원시 데이터와 큐레이션된 데이터를 저장하고 재사용. 
- **DB 스키마 활용도**: Phase 20에서 구축한 `vector-store.ts`를 통해 `upsertRawSources`, `upsertSourceEmbeddings` 등의 함수가 동작하고 있음.
- **리서치 스냅샷**: Phase 21에서 도입한 `stock_research_snapshots`, `sector_research_snapshots`이 캐싱 용도로 잘 사용됨.
- **GNews & NewsAPI**: 현재 프로젝트 내에는 존재하지 않는 신규 Provider임.
- **AI 렌더링 방식**: `Metadata-First` 렌더링 유지 (헤더 데이터 먼저 렌더링). Intraday hidden 정책 유지됨.

## 2. 목표 및 구현 항목

### A. Provider 추가 및 정규화
- **GNewsProvider** 및 **NewsApiProvider** 신규 생성 (`src/server/research/providers/`).
- 실패 시 fallback 처리, Rate limit/Timeout 구분을 통한 안전한 서버사이드 호출.
- `SourceItem` 스키마 및 `collect.ts`의 수집 파이프라인 확장하여 4가지 소스를 통합 수집.

### B. Supabase 데이터베이스 파이프라인 연동
- 신규 뉴스 소스들도 모두 `upsertRawSources` 및 `upsertSourceEmbeddings` 워크플로우에 통합.
- 제공자별 중복 기사는 `dedupeHash` 혹은 URL 기준으로 필터링.

### C. 임베딩 큐레이션 개선
- `embedding-curator.ts`에서 GNews, NewsAPI 데이터 처리 가중치 (Provider Trust) 조정.
- 노이즈(스팸) 필터링, 관련성 점수 부여 체계 정비.

### D. 데이터 재사용 파이프라인 적용
- "최근 핵심 이슈" 모델에 다중 소스 반영 (`model-router.ts`).
- 소스 리스트에 출처 표기 뱃지 등 UI 데이터 바인딩 추가 검토.
- Pagination 지원 (상세 리서치 페이지 API 보강 필요).

### E. 아키텍처 및 홈 대시보드 개선
- 단일 Intelligence Endpoint에서 다중 소스 기반의 품질 높은 데이터를 사용.
- `aiGenerateHomeIntelligence` 가드레일 유지하며, 더 다양한 소스로부터 후보군 추출.

## 3. 리스크 및 주의사항
- 무분별한 API 호출 방지: 뉴스 API 호출 후 반드시 DB 저장 및 캐싱 로직 활용.
- KIS Rate Limit과 동일하게 NewsAPI/GNews Rate Limit 준수.
- Metadata-first 렌더링, Intraday 숨김 속성 등 프론트엔드 UX 지침 절대 준수.
