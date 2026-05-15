# Phase 24 Audit — Trust, Evaluation, and Daily Workflow

## 1. 개요
Phase 23까지의 성과(다중 소스 통합, DB-First 큐레이션, 홈 화면 인텔리전스 개선, 관심 종목 워크플로우 도입)를 바탕으로, Stockker가 실제 "Daily Research Product"로서 갖춰야 할 신뢰성(Trust), 평가(Evaluation), 설명 가능성(Explainability), 그리고 워크플로우 활용도를 진단합니다.

## 2. 진단 질문에 대한 답변 (Answers to Audit Questions)

### 1. 어떤 AI 결과물이 여전히 요청 시점에 너무 자주 재생성되는가?
- **종목 감성 분석 (`/api/stocks/[symbol]/sentiment`)**: `model-router.ts`의 `getOrGenerateSnapshot`이 적용되어 있으나, 일부 호출 경로나 프론트엔드 라우트에서 여전히 스냅샷 대신 재생성을 트리거할 가능성이 높습니다.
- **매수 가격 계획 (`BuyPricePlanCard`)**: `generateBuyPlan` 함수가 여전히 요청 시점에 실시간 가격을 가져와 AI 모의(Mock)나 즉시 생성을 수행합니다.
- **홈 인텔리전스 (`/api/home/intelligence`)**: Phase 23에서 15분 캐시가 도입되었지만, 캐시 만료 시 전체 `recentSources`를 기반으로 Stage 1(Flash-Lite)과 Stage 2(Flash)를 무조건 다시 실행합니다. 기존에 생성된 최상위 스냅샷과 현재 소스 간의 차이를 평가하여 재활용하는 고도화된 전략이 부족합니다.
- **섹터 상세 요약 (`aiSummarizeSector`)**: 스냅샷이 누락된 경우 동기적으로 여러 종목의 이슈를 수집하고 요약하여 병목을 유발할 수 있습니다.

### 2. 홈 화면의 어떤 카드가 가장 일반적(Generic)이거나 덜 신뢰할 만한가?
- **지금 주목받는 종목 (Trending Stocks)**: 종목명과 단순 한 줄 요약만 노출되어, 정확히 '어떤 출처(Source)' 때문에 트렌딩하는지 시각적 근거가 부족하고 리스크 표기가 없습니다.
- **지금 주목받는 섹터 (Trending Sectors)**: 관련 대표 종목이나 주도주가 카드에 명확히 표기되지 않아 설명력이 떨어집니다.

### 3. 어떤 섹터 화면이 여전히 너무 얕은(Shallow)가?
- **섹터 상세 페이지 (`/sectors/[sectorId]/page.tsx`)**: 대표 종목의 단순 나열과 1개의 짧은 AI 요약, 일부 이슈 타이틀만 존재합니다.
- 주도주/소외주(Leaders/Laggards) 추적, 시간에 따른 이슈 밀도(Issue density timeline), 연관 공시/뉴스 묶음(Related bundle), 섹터 내 관찰 후보(Sector watch candidates) 등 실제 리서치에 필요한 깊이 있는 분석 도구가 전무합니다.

### 4. 어떤 저장 상태가 존재하지만 아직 워크플로우로 연결되지 않았는가?
- `src/lib/user-storage/local-adapter.ts`에는 다음 상태가 저장됩니다: `recentSearches`, `recentViewed`, `buyPrices`, `bookmarkedReports`.
- `watchlist`는 Phase 23에서 `/workflows/watchlist`로 연결되었으나, **최근 본 종목 히스토리(`recentViewed`)**, **북마크한 리포트 리스트(`bookmarkedReports`)**, **저장된 평단가 기반 추적(`buyPrices`)**은 아직 실질적인 데일리 워크플로우 화면으로 전환되지 않고 단순 로컬 데이터로만 방치되어 있습니다.

### 5. 어떤 추천 영역이 이유/위험/출처 세부 정보가 부족한가?
- "지금 주목받는 종목"에는 리스크(Risk note)와 출처 수가 표기되지 않습니다.
- "지금 주목받는 섹터"에는 어떤 종목들이 이 섹터를 이끄는지에 대한 이유(Justification)가 부족합니다.
- "AI 포착 후보"는 Phase 23에서 개선되었으나, 구체적인 Basis Source ID 연동이나 Source Count(교차 검증된 출처 수)가 UI에 명확하게 드러나지 않습니다.

### 6. 현재 누락된 평가(Evaluation) 신호는 무엇인가?
현재 Stockker에는 AI가 생성한 요약이나 추천을 기계적으로 검증하는 정식 평가 레이어(Evaluation Layer)가 없습니다.
- **근거 확인 (Grounding checks)**: AI 요약이 원본 소스에 없는 내용을 환각(Hallucinate)했는지 검증하는 장치가 없습니다.
- **오분류 검증 (Wrong-company / wrong-sector rejection checks)**: 이름이 비슷한 타 회사 뉴스를 잘못 참조했는지 걸러내지 못합니다.
- **출처 기한 만료 평가 (Stale-source evaluation)**: 지나치게 오래된 뉴스로 "지금 주목받는" 것처럼 묘사하는지 검사하지 않습니다.
- **출처 충분성 검사 (Source sufficiency checks)**: 정보가 너무 부족한데도 억지로 요약을 생성하는 것을 차단하는 로직이 약합니다.
- **면책 조항 유무 검사 (Recommendation disclaimer presence checks)**: 추천 시 면책 조항이 누락되었는지 자동 검증하지 않습니다.

### 7. 어떤 가드레일이 가장 퇴행(Regress)하기 쉬운가?
- **단일 엔드포인트 호출 (Home single-fetch architecture)**: 프론트엔드 개발자가 개별 카드 컴포넌트(`TrendStocksCard` 등) 안에 별도의 데이터 Fetching 훅을 무심코 추가하기 쉽습니다.
- **장중 데이터 숨김 정책 (Intraday hidden policy)**: 실시간 차트나 호가창을 도입하려는 시도로 인해 무거워지거나 망가지기 쉽습니다.
- **명시적 저장 전용 정책 (Explicit save-only behavior)**: 최근 본 종목을 자동 저장(Auto-save)하면서 사용자 의도와 무관하게 상태를 오염시키기 쉽습니다.
- **상세 진입 시 속도 제한 방어 (Detail-entry rate-limit protection)**: 종목 상세 페이지에 들어갈 때마다 외부 API(KIS, DART)를 동기적으로 호출하도록 로직을 잘못 수정할 위험이 큽니다.
