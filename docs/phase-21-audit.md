# Phase 21 Audit — Intelligence Productization & Research Workflows

## 1. 현재 상태 및 질문 답변

### 1.1 Which parts still build intelligence at request time instead of reusing stored curated data?
- **AI 요약 및 감성 분석 (`aiSummarizeIssues`, `aiAnalyzeSentiment`)**: Phase 20에서 원본 소스(news, disclosures) 및 큐레이션된 소스는 Supabase에 저장하고 재사용(Cache)하게 되었으나, **AI가 이를 바탕으로 작성하는 요약 리포트와 감성 점수는 매번 요청 시(`request time`) 새로 생성**됩니다. 
- **홈 인텔리전스 (`aiGenerateHomeIntelligence`)**: 메모리 캐시(15분 TTL)로 보호되고 있지만 서버 재시작 시 또는 만료 시마다 새롭게 전체를 생성합니다.
- 즉, **자산(Source)**은 저장되지만 **인텔리전스(Intelligence)**는 아직 일회성으로 소비되고 있습니다.

### 1.2 Which home surfaces are strongest and weakest in current product quality?
- **Strongest**: `TrendIssuesCard`, `TrendStocksCard`. 실제 KIS/DART 데이터와 연계되어 비교적 근거 있는 뉴스 클러스터와 종목 동향을 보여줍니다.
- **Weakest**: `TrendSectorsCard` (단순 나열 수준이며 섹터 상세 정보 부재), `AIPicksCard` (아직 추천 로직이 파편화되어 있고 깊은 근거 추적이 약함). 홈 화면이 전체적으로 "단일 프롬프트 결과물"이라는 느낌이 강합니다.

### 1.3 Is sector exploration shallow or deep today?
- **매우 얕음 (Shallow)**. 
- 섹터는 단순히 홈 화면에서 텍스트로 나열될 뿐, `/sectors/[sectorId]`와 같은 전용 상세 페이지가 없습니다.
- 해당 섹터 내 어떤 종목이 리드하고 있는지, 관련된 핵심 공시나 뉴스가 무엇인지 깊이 있게 탐색할 수 없습니다.

### 1.4 What saved user state already exists and what workflows are still missing?
- **존재하는 상태 (`local-adapter.ts`)**: `watchlist`, `recentSearches`, `recentViewed`, `buyPrices`, `bookmarkedReports`.
- **누락된 워크플로우**: 
  - 관심 종목(`watchlist`)에 대한 새로운 뉴스/이슈 알림 또는 요약 대시보드.
  - 북마크한 리포트의 감성 점수 변화나 후속 업데이트 비교.
  - 저장된 매수가(`buyPrices`) 기반의 지속적인 액션 가이드 추적.
  - 단순히 "저장"에서 끝나는 것이 아니라 **"저장된 데이터를 바탕으로 한 리서치(Saved Research Workflows)"** 연결이 부족합니다.

### 1.5 What internal quality/debug visibility exists today for curation quality?
- **현재 가시성**: `_meta` 필드를 통해 개발 모드에서 모델, 레이턴시, Fallback 사유, 기반 소스 개수를 UI 하단에 표시.
- **부족한 점**: KIS API 404 실패율, 큐레이션 통과 비율, DB 캐시 Hit/Miss 비율, AI 추천 커버리지 등에 대한 정량적/통계적 Ops 가시성이 전혀 없습니다. (로그만 존재)

### 1.6 Which guardrails are fragile and easy to regress?
- **Intraday Hidden Policy**: 차트 모드가 변경될 때 쉽게 깨지거나 노출될 수 있음.
- **AI Summary vs Source 분리**: AI 프롬프트 수정 시 "AI가 지어낸 내용"이 소스인 것처럼 섞일 위험.
- **Rate-limit Protection**: 단일 종목/다중 종목 동시 조회 시 Dedupe 로직이 실수로 우회되면 KIS EGW00201 에러 즉시 발생.
- **Explicit Save Policy**: 유저의 행동 없이 "최근 검색"이 "관심 종목"으로 자동 저장되는 등 정책 혼동 위험.
- **Disclaimer**: AI 추천 영역에서 법적 고지문 누락 위험.

---

## 2. Phase 21 핵심 과제 (Audit 기반)

### A. Research Asset Productization
매 요청마다 생성하는 AI Summary/Sentiment를 `stock_research_snapshots` 형태의 **재사용 가능한 DB 자산**으로 승격시켜야 합니다. Snapshot의 Freshness를 관리하고 DB-first로 접근합니다.

### B. Home Intelligence Productization
홈 화면의 각 카드(`TrendSectors`, `AIPicks`)가 더 명확한 이유와 신선도를 가지도록 개선하고, `Single-Fetch` 아키텍처를 유지하면서 품질을 높입니다.

### C. Sector Research Expansion
섹터 상세 페이지(`src/app/sectors/[sectorId]/page.tsx`)를 구축하고, 소스 기반의 대표 종목 및 테마 동향 파악 뷰를 만듭니다.

### D. Recommendation Layer Hardening
`AIPicks` 등의 추천 후보에 명확한 분류(이벤트 기반, 섹터 동반 상승 등), Risk Note, Disclaimer를 강제합니다.

### E. Saved Research Workflows & Ops Visibility
`LocalStorageAdapter`의 데이터를 실제 리서치 뷰(예: 내 관심 종목 이슈 모아보기)로 확장하고, 서버 측에 큐레이션 퀄리티 지표를 추적할 간단한 Ops/Quality 로직을 추가합니다.
