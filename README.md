# Stockker (Phase 18: Gemini-Only Multi-Model Routing & Budget Control)

Stockker는 단순한 시세 대시보드를 넘어, 실제 시장 뉴스(KIS)와 공식 공시(Open DART) 데이터를 통합하고 **Gemini 실모델을 연동한 프로덕션급 AI 인텔리전스 플랫폼**으로 진화했습니다.

## 🌟 주요 특징 (Features)

*   **Gemini-Only AI Orchestration (Phase 18)**: GPT 런타임을 일시 중단하고 Gemini 모델을 기능별로 세분화했습니다. `gemini-2.5-flash-lite`로 소스 전처리/관련성 체크를 수행하고, `gemini-2.5-flash`로 최종 감성 점수 및 리포트 요약을 생성합니다.
*   **Source-Grounded AI Hardening (Phase 17)**: Mock 데이터 누수를 원천 차단했습니다. 현대차 조회 시 반도체 내용이 표시되는 크로스-섹터 오염 버그가 해결되었습니다. 모든 AI 요약은 반드시 실제 소스에 근거해야 합니다.
*   **AI Budget Control**: 소스 2개 미만 → AI 즉시 차단, 동일 심볼 5분 쿨다운, 홈 인텔리전스 15분 캐시 + Stale-While-Revalidate.
*   **Search Reliability & Alias Support**: 3,900여 개 전체 상장사 검색이 완벽하게 동작하며, 별칭 기반 Alias 시스템 구축.
*   **Search-First UX**: 접속하자마자 방대한 "호가창"을 마주하지 않습니다. 종목명/티커로 AI 리포트를 즉시 발급받습니다.
*   **Real Data Pipeline**: KIS 실시간 뉴스 API + Open DART 공시 API 기반 데이터 수집 (30일 신선도 필터, Mock 오염 차단).
*   **Sector Intelligence**: 홈 화면에서 AI가 생성한 실시간 이슈·섹터·AI픽을 큐레이션합니다. 각 섹터별 Lucide 아이콘 렌더링.
*   **Dev Observability**: 개발 환경에서 사용 모델, 레이턴시, 캐시 상태(hit/stale/miss), Budget 결정, Fallback 이유를 배지로 확인 가능.

## 🛠️ 기술 스택 (Tech Stack)

*   **Framework**: Next.js (App Router)
*   **Language**: TypeScript (Strict)
*   **AI Runtime**: Google Gemini 2.5 Flash + Gemini 2.5 Flash-Lite (Phase 18 Gemini-Only)
*   **Data Sources**: KIS API (Live Quote/News), Open DART API (Disclosures)
*   **AI Router**: `src/server/ai/orchestrator.ts` — 2-stage routing, budget gating
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
- **Phase 18 (현재): Gemini-Only Multi-Model Routing — Flash-Lite Stage1 전처리 + Flash Stage2 생성, 예산 제어(쿨다운/임계값), Stale-While-Revalidate 캐시, Fallback Taxonomy 정규화**
