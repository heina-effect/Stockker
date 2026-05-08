# Stockker (Phase 23: Intelligence Hardening & Snapshot Reuse)

Stockker는 단순한 검색 엔진을 넘어, **재사용 가능한 리서치 에셋 기반의 지능형 플랫폼**으로 진화했습니다. 이제 AI 리서치 결과는 일회성이 아닌 영속적인 자산(Snapshots)으로 관리되며, 다중 소스에서 정제된 최상급 뉴스만을 활용하여 심층 분석 워크플로우를 제공합니다.

## 🌟 주요 특징 (Features)

*   **Snapshot Reuse & DB-First Policy (Phase 23)**: 과도한 AI 생성을 억제하고 응답 속도를 높이기 위해, 최근 1시간 내에 저장된 정제 소스(Curated Sources)가 DB에 충분할 경우 외부 API 호출 없이 기존 데이터를 재사용하는 DB-First 정책을 시행합니다.
*   **Saved Research Workflows (Phase 23)**: 관심 종목(`watchlist`) 상태를 단순 리스트를 넘어 실제 리서치 흐름으로 전환했습니다. `/workflows/watchlist` 페이지에서 저장한 모든 종목의 최신 AI 요약을 한눈에 브라우징할 수 있습니다.
*   **Multi-Source Quality Calibration (Phase 23)**: 공시(DART) 및 전문 매체에 가중치를 부여하는 Provider Trust 시스템과 스팸 필터링 알고리즘을 강화하여, 정보의 신뢰도를 대폭 향상시켰습니다.
*   **Advanced Ops Visibility (Phase 23)**: `/api/ops/metrics` 엔드포인트를 고도화하여 매체별 비중(Provider Breakdown) 및 품질 등급 분포(Quality Labeling)를 실시간으로 모니터링합니다.
*   **Multi-Source News Pipeline (Phase 22)**: KIS 뉴스, Open DART 공시 외에도 GNews, NewsAPI를 추가하여 4개의 채널에서 정보를 병렬 수집합니다.
*   **Curated Research Delivery (Phase 22)**: 다중 소스에서 가져온 Raw 뉴스는 즉시 노출되지 않고, Supabase에 적재된 후 Gemini 임베딩을 통해 품질 스코어링을 거친 **검증된(Curated) 데이터**로 변환되어 앱 전체(홈, 핵심 이슈, 감성 점수 등)에 재사용됩니다.
*   **Research Asset Productization (Phase 21)**: AI 리서치 결과를 `stock_research_snapshots` 및 `sector_research_snapshots` 테이블에 영속화합니다. 1시간 TTL 캐시 전략으로 AI 호출 비용을 절감하고 데이터 일관성을 확보합니다.
*   **Sector Research Expansion (Phase 21)**: `/sectors/[sectorId]` 상세 페이지를 통해 섹터별 모멘텀 강도, 관련 주요 이슈, 대표 종목 분석 워크플로우를 제공합니다.
*   **Recommendation Guardrails (Phase 21)**: AI Picks 및 리서치 전반에 걸쳐 중립적 언어 강제, 투자 책임 고지(Disclaimer), 사실 기반 근거 명시 등 금융 정보 서비스로서의 안전망을 강화했습니다.

## 🛠️ 기술 스택 (Tech Stack)

*   **Framework**: Next.js 15 (App Router)
*   **Database**: Supabase (PostgreSQL + pgvector)
*   **AI Runtime**: Gemini 1.5 Flash + Flash-Lite (2-stage routing)
*   **AI Embedding**: Gemini text-embedding-004 (768dim)
*   **Data Sources**: KIS API, Open DART, GNews, NewsAPI
*   **Monitoring**: Advanced Ops Metrics API (Provider/Quality breakdowns)
*   **Styling**: Tailwind CSS v4, shadcn/ui

## 🚀 개발 및 실행 (Getting Started)

최신 노드 환경에서 의존성을 설치하고 컴파일/실행합니다.

```bash
# 1. 의존성 설치
npm install

# 2. 로컬 개발 서버 실행
npm run dev

# 3. Supabase 마이그레이션 적용 (선택)
npx supabase db push

# 4. 브라우저에서 접속
# http://localhost:3000
```

## 📝 프로젝트 페이즈 마일스톤
- Phase 1~12: 대시보드 엔진 구축, KIS/DART API 실연동, 로컬 영속성 레이어 완성
- Phase 13~15: 전종목 확장(Corp-Code 매핑), 섹터 분류체계 도입, 홈 인텔리전스 레이어 구축
- Phase 16~18: AI Orchestration 고도화 (2-stage routing), Observability 배지 도입, 소스 기반 검증 강화
- Phase 19~20: pgvector 기반 벡터 스토어 연동, 소스 임베딩 큐레이션, Metadata-First 렌더링 최적화
- Phase 21: Intelligence Productization — 리서치 스냅샷(Snapshots) 영속화, 섹터 상세 리서치 워크플로우 확장
- Phase 22: Multi-Source News Expansion — 다중 뉴스 소스 연동 및 정제된 데이터 기반 리서치 딜리버리 워크플로우 완성
- **Phase 23 (현재): Intelligence Hardening & Snapshot Reuse — 스냅샷 재사용성 극대화, 저장된 리서치 워크플로우 통합 및 품질 캘리브레이션 완성**
