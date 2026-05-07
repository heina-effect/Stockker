# Stockker (Phase 14: AI Intelligence & Recommendation Layer Expansion)

Stockker는 단순한 시세 대시보드를 넘어, 실제 시장 뉴스(KIS)와 공식 공시(Open DART) 데이터를 통합한 **데이터 기반 AI 리서치 및 개인화 플랫폼**으로 진화했습니다.

## 🌟 주요 특징 (Features)

*   **Search-First UX**: 접속하자마자 방대한 "호가창"을 마주하지 않습니다. 궁금한 종목을 직관적인 검색창(Hero)에서 검색하여 AI 리포트를 발급받습니다. 최근 검색어와 관심 종목도 즉시 확인 가능하며, 검색 UX는 사용자의 명시적 포커스(Focus)에만 반응하도록 최적화되었습니다.
*   **Real Data AI Pipeline & Source Hardening**: KIS 실시간 뉴스 API와 Open DART 공시 API를 결합하여 약 3,900여 개 전 상장사(Corp-Code 자동 매핑)에 대한 정규화된 정보를 수집합니다.
*   **Sector & Theme Intelligence**: 단일 종목을 넘어 업종(Sector)/테마(Theme) 단위 탐색을 지원하며, 홈 화면에서 실시간 핵심 이슈, 섹터 전망, AI 포착 후보 등을 종합 큐레이션합니다.
*   **Transparent Sentiment & Recommendation**: AI 감성 점수와 추천 후보(관찰/체크리스트) 제공 시 그 판단 근거(출처)를 명시하여 AI의 블랙박스 문제를 해결하고, 법률적 비권유 가이드라인(Non-Advisory Guardrails)을 엄수합니다.
*   **Actionable Plan with Regression Test**: 자신의 평균 매수가(평단가)를 입력하면 AI가 포지션을 진단합니다. 계산 로직은 자동화된 회귀 테스트(Vitest)로 고정되어 오차 없는 수익률 기반 대응 가이드를 제안합니다.
*   **Local-First Persistence**: 사용자의 테마, 북마크, 최근 본 종목, 검색어, 관심 종목, 평단가 등이 브라우저 로컬 스토리지 기반으로 빠르고 안전하게 동기화됩니다.

## 🛠️ 기술 스택 (Tech Stack)

*   **Framework**: Next.js 16.1.6 (App Router)
*   **Language**: TypeScript (Strict)
*   **Styling**: Tailwind CSS v4, shadcn/ui
*   **Data Sources**: KIS API (Live Quote/News), Open DART API (Disclosures)
*   **AI Router**: `pipeline/*` 기반 데이터 수집/정규화 모델
*   **Testing**: Vitest (Logic/Regression)

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
- **Phase 15 (현재): Search Alias 및 전체 검색 무결성 완성, Gemini/OpenAI 기반 실모델 AI Orchestration 연동 (프롬프트/구조화된 JSON 추출 적용)**
