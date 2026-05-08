# Stockker (Phase 21: Intelligence Productization & Research Workflows)

Stockker는 단순한 검색 엔진을 넘어, **재사용 가능한 리서치 에셋 기반의 지능형 플랫폼**으로 진화했습니다. 이제 AI 리서치 결과는 일회성이 아닌 영속적인 자산(Snapshots)으로 관리되며, 섹터별 심층 분석 워크플로우를 제공합니다.

## 🌟 주요 특징 (Features)

*   **Research Asset Productization (Phase 21)**: AI 리서치 결과를 `stock_research_snapshots` 및 `sector_research_snapshots` 테이블에 영속화합니다. 1시간 TTL 캐시 전략으로 AI 호출 비용을 절감하고 데이터 일관성을 확보합니다.
*   **Sector Research Expansion (Phase 21)**: `/sectors/[sectorId]` 상세 페이지를 통해 섹터별 모멘텀 강도, 관련 주요 이슈, 대표 종목 분석 워크플로우를 제공합니다.
*   **Recommendation Guardrails (Phase 21)**: AI Picks 및 리서치 전반에 걸쳐 중립적 언어 강제, 투자 책임 고지(Disclaimer), 사실 기반 근거 명시 등 금융 정보 서비스로서의 안전망을 강화했습니다.
*   **Ops Visibility & Metrics (Phase 21)**: `/api/ops/metrics` 엔드포인트를 통해 데이터 큐레이션 현황(Raw 대비 Embedding 비율 등)을 실시간 모니터링합니다.
*   **Supabase pgvector Integration (Phase 20)**: 뉴스/공시 소스를 `news_sources` + `source_embeddings` 테이블에 저장하며, 25분 freshness window 캐시로 빠른 조회를 지원합니다.
*   **Metadata-First Detail Rendering (Phase 20)**: 종목 상세 페이지 진입 시 종목명/티커/북마크 상태가 지연 없이 즉시 표시됩니다.
*   **Gemini Embedding Source Curation (Phase 19)**: `text-embedding-004`로 스팸·중복·저품질 소스 자동 필터링.
*   **Gemini-Only AI Orchestration (Phase 18)**: `gemini-2.5-flash-lite`(전처리) + `gemini-2.5-flash`(최종 생성) 2단계 라우팅.
*   **Search-First UX**: 3,900여 개 전체 상장사 검색, Alias 지원, focus-driven 최근 검색어.
*   **Real Data Pipeline**: KIS 뉴스 + Open DART 공시, 30일 신선도 필터, 관련성 필터.

## 🛠️ 기술 스택 (Tech Stack)

*   **Framework**: Next.js 15 (App Router)
*   **Database**: Supabase (PostgreSQL + pgvector)
*   **AI Runtime**: Gemini 2.5 Flash + Flash-Lite (2-stage routing)
*   **AI Embedding**: Gemini text-embedding-004 (768dim)
*   **Data Sources**: KIS API (Live Quote/News), Open DART API (Disclosures)
*   **Monitoring**: Custom Ops Metrics API
*   **Styling**: Tailwind CSS v4, shadcn/ui

## 🚀 개발 및 실행 (Getting Started)

최신 노드 환경에서 의존성을 설치하고 컴파일/실행합니다.

```bash
# 1. 의존성 설치
npm install

# 2. 로컬 개발 서버 실행
npm run dev

# 3. Supabase 마이그레이션 적용 (선택)
node scripts/migrate-supabase.mjs

# 4. 브라우저에서 접속
# http://localhost:3000
```

## 📝 프로젝트 페이즈 마일스톤
- Phase 1~12: 대시보드 엔진 구축, KIS/DART API 실연동, 로컬 영속성 레이어 완성
- Phase 13~15: 전종목 확장(Corp-Code 매핑), 섹터 분류체계 도입, 홈 인텔리전스 레이어 구축
- Phase 16~18: AI Orchestration 고도화 (2-stage routing), Observability 배지 도입, 소스 기반 검증 강화
- Phase 19~20: pgvector 기반 벡터 스토어 연동, 소스 임베딩 큐레이션, Metadata-First 렌더링 최적화
- **Phase 21 (현재): Intelligence Productization — 리서치 스냅샷(Snapshots) 영속화, 섹터 상세 리서치 워크플로우 확장, 운영 지표(Ops Metrics) 가시화 및 추천 가드레일 강화**
