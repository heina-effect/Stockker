# Phase 8B Audit

## 1. 차트 시맨틱과 데이터 무결성 (DailyCandlestickChartCard)
- **일봉 (Daily)**: 
  - 최근 `DailyCandlestickChartCard.tsx` 분석 결과, `symbol`이 변경되어도 `useState`의 `mockBase` 배열이 비워지지 않습니다. 이는 유저가 다른 주식을 클릭했을 때(e.g. 삼성전자 -> 카카오) 이전 주식의 가격대와 캔들이 그대로 화면에 나오는 치명적인 **데이터 오염(Value Mixing)**의 원인입니다. 
  - `useEffect` 내에서 `symbol` 변경 시 명시적으로 `setMockBase([])` 를 트리거 하여 새로운 심볼의 `quote.price` 기반으로 일봉 리셋이 일어나게 수정해야 합니다.
- **당일 (Intraday)**:
  - 현재 `aggregateToOHLC`는 `tick.time`(보통 1초 단위나 1분 단위) 그대로 버킷을 형성합니다. 이를 `10분 단위` 로 묶는(Floor to nearest 10 min) 로직을 적용하여 **10분봉**의 시맨틱을 완벽하게 만족시켜야 합니다.

## 2. 평단가 저장 UX (BuyPricePlanCard)
- 현재: `가이드 받기` (`handleSubmit`) 실행 시 무조건 `LocalStorageAdapter.setBuyPrice`가 호출되어 자동 저장됩니다.
- 요구사항: 가이드 생성과 저장을 분리. '가이드 받기'는 1회성 세션 상태이며, 사용자가 직접 **[평단가 로컬 저장]** 버튼을 눌러야만 `localStorage`에 기입되고 새로고침/이탈 시 복원되어야 합니다.

## 3. 검색 및 AI 파이프라인 유지
- KIS 실시간 연동, Full KRX 종목 지원, AI 통신 및 관련 주식 모듈은 안정적이므로 유지/재사용합니다.
