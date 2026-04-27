# Phase 8 Revised Audit

## 1. 차트 의미(Chart Semantics) 혼란 파악
최근 도입된 `DailyCandlestickChartCard` 내에 일봉(Daily)과 당일(Intraday) 모드 토글 스위치가 있으나, **데이터의 교체 없이 하나의 Mock 데이터만 사용**하고 있어 의미적 오류가 있습니다.
- `당일` 탭 클릭 시에도 `generateMockDailyData(50000)`에서 생성된 일간 종가 데이터 배열이 그대로 렌더링되며, 1분봉 차트(당일 장중 흐름)가 반영되지 않습니다.
- 제목과 MA 라벨 모두 "종목 차트", "MA5/MA20" 등으로 하드코딩되어 있어 `일봉`과 `당일` 흐름을 사용자에게 혼동시킵니다.
- 당일 탭에서 MA를 켤 경우 `1분봉 MA5` 로 명확하게 분리되어야 함.

## 2. 검색, AI 파이프라인, 로컬 저장 상태
- 검색 유니버스는 직전 Phase 작업으로 Full-KRX 확장에 성공했으며, 저장 시스템(`LocalStorageAdapter`)은 평단가와 테마 등을 안전하게 보존 중입니다. 
- Buy-plan 폼은 이미 "천 단위 구분", "ko-KR 한국식 보조 텍스트", raw numeric server submit 모델이 구현되어 있으므로 큰 수정이 불필요합니다.
- AI 파이프라인은 현재 종목 상세 뷰의 각 요소(`SentimentScoreCard`, `BuyPricePlanCard`) 호출 등으로 분산 연결 중. 이번 Phase에서는 관련 종목 컴포넌트(`RelatedStocksCard`) 등이 Live 데이터를 제대로 반영하는지가 주안점. 

## 3. 남은 작업 방향 (Drift Resolution)
1. `DailyCandlestickChartCard` 내부에서 Toggle 값에 따라 `chartData` 배열 소스를 다음과 같이 **명확히 분리**해야 합니다.
   - `mode === "daily"`: 최근 N거래일(Mock or API) + 오늘 현재가 캔들 덧씌우기. (제목: `일봉 차트`)
   - `mode === "intraday"`: `useLiveMarket`에서 내려오는 틱 데이터를 1분봉 단위로 `aggregateToOHLC` 처리된 배열. (제목: `당일 시세 흐름`)
2. 각 툴팁의 MA를 모드에 따라 다르게 레이블링 (`MA5` vs `1분봉 MA5`).
