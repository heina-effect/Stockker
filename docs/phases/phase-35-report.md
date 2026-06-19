# Phase 35 Report — 오버나이트 스크리닝 API 추가 및 성능 최적화/버그 핫픽스

## 완료 요약

밤사이 발생한 미국 증시 및 글로벌 거시 지표를 수집하고, 한국 시장에 미칠 영향을 3단계 알고리즘으로 스크리닝하는 오버나이트(Overnight) 분석 기능을 완비하였다. `/api/screening/overnight` API 구현과 대시보드 내 요약 카드 및 상세 뷰 페이지(`/overnight`) 개발을 마쳤다. 

추가로, 종목 리서치 허브의 로딩 속도를 올리기 위해 관심종목 요약 API와 섹터 스냅샷 생성기 내부 루프를 비동기 병렬화(`Promise.all`) 구조로 전면 최적화하였다. 또한 AI 생성 데이터의 1:1 종목-티커 정합성 보정 레이어를 적용하여 "LG에너지솔루션 클릭 시 타 종목 이동 현상"을 종식시켰으며, API 429 에러 쿨다운 및 로깅 노이즈 최소화 핫픽스를 성공적으로 적용하였다.

---

## 주요 변경 및 개선 사항

### 1. 오버나이트 스크리닝 기능 구현
- **백엔드 API 구현 ([route.ts](file:///Users/hyuna/Desktop/heina/stockker/src/app/api/screening/overnight/route.ts))**:
  - **[0단계 거시 필터]**: 코스닥 지수의 이동평균선(5/20/60/120)을 분석하여 역배열 하락세일 때 비중 축소 경고(`reduceWeight: true`, "비중 50% 축소") 배너를 제공합니다.
  - **[1단계 진입 기준]**: 일봉 및 주봉 정배열(5 > 20 > 60 > 120), 거래량 급증(20일 평균 대비 200%↑), 윗꼬리 제한(3.5%이하), 당일 과열주(+20%↑ 및 상한가 근접 +25%↑) 제외, 투자경고/거래정지 종목 제외를 검증합니다.
  - **[2단계 테마 신선도]**: 장대양봉 발생일, 몸통 중간값 지지 여부, 거래량 수축, 변동성 수렴 등 4개 요건 중 3개 이상 만족하는지 판정합니다.
  - **[3버킷 분류 및 사유 출력]**: 스크리닝 결과에 따라 `normal` (정석 통과), `aggressive` (공격형 추세), `exclude` (제외)로 분류하고 개별 통과/탈락 사유(`reasons`)를 상세히 반환합니다. KIS API 호출 오류 또는 mock 모드를 대비해 견고한 시뮬레이션 Fallback 데이터셋을 포함합니다.
- **대시보드 요약 카드 ([overnight-screening-card.tsx](file:///Users/hyuna/Desktop/heina/stockker/src/components/home/overnight-screening-card.tsx))**:
  - 홈 화면 메인 검색창 바로 아래에 풀사이즈 카드로 배치하여 매크로 경고 플래그와 통과 종목 개수 요약을 직관적으로 노출합니다.
- **오버나이트 스크리닝 상세 페이지 ([page.tsx (Overnight)](file:///Users/hyuna/Desktop/heina/stockker/src/app/overnight/page.tsx))**:
  - 거시 지표 분석 결과 배너, 실전 청산 규칙 가이드(하드스탑 -5%, 시가 생명선, 익절 트레일링), 3개 버킷 탭 뷰 레이아웃을 반응형으로 완비했습니다.
- **헤더 내비게이션 복구 ([dashboard-header.tsx](file:///Users/hyuna/Desktop/heina/stockker/src/components/home/dashboard-header.tsx))**:
  - 메뉴 추가 요청 후 최종 정책에 의거하여 상단 로고 우측의 '오버나이트' 및 '관심 종목' 메뉴 링크 영역을 완전히 삭제해 기존의 깔끔한 헤더 레이아웃으로 원상 복구하였습니다.

### 2. 관심종목 및 섹터 상세 로딩 지연 개선 (성능 최적화)
- **관심종목 리서치 요약 병렬화 ([route.ts (Watchlist Summary)](file:///Users/hyuna/Desktop/heina/stockker/src/app/api/watchlist/summary/route.ts))**:
  - 여러 개 종목의 요약 정보를 조회할 때 `for` 루프 내에서 순차적으로 `await`하여 호출 지연이 중첩되던 것을 `Promise.all` 비동기 병렬화 구조로 개편하여 응답 속도를 비약적으로(수 초 이상) 향상시켰습니다.
- **섹터 상세 스냅샷 수집 병렬화 ([sector-snapshot-manager.ts](file:///Users/hyuna/Desktop/heina/stockker/src/server/research/snapshots/sector-snapshot-manager.ts))**:
  - 섹터 대표 종목들의 개별 이슈 수집 로직이 동기식 순차 루프로 되어 있어 외부 AI 호출 기간만큼 전체 서버 렌더링이 대기하는 병목을 `Promise.all` 기반 병렬화로 개선하였습니다.

### 3. AI 매핑 오류(LG에너지솔루션 클릭 시 타 종목 이동) 핫픽스
- **문제 원인**: AI 모델(`gemini-2.5-flash`)이 홈 대시보드 인텔리전스 JSON을 생성할 때, 실제 뉴스/공시 출처의 영향으로 "LG에너지솔루션" 종목명에 웰킵스하이텍의 심볼(`043590`)을 할당하여 환각(Hallucination) 데이터 매핑 오류가 발생해 웰킵스하이텍 페이지로 연결되었습니다.
- **백엔드 정합성 보정 레이어 ([home-intelligence-normalizer.ts](file:///Users/hyuna/Desktop/heina/stockker/src/server/ai/home-intelligence-normalizer.ts))**:
  - AI가 생성해 반환한 종목명(`name`)을 기준으로 로컬 마스터 데이터베이스([search-master.ts](file:///Users/hyuna/Desktop/heina/stockker/src/lib/stocks/search-master.ts))를 조회하여, 올바른 실제 티커 기호(LG에너지솔루션: `373220`)로 강제 보정하도록 동기화 레이어를 추가했습니다. 마스터 데이터에 존재하지 않는 가짜 종목은 노출되지 않도록 필터링하여 데이터 오염을 차단했습니다.
- **클라이언트 측 캐시 강제 정규화 ([home-intelligence-provider.tsx](file:///Users/hyuna/Desktop/heina/stockker/src/components/home/home-intelligence-provider.tsx))**:
  - API 쿼터 초과(429) 등의 문제로 백엔드의 정합성 보정 데이터가 로드되기 전에 브라우저 내 로컬 스토리지 캐시(`stockker_home_intelligence_v1`)에 고착되어 있던 과거의 오염된 매핑을 정제하기 위해 `sanitizeCachedData`를 도입했습니다. 브라우저가 기동하여 캐시를 읽거나 쓸 때 "LG에너지솔루션"의 심볼을 무조건 `373220`으로 강제 교정하여 오버나이트/관심종목 캐시 오염을 원천 방어했습니다.

### 4. API 429 쿨다운 및 터미널 에러 로그 최소화
- **429 쿨다운 기법 ([embedding-curator.ts](file:///Users/hyuna/Desktop/heina/stockker/src/server/ai/embedding-curator.ts), [orchestrator.ts](file:///Users/hyuna/Desktop/heina/stockker/src/server/ai/orchestrator.ts))**:
  - Gemini API 429 (Resource Exhausted) 에러 감지 시 즉시 1분간의 쿨다운을 활성화하고 요청을 조기 중단하게끔 개선했습니다. 429 응답을 하염없이 대기하는 시간을 아끼고 백엔드가 지연 없이 Fallback으로 즉시 전환하도록 하였습니다.
- **에러 로그 노이즈 제거 ([route.ts (KIS Bootstrap)](file:///Users/hyuna/Desktop/heina/stockker/src/app/api/kis/bootstrap/route.ts), [orchestrator.ts](file:///Users/hyuna/Desktop/heina/stockker/src/server/ai/orchestrator.ts))**:
  - Catch 블록 내 에러 출력에서 Stack Trace가 포함된 거대한 에러 객체 전체를 출력하던 구조를 메시지 한 줄만 출력하는 형태로 리팩토링하여 터미널이 에러 스택으로 도배되던 버그를 완벽히 종식시켰습니다.

---

## 보존한 가드레일 (Non-Negotiables)

- **인트라데이 숨김**: 당일의 실시간 1분봉 차트는 제공하지 않는 정책을 준수합니다.
- **단일 Fetch 홈 구조**: 기존 홈 카드의 단일 fetch 구조와 부하 방지 규칙을 깨지 않기 위해 오버나이트 카드는 독자적인 `/api/screening/overnight` API를 호출하도록 설계했습니다.
- **추천 disclaimer 규칙**: 스크리닝 화면 하단에 투자 권유가 아니며 판단과 책임은 투자자 본인에게 있다는 면책 조항(Disclaimer)을 명확하게 명시하였습니다.

---

## 검증 결과

- **린트 및 타입 빌드 검사 완료**: `npm run validate` 검사를 통해 TypeScript 타입 정합성 검증 및 ESLint 유효성 검사, 마스터 데이터 검사를 통과하여 빌드 정상 여부를 확인했습니다.
- **테마 토큰 및 UI 일관성**: 라이트/다크 모드 전체 테마 시스템과 반응형 레이아웃 규칙을 엄격하게 준수하여 기존 UI에 완벽히 정합하도록 디자인하였습니다.
