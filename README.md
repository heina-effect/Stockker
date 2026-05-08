# Stockker (Phase 20: Supabase pgvector Integration & Metadata-First Detail Rendering)

Stockker는 단순한 시세 대시보드를 넘어, 실제 시장 뉴스(KIS)와 공식 공시(Open DART) 데이터를 통합하고 **Gemini Embedding 기반 소스 품질 필터링을 갖춘 프로덕션급 AI 인텔리전스 플랫폼**으로 진화했습니다.

## 🌟 주요 특징 (Features)

*   **Supabase pgvector Integration (Phase 20)**: 뉴스/공시 소스를 `news_sources` + `source_embeddings` 테이블에 저장합니다. 25분 freshness window 캐시로 동일 심볼 재조회 시 API 호출 없이 DB에서 즉시 반환합니다.
*   **Metadata-First Detail Rendering (Phase 20)**: 종목 상세 페이지 진입 시 종목명/티커가 즉시 표시됩니다. 현재가·AI Summary만 skeleton 처리됩니다. 북마크 버튼도 data 로딩 전 즉시 활성화됩니다.
*   **Sources 페이지네이션 (Phase 20)**: AI 분석 출처 목록을 5개씩 더 보기/접기로 탐색합니다. 각 소스에 품질 배지, 전략 태그, 교차 확인 수가 표시됩니다.
*   **Gemini Embedding Source Curation (Phase 19)**: `text-embedding-004`로 스팸·중복·저품질 소스 자동 필터링.
*   **Vector Store Integration**: Supabase pgvector를 1차 벡터 스토어로 구현했습니다. In-memory fallback이 내장되어 별도 설정 없이 즉시 동작하며, Pinecone 어댑터 확장이 가능합니다.
*   **Source Quality Labels**: `근거 충분 / 근거 보통 / 근거 부족` 레이블로 AI 분석 출처의 신뢰도를 직관적으로 표시합니다. 가짜 정밀도("신뢰도 95%")는 사용하지 않습니다.
*   **AI 분석 출처 더보기**: 감성 분석 출처가 3개 이상일 때 "더 보기" 버튼으로 점진적 로딩을 지원합니다.
*   **Gemini-Only AI Orchestration (Phase 18)**: `gemini-2.5-flash-lite`(전처리) + `gemini-2.5-flash`(최종 생성) 2단계 라우팅, 소스 부족 시 AI 차단, 5분 심볼 쿨다운.
*   **Source-Grounded AI Hardening (Phase 17)**: Mock 데이터 오염 차단, 크로스-섹터 오염 제거.
*   **Search-First UX**: 3,900여 개 전체 상장사 검색, Alias 지원, focus-driven 최근 검색어.
*   **Real Data Pipeline**: KIS 뉴스 + Open DART 공시, 30일 신선도 필터, 관련성 필터.
*   **Dev Observability**: 모델, 레이턴시, 캐시 상태, 소스 수, Budget 결정을 개발 배지로 확인.

## 🛠️ 기술 스택 (Tech Stack)

*   **Framework**: Next.js (App Router)
*   **Language**: TypeScript (Strict)
*   **AI Runtime**: Gemini 2.5 Flash + Flash-Lite (2-stage routing)
*   **AI Embedding**: Gemini text-embedding-004 (768dim)
*   **Vector Store**: Supabase pgvector (In-memory fallback)
*   **Data Sources**: KIS API (Live Quote/News), Open DART API (Disclosures)
*   **AI Router**: `src/server/ai/orchestrator.ts` — 2-stage, budget-gated
*   **Embedding Curator**: `src/server/ai/embedding-curator.ts`
*   **Testing**: Vitest (Logic/Regression/Search Alias)
*   **Styling**: Tailwind CSS v4, shadcn/ui

## 🚀 개발 및 실행 (Getting Started)

최신 노드 환경에서 의존성을 설치하고 컴파일/실행합니다.

```bash
# 1. 의존성 설치
npm install

# 2. 로컬 개발 서버 실행
npm run dev

# 3. 로직 테스트 실행 (Buy-plan, Persistence 등)
npm run test:persistence

# 4. 브라우저에서 접속
# http://localhost:3000
```

> **버그 우회 / 초기화 팁** : `.next` 캐시 등으로 Next.js가 꼬이거나 스타일이 깨진다면 `npm run dev:reset` 명령어를 사용하여 깨끗하게 서버를 다시 켤 수 있습니다.

## 📝 프로젝트 페이즈 마일스톤
- Phase 1~4: 실시간 Dashboard 엔진 구축
- Phase 5: Research-first 프로덕트 피벗 및 Mock API 구축
- Phase 6~8: UI Validation 및 차트 도입 기초
- Phase 9~10: KIS 실제 시세/뉴스 API 연동 및 데이터 무결성 검증
- Phase 11: KIS Rate-Limit 핫픽스, 당일 차트 억제, API 리소스 실체화 준비
- Phase 12: Open DART 공시 실연동, AI 파이프라인 정규화, 로컬 영속성 레이어(User Persistence) 완성
- Phase 13: Corp-Code 매핑 자동화(전종목 확장), 이슈/출처 구조적 분리, 검색 UX 폴리싱 및 계산 로직 회귀 테스트 구축
- Phase 14: Sector/Theme Taxonomy 도입, 홈 대시보드 인텔리전스 레이어(이슈/섹터/AI픽) 구축, 설명 가능한 추천·감성 모델 및 법적 비권유 안전망 적용
- Phase 15: Search Alias 및 전체 검색 무결성 완성, Gemini/OpenAI 기반 실모델 AI Orchestration 연동 (프롬프트/구조화된 JSON 추출 적용)
- Phase 16: 모델 하이브리드 라우팅 고도화, 홈 데이터 Fetch 단일화(In-flight Dedupe), 로딩 UX 개선 및 개발자 Observability 배지 도입
- Phase 17: Source-Grounded AI Hardening — Mock 데이터 누수 차단, 반도체 고정 텍스트 제거, 소스 파이프라인 강화, IssueCluster basisSourceIds 추가
- Phase 18: Gemini-Only Multi-Model Routing — Flash-Lite Stage1 전처리 + Flash Stage2 생성, 예산 제어, Stale-While-Revalidate 캐시
- Phase 19: Gemini Embedding Curation — text-embedding-004 스팸 필터, 의미적 중복 제거, 품질 스코어링, Supabase pgvector 어댑터
- **Phase 20 (현재): Supabase pgvector 실제 연동 — news_sources/source_embeddings DB 배포, Metadata-First 헤더, 25분 freshness 캐시, 출처 페이지네이션**
