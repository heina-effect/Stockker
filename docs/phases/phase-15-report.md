# Stockker Phase 15 Report: AI 실모델 연동 및 검색 신뢰도 완비

## 1. 개요
Phase 15에서는 실제 OpenAI/Gemini 모델을 연결하여 프로덕션 수준의 AI 인텔리전스를 완성하고, 3,900여 개 전체 상장사(구명칭, 별칭 포함) 검색이 완벽하게 동작하도록 `search-master.json` 구조를 통합했습니다.

## 2. 주요 구현 내역

### 2.1 검색 Source of Truth 일원화 (`search-master.ts`)
- 기존에 `corp-master.json`과 `STOCK_UNIVERSE`로 파편화되어 있던 검색 인덱스를 `search-master.ts`로 통합했습니다.
- **Alias 및 구명칭 지원**: 사용자가 "현대중공업"이나 티커 "329180"을 검색할 경우, 정확히 "HD현대중공업"으로 매핑 및 탐색할 수 있는 `CUSTOM_ALIASES` 구조를 도입했습니다.
- 검색뿐 아니라 서버 컴포넌트(`StockReportPage`)와 API(`mock-data.ts`, `orchestrator.ts`)에서 `getServerStockName`을 단일 진실 공급원(SSOT)으로 사용하도록 개선하여 앱 전체의 종목명 표기 정합성을 맞추었습니다.

### 2.2 실모델 AI Orchestration 구현 (`src/server/ai/orchestrator.ts`)
- `OPENAI_API_KEY` 및 `GEMINI_API_KEY`를 활용하여 실시간 뉴스/공시 데이터를 프롬프트로 전송하고 결과를 받는 `aiAnalyzeSentiment`, `aiSummarizeIssues`, `aiGenerateHomeIntelligence` 함수를 구현했습니다.
- **역할 분리**:
  - **OpenAI (GPT-4o)**: 홈 화면 인텔리전스(이슈, 주목 섹터, 종목, 추천) 및 상세 페이지 텍스트 요약 등 문맥의 품질과 내러티브가 중요한 곳에 사용했습니다.
  - **Gemini 2.5 Flash**: 여러 뉴스와 공시(SourceItem)를 입력받아 긍정/부정(Sentiment) 요소를 빠르게 추출하고 원문 Source ID(basisSourceIds)를 매핑하는 구조화된 작업에 사용했습니다.
- **결정론적 Fallback**: AI API 한도 초과나 실패 시, 앱이 다운되지 않고 자연스럽게 기존 `mock-data.ts`의 Mock 응답으로 전환(Fallback)되도록 `safeMock` 패턴을 적용했습니다.

### 2.3 홈 화면 인텔리전스의 실시간/모델 기반 캐싱 (`home-cache.ts`)
- 메인 홈 화면의 여러 컴포넌트(핵심 이슈, 주목 종목, 섹터, 추천)가 개별적으로 API를 호출하여 AI 비용이 급증하는 것을 방지하기 위해 `getHomeIntelligence` 캐시 레이어(TTL 15분)를 신설했습니다.

### 2.4 회귀 및 UI 룰 유지
- **SearchHeroCard Focus 유지**: 사용자가 ESC 키를 누르거나 Focus 아웃될 때 정상적으로 드롭다운이 닫히며, 페이지 복귀 시 부자연스럽게 최근 검색이 열리는 현상이 없도록 처리했습니다. (ESC Keydown 리스너 추가).
- **Intraday Hidden 유지**: 차트는 여전히 일봉(Daily) 중심으로 유지됩니다.
- **비보장 고지 및 출처 분리**: `aiGenerateHomeIntelligence` 프롬프트에 `disclaimer` 필수 포함을 지시했고, `aiAnalyzeSentiment`는 반드시 제공된 `sources` 내의 `id`만 참조하도록 프롬프트를 제한했습니다.

## 3. 결론
이번 페이즈를 통해 Stockker는 단순한 데모나 룰 기반의 서비스가 아닌, 실제 LLM을 활용해 방대한 뉴스와 공시를 실시간으로 해석하고 투자 아이디어를 제공하는 프로덕션 레벨의 리서치 플랫폼으로 도약했습니다.
