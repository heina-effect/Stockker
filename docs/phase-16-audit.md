# Stockker Phase 16 Audit

## 현재 상태 분석 (Current State)

### 1. 홈 화면 API 호출 횟수 및 캐시 동시성 문제
- **현상**: `TrendIssuesCard`, `TrendStocksCard`, `TrendSectorsCard`, `AIPicksCard`가 각각 `/api/home/...` 엔드포인트를 개별 호출(`fetch`) 중.
- **캐시 문제**: `src/server/ai/home-cache.ts`에 `cachedIntelligence` 메모리 캐시가 있으나, Promise 캐싱 처리가 되어 있지 않아 컴포넌트 마운트 시 동시에 API가 호출되면 OpenAI API가 최대 4번 중복 요청될 수 있는 In-flight Race Condition 취약점이 있음.

### 2. AI 감성 점수 카드 로딩 UX
- **현상**: `SentimentScoreCard` 컴포넌트에서 데이터 페칭 중에 `if (!data) return <div className="h-48 bg-white dark:bg-zinc-900 rounded-[24px] border animate-pulse" />` 구조로 렌더링되어 컴포넌트의 제목이나 내용의 맥락을 전혀 알 수 없음. 
- **문제점**: 레이아웃 점프가 발생하며, 무엇을 분석 중인지 사용자가 직관적으로 인지하기 어려움. 에러 발생 시의 처리(Fallback) 시 개발자 디버깅 정보 노출 전략 부재.

### 3. OpenAI / Gemini 모델 사용 현황 및 라우팅
- **현상**:
  - `home-cache.ts` (홈 화면 통합 데이터 생성): `gpt-4o` 사용 중.
  - `sentiment` (감성 분석 및 출처 추출): `gemini-2.5-flash` 사용 중.
  - `summarizeIssues` (이슈 요약): 현재 Mock 사용 중.
- **요구사항 대응**: GPT-4o, Gemini 2.5 Flash를 각각 GPT-5.4-mini/GPT-5.5, Gemini 3 Flash/Gemini 3.1 Flash-Lite의 적절한 역할로 분할/업그레이드해야 함. 특히 Structure Extraction 기능 등에서 최신 모델의 이점을 얻기 위해 명시적 `response_format` (JSON Schema) 및 `parsed` 방식을 적용할 필요가 있음.

### 4. 개발자 Observability (관측성)
- **현상**: Fallback 상황 발생 시 `safeMock` 함수 내 `console.error`로만 로그를 찍어 서버 측에서만 확인 가능함. API 응답에는 내가 실데이터를 보고 있는지, fallback 데이터를 보고 있는지 알 길이 없음.
- **요구사항 대응**: 응답 JSON 객체 내에 `_meta` 필드 등을 추가하여 dev 환경일 때만 fallback 원인, 소요 시간, 모델 정보 등을 노출하도록 추가가 필요함. 사용자 화면에는 표시 금지.

### 5. Sector 카드 아이콘 부재
- **현상**: `SECTOR_UNIVERSE` (`taxonomy.ts`) 내에 아이콘 키가 없음.
- **요구사항 대응**: `iconKey`를 도입하고 카드 렌더링 시 매칭되는 lucide 아이콘 등을 출력해야 함.

### 6. Recent Search Focus 정책
- **현상**: Phase 15에서 ESC 닫기를 적용하여 훌륭히 닫히지만, 회귀 방지가 잘 유지되고 있는지 지속 확인 필요. (자동 open 금지, query 우선 원칙 등).
- **요구사항 대응**: 정책 유지 확인 완료.

### 7. Intraday Hidden
- **현상**: `search-hero-card` 등에서 기본은 일봉 탐색 위주.
- **요구사항 대응**: 그대로 유지.

## Phase 16 Action Items
1. 모델 라우팅 체계 및 orchestrator 전면 수정 (최신 모델 구조 반영 및 JSON Structured Outputs 활용).
2. 홈 카드 데이터 공급용 단일 API `/api/home/intelligence/route.ts` 신설 및 `Promise` In-flight 캐싱 도입.
3. 홈 카드들(`TrendIssuesCard` 등)이 단일 Provider나 page 레벨의 initial data를 공유하도록 구조 변경 (불필요한 무한 로딩, 다중 호출 방지).
4. `SentimentScoreCard` 로딩 Skeleton UI 고도화 (Title 고정, 분석 상태 텍스트 표시).
5. `_meta` 필드 응답 규격 추가로 Dev Observability 확보.
6. `SectorTheme`에 `iconKey` 추가 및 컴포넌트 렌더링 구현.
