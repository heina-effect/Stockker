# Phase 6A Reality Audit

## 1. 관심 종목 카드 (WatchlistAsideCard)
- **현재 구현 방식**: 홈 화면 우측의 카드는 `useLiveMarket`에서 가져온 `marketStore`를 기반으로 `DEFAULT_WATCHLIST` 종목들을 표시하고 있음.
- **종목명 문제**: KIS API의 `/api/kis/bootstrap` 호출 시 `index`를 제외한 `stock`은 `name` 필드를 리턴하지 않아, `marketStore[symbol]?.quote.name`이 undefined가 됨. 카드는 이를 `quote.name || symbol` 방식으로 표기 중이라 종목명 대신 티커(symbol)가 중복('005930 / 005930') 노출되고 있었음.
- **해결 방안**: 프론트엔드/백엔드 공용 Metadata Dictionary(`src/lib/stocks/metadata.ts`)를 만들어, 모든 주식 symbol에 대해 정확한 한국 종목명을 반환하도록 수정 필요.

## 2. 상세 페이지 실시간 연동 부재 (StockReportPage, StockReportHeader)
- **현재 구현 방식**: `StockReportPage` 진입 후 `StockReportHeader`는 `/api/stocks/[symbol]/report`에서 가져온 정적 Mock 데이터(currentPrice 등)만 화면에 보여주고 있음. `LiveMarketProvider`에 해당 symbol을 활성(selected) 종목으로 지정하지 않기 때문에 백그라운드에서 실시간 스트리밍이 생성되지 않고 멈춰 있음.
- **해결 방안**: 
  - `StockReportHeader` 등 클라이언트 컴포넌트 마운트 시 `setSelectedSymbol(symbol)`을 호출하여 라이브 프로바이더의 포커스를 이동.
  - 종목 상세 가격 데이터를 Mock이 아닌 `marketStore[symbol]?.quote`에서 가져다 쓰도록 수정.
  - `StockReportHeader` 컴포넌트가 Live/Stale 등 현재 네트워크 상태를 정확히 인지하여 `FreshnessLabel`에 넘기도록 결합.

## 3. 차트 (SimpleLineChartCard)
- **현재 구현 방식**: `recharts`의 기본 Line을 사용해 `dataMin / dataMax` 영역 사이의 흐름을 보여줌. 엑스축의 시간이 가려져 있고, 단일 선의 흐름으로는 장중 변동을 명확히 알아보기 어려움.
- **해결 방안**: 
  - 코드를 `BarChart` 기반으로 리팩토링.
  - XAxis/YAxis 및 Custom Tooltip 컴포넌트를 활용하여 장중(1분 틱 등) 가격 변화를 막대 바 형식으로 보여주고, 마우스 Hover 시 시간/가격을 Ko-KR 포맷으로 명확히 표기.
  - 기존 실시간 trade/price point의 타임스탬프를 bucketize하여 BarChart에 입력하는 로직 구현. (이미 1분 간격 bucket으로 들어오고 있으므로 그대로 랜더링 고도화 적용 가능)

## 결론
- 본 수정 사항들은 거대한 아키텍처 공사보다는, '현재 끊어진 프론트엔드의 상태 관리 선(State Binding)'을 다시 묶어주는 과정임.
- 각 UI 계층이 `LiveMarketProvider`와 `Metadata Source of Truth`를 공유하도록 선을 정리함.
