# Phase 9 Audit

## 1. 당일 10분봉 차트 문제 원인 (Y축 축소/0값 수렴 현상)
- **차트 0퍼센트 붕괴의 진인**: `minPrice`, `maxPrice` 계산 시 `viewBaseData` 내의 `null` 값 대처 부재.
- 미래 시간대에 대해 `open, high, low, close` 속성을 `null`로 세팅했는데, 
  1. `Math.min(...data.map(d => d.low))` 과정에서 `null`이 숫자로 파싱될 때 `0`으로 인식되어 차트의 최하단이 `0`까지 넓어집니다.
  2. `calculateMA` 함수 내에서 `Number(arr[i-j].close) || 0` 처리 시, `null`일 경우 `0`이 합산되면서 `[ma5, ma20]` 값이 쪼그라들어 `0`에 수렴하는 현상이 발생합니다.
- **결론**: `null` 값에 대해 수학 연산(`Math.min`, `calculateMA`)을 엄격히 예외 처리해야 합니다.

## 2. 평단가 명시적 저장 UX 
- `BuyPricePlanCard`에서 사용자가 기입한 '임시 평단가'는 `state`에만 유지되고 페이지 이탈 시 휘발되는 규칙이 `handleSubmit`에서 자동 저장을 뺌으로써 정상 동작하고 있습니다.
- 이제 서버사이드 및 컴포넌트 마운트 초기화(Hydration)를 매끄럽게 처리하는 'Hardening'이 필요합니다.

## 3. 리포트 신뢰도 및 Related Stocks
- 리포트 및 연관 종목 데이터는 `api/stocks/[symbol]/related` 등으로 서빙중입니다.
- AI 파이프라인의 원문/근거 분리와 `freshness` 구조를 UI에 더 탄탄하게 반영할 필요가 있습니다.
