# Stockker (Phase 16: Efficient AI Orchestration & Dev Observability)

Stockker는 단순한 시세 대시보드를 넘어, 실제 시장 뉴스(KIS)와 공식 공시(Open DART) 데이터를 통합하고 **Gemini/OpenAI 실모델을 연동한 프로덕션급 AI 인텔리전스 플랫폼**으로 진화했습니다.

## 🌟 주요 특징 (Features)

*   **Production AI Orchestration**: Gemini 3.0 Flash와 OpenAI GPT-5.5 / GPT-5.4-mini를 결합한 하이브리드 오케스트레이션을 통해 실시간 뉴스/공시 데이터를 분석합니다. 데이터 추출과 감성 분석은 Gemini가, 고품질 리포트 요약과 홈 인텔리전스는 OpenAI가 담당합니다.
*   **Search Reliability & Alias Support**: 3,900여 개 전체 상장사 검색이 완벽하게 동작하며, "현대중공업"과 같은 구명칭이나 별칭 검색 시에도 "HD현대중공업"으로 정확히 매핑되는 Alias 시스템을 구축했습니다.
*   **Search-First UX**: 접속하자마자 방대한 "호가창"을 마주하지 않습니다. 궁금한 종목을 직관적인 검색창(Hero)에서 검색하여 AI 리포트를 발급받습니다. 최근 검색어는 이제 종목명과 티커를 함께 저장하여 시인성을 높였습니다.
*   **Real Data AI Pipeline & Source Hardening**: KIS 실시간 뉴스 API와 Open DART 공시 API를 결합하여 약 3,900여 개 전 상장사에 대한 정규화된 정보를 수집합니다.
*   **Sector & Theme Intelligence**: 단일 종목을 넘어 업종(Sector)/테마(Theme) 단위 탐색을 지원하며, 홈 화면에서 AI가 생성한 실시간 핵심 이슈, 섹터 전망, AI 포착 후보 등을 종합 큐레이션합니다. 각 섹터별 직관적인 아이콘(IconKey)이 렌더링됩니다.
*   **Transparent Sentiment & Recommendation**: AI 감성 점수 제공 시 그 판단 근거가 된 원문 출처를 1:1로 매핑하여 설명 가능성을 확보하고, 비보장 고지 등 법적 가이드라인을 준수합니다.
*   **Dev Observability & Caching**: 홈 화면 데이터를 단일 엔드포인트(`/api/home/intelligence`)로 통합 및 In-flight Dedupe 캐싱을 적용해 중복 API 호출을 방지했으며, 개발 환경(Dev mode)에선 API fallback 상태 및 지연시간을 확인할 수 있는 메타데이터 배지를 제공합니다.

## 🛠️ 기술 스택 (Tech Stack)

*   **Framework**: Next.js 16.1.6 (App Router)
*   **Language**: TypeScript (Strict)
*   **AI Models**: Google Gemini 3.0 Flash, OpenAI GPT-5.5 / GPT-5.4-mini (Hybrid Orchestration)
*   **Data Sources**: KIS API (Live Quote/News), Open DART API (Disclosures)
*   **AI Router**: `src/server/ai/orchestrator.ts` 기반 지능형 데이터 처리
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
- **Phase 16 (현재): 모델 하이브리드 라우팅 고도화(최신 모델 대응), 홈 데이터 Fetch 단일화(In-flight Dedupe), 로딩 UX 개선 및 개발자 Observability 배지 도입**
