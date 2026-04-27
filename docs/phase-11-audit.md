# Phase 11 Audit: 초기 상세 진입 Rate-Limit (EGW00201) 및 당일 차트/AI 리소스 진단

## 1. 개요
본 감사는 종목 상세 페이지 최초 진입 시 지속적으로 발생하는 KIS Rate-Limit 초과 에러(EGW00201)의 원인을 집중 분석하고, Phase 11 지시사항에 따라 당일 차트의 Hidden 처리 및 AI 리소스의 실체화 방향을 진단합니다.

## 2. EGW00201 Rate-Limit 에러 원인 분석 (Fan-out 폭주)
상세 페이지 마운트 시 클라이언트 컴포넌트들의 개별 `useEffect`가 비동기적으로 폭발하면서 1~2초 내에 약 11개의 KIS REST API가 동시 다발적으로 호출되는 현상이 핵심 원인입니다.

### 마운트 시점의 Call Hierarchy:
1. `StockReportHeader` -> `useLiveMarket().bootstrap()` 
   -> `FHKST01010100` (Quote)
   -> `FHKST01010200` (Orderbook)
   -> **`FHKST03010200` (Intraday Chart 백필)** : 안 보이는 탭인데도 호출됨
2. `DailyCandlestickChartCard` -> `useEffect` 
   -> `FHKST03010100` (Daily Chart)
3. `IssueTimelineCard` -> `useEffect` 
   -> `FHKST01012200` (News API)
4. `RelatedStocksCard` -> `useEffect`
   -> 연관 종목 3개에 대해 각각 `bootstrap()` 루프
   -> 3 x (Quote + Orderbook) = 6개의 추가 REST 호출

**결과**: 최소 11개의 외부 API 요청이 동시에 발생하며, React 18의 StrictMode 환경 하에서 Effect가 두 번 실행될 시 22개의 요청이 인젝션되어 100% Rate-Limit(`EGW00201`)을 유발합니다.

## 3. 해결 방안 설계 (Phase 11 Hotfix)

### 3.1. in-flight 중복 방지 (Deduplication) 및 지연 로딩
- `RelatedStocksCard`에서 자체적으로 라이브 Quote를 폴링/부트스트랩하는 로직을 제거하거나 크게 지연/간소화합니다. 
- API Route 단(`ohlc/route.ts` 등)에서 Node.js 메인 컨텍스트를 활용한 in-flight Promise Dedupe 및 짧은 TTL 메모리 캐싱을 도입합니다.

### 3.2. 당일 차트 (Intraday) Feature Flag 적용
- `process.env.NEXT_PUBLIC_ENABLE_INTRADAY_CHART` 플래그를 도입하여, 기본 비활성화(`0`) 시:
  1. `DailyCandlestickChartCard` 탭에서 "당일" 버튼을 렌더링하지 않습니다.
  2. `live-market-provider` 내에서 백엔드 `ohlc?mode=intraday` 호출을 억제합니다.

### 3.3. AI 리소스 및 공시 (Disclosure) 실체화
- 현재 `IssueTimelineCard`는 KIS 뉴스만 의존(`FHKST01012200`).
- Open DART API 기반의 공시(Disclosure) 호출 모듈을 새롭게 구현하여, 뉴스와 공시 데이터를 하나의 `IssueItem`으로 병합하여 제공하도록 업그레이드할 예정입니다.

## 4. 명시적 저장 정책 진단
- 현재 `local-adapter.ts`에서 평단가 저장은 명시적인 `save()` 호출시에만 이루어지는 구조이나, UI 상에서 임시 입력 시점과 확정 시점의 Lifecycle을 다시 한번 점검하고 문서화할 것입니다.
