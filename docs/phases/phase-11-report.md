# Phase 11 Report: Rate-Limit Hotfix, Intraday Hidden, and Real AI Sources

## 1. 작업 개요
상세 페이지 초기 진입 시 다량의 REST 요청이 동시 발생하여 야기되던 `EGW00201 (초당 거래건수 초과)` 문제를 해결했습니다. 불안정한 당일 차트(Intraday)를 기본 비노출(Hidden) 처리하고, AI 리포트 출처를 뉴스(KIS) 및 공시(Open DART Fallback)로 확대 연동하여 리포트의 신뢰도를 실체화했습니다.

## 2. 주요 구현 내용

### 2.1. Rate-Limit Hotfix (EGW00201 제거)
- **in-flight Request Deduplication**: `src/server/kis/cache.ts`를 신설하여 동일한 KIS API 호출이 동시에 발생할 경우 단일 Promise를 공유(single-flight)하도록 제어했습니다.
- **Short TTL Caching**: `getDomesticStockQuote`, `getDomesticStockOrderbook`, `getDomesticStockDaily`, `getDomesticStockNews`에 대해 각각 15~60초의 짧은 메모리 캐싱을 적용해 무분별한 요청을 방어했습니다.
- **불필요한 Eager Fetch 제거**: `RelatedStocksCard` 컴포넌트가 마운트되자마자 3개의 연관 종목에 대해 `bootstrap`을 동시 호출하던 폭주 로직을 삭제하여 초기 fan-out을 크게 줄였습니다.

### 2.2. 당일 차트 (Intraday) Feature Flag 처리
- 환경 변수 플래그(`NEXT_PUBLIC_ENABLE_INTRADAY_CHART=1`)가 설정되지 않은 한, UI에서 '당일' 버튼이 렌더링되지 않도록 조치했습니다.
- `LiveMarketProvider` 부트스트랩 내부에서도 플래그가 꺼져 있으면 `intraday` 백필 호출을 아예 시도하지 않도록 근원적으로 차단했습니다.

### 2.3. AI 리포트 출처(Source) 강화
- **공시(Disclosure) 연동 기초**: `src/server/research/providers/disclosure-provider.ts`를 신설하여 Open DART 연동을 위한 규격을 마련했으며, 현재는 API 키가 없으므로 Deterministic Fallback(기재정정 등 모의 공시)을 반환하여 파이프라인의 종단간(End-to-end) 동작을 확보했습니다.
- **Merge & Dedupe**: `model-router.ts`에서 뉴스(KIS)와 공시(Provider) 데이터를 하나의 `IssueItem` 배열로 병합하고 시간 역순으로 정렬하여 클라이언트에 제공하도록 수정했습니다.

## 3. 회귀 테스트 및 검증 상태
- **상세 진입 시 에러 없음**: Node.js 백엔드 로그 확인 결과 KIS API 호출이 성공적으로 Dedupe 및 캐싱되고 있으며, `EGW00201`은 더 이상 발생하지 않습니다.
- **일봉 차트 안정화**: 당일 차트를 숨김 처리함에 따라 기본 차트인 일봉의 안정성과 렌더링 품질이 확보되었습니다.
- **명시적 저장 규칙**: `local-adapter.ts`의 동작 원칙(의도적인 `save` 버튼 클릭시에만 평단가 저장)이 유지되고 있습니다.
