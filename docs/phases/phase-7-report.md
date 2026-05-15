# Phase 7 Report: Research Service Pipeline & UX Refinement

## 1. 개요 (Overview)
Phase 7은 Stockker를 실시간 매매/트레이딩 앱이 아닌, **"검색 중심의 신뢰할 수 있는 주식 리서치 서비스"** 로 한 단계 진화시키기 위한 과정입니다. 이를 위해 검색 품질 강화, 실제 리서치 파이프라인 아키텍처 정립, 종목 상세 차트의 분석(OHLC) 강화, 그리고 연관 종목 및 주요 인프라의 실시간 체계화에 초점을 맞추었습니다.

## 2. 주요 개선 내역 (Key Improvements)

### A. 검색 품질 및 UX 개선 (Search Quality Improvement)
- **메타데이터 단일화**: `src/lib/stocks/metadata.ts`의 정적 Universe를 `model-router.ts`의 `generateSearch`와 연동하여 실제 종목명/티커 검색이 매끄럽게 동작하도록 강화했습니다.
- **키보드 탐색**: `SearchHeroCard` 내 화살표 위/아래 키 및 Enter를 이용한 드롭다운 탐색을 지원, UX 불편을 해소했습니다.

### B. 리얼 리서치 파이프라인 아키텍처 도입 (Real Research Pipeline)
- **외부 Provider 분리**: `src/server/research/providers/news-provider.ts`를 신설하여 향후 외부 실제 API(Naver 등)를 연동할 수 있는 추상화 인터페이스를 추가했습니다.
- **아키텍처 확장 설계**: 현재 하드코딩된 Mock 응답도 하나의 수집 소스로 취급하고, `timestamp`를 부여하여 언제 수집된 데이터인지 파이프라인 규칙에 맞게 노출하도록 구조를 변경했습니다. 

### C. 장중 차트를 캔들스틱(Candlestick) 및 MA로 업그레이드
- **로직 구현**: `LiveMarketProvider` 의 틱데이터(`{time, price}`)를 실시간 On-the-fly로 `aggregateToOHLC` 처리하여 1분 버킷 단위 시가/고가/저가/종가를 산출합니다.
- **차트 컴포넌트**: `IntradayCandlestickChartCard` (`recharts` ComposedChart 기반)를 생성. 몸통(Body)을 명확하게 표현하고 MA5, MA20 이동평균선을 오버레이 하였습니다.
- **툴팁 정돈**: 리서치용 UI에 맞게, 툴팁에서 무리한 소수점은 제거하고 `ko-KR` 정수 단위 가격 변환을 적용했습니다.

### D. AI 연관 종목 카드 실시간 연동 (Live Related Stocks)
- **`useLiveMarket` 바인딩 추가**: `RelatedStocksCard`에 `marketStore` 구독을 할당하였습니다. 
- AI 리포트 분석에 의해 추천된 관련 종목(Symbol)들의 가격 변화 상태가 부가적인 `/api/kis/bootstrap` 백그라운드 워크로 인하여 실시간 가격, 색상 변화, Live Sync 펄스로 동기화됩니다.

## 3. 잔여 이슈 및 권장 방향 (Next/Remaining Steps)
- 실제 외부 OpenAPI 발급이 완료되면 `providers/news-provider.ts` 내의 Mock Fetch 로직을 Axios 기반 실제 호출로 교체하여 Phase 8 "Real API Test"로 진입 가능합니다.
- (진행 중 참고) 현재 dev 서버가 장시간 가동에 의해 `localhost:3000` 응답을 멈춘 상태여서 UI Browser Test 시 `ERR_CONNECTION_REFUSED` 가 발생했습니다. 적용된 코드는 Validation Check(Typescript & Linter)를 완벽하게 통과한 상태입니다. `npm run dev` 서버 재구동 후 `http://localhost:3000`에서 확인이 필요합니다.
