# Phase 6A Report: Core Research UX Fixes & Refinements

## 1. 개요 (Overview)
Phase 5에서 Research 중심 앱으로 피벗한 이후 발생한 "관심 종목(Watchlist) 메타데이터 소실", "상세 페이지(Report Page) 실시간 갱신 누락", "장중 시세 흐름 차트의 가독성 부족" 등 3개의 치명적 회귀/미완성 이슈를 해결하여 프로덕트의 안정성을 복구하였습니다.

## 2. 주요 수정 내역 (Key Fixes)

### A. 관심 종목 메타데이터 통합 (Watchlist Metadata Fix)
- **원인**: 기존 시스템이 KIS Bootstrap 시 받는 `quote` 에 의존하고 있었으나, 주식 종목의 경우 KIS API가 `name` 필드를 반환하지 않아 UI에서 티커(`005930 / 005930`)가 중복 표기됨.
- **해결 방식**: 
  - `src/lib/stocks/metadata.ts` 파일을 신설하여 전체 주식/지수의 `STOCK_UNIVERSE`(종목 메타데이터 딕셔너리)를 구축.
  - `getStockName` 유틸리티 함수를 제공하여, 관심 종목 카드와 상세 페이지 헤더에서 티커 기반으로 항상 올바른 종목명("삼성전자")을 참조하도록 동기화함.

### B. 종목 상세 페이지 실시간 모델 바인딩 (Detail Live Rebinding)
- **원인**: `LiveMarketProvider` 의 상태 관리가 홈 화면 시점(Default: 삼성전자)에 머물러 있었고, `StockReportHeader`는 진입 시 초기(Mock) 데이터만 Fetch 후 실시간 갱신 구독 범위에서 제외되어 있었음.
- **해결 방식**: 
  - `StockReportHeader` 마운트 시 `useLiveMarket` 의 `setSelectedSymbol(symbol)`을 트리거하도록 `useEffect` 바인딩 적용.
  - 이로 인해 KIS SSE (Server-Sent Events) 스트림이 즉시 해당 종목으로 포커스를 이동하며, 화면 전체에 실시간 가격과 Freshness(신선도)가 전파됨.

### C. 장중 차트 (Intraday Bar Chart) 업그레이드
- **원인**: 단일 선(Line) 차트는 장중 가격 변동의 방향성을 파악하기 어렵고, 세밀한 틱 단위 뷰잉(Viewing)에 한계가 있었음.
- **해결 방식**: 
  - `simple-line-chart-card.tsx`를 폐기하고 `intraday-price-bar-chart.tsx` 로 완전 교체.
  - Recharts 기반 `BarChart`를 채용하여 1분 버킷 단위 시뮬레이션 데이터를 주가 흐름 막대로 표시. 빨간색(상승) 및 파란색(하락) 셀 컬러 적용.
  - Custom Tooltip을 도입하여 Hover 시 "특정 시각", "해당 시점 가격", "직전 대비 변화값"을 명확히 읽을 수 있게 함.

## 3. 검증 결과 (Validation)
- **브라우저 Subagent 테스트 완료**: 
  - 홈 화면의 Name/Symbol 중첩 에러 해결 시각적 확인.
  - 리포트 진입 시 초기 로딩 이후 KIS Live 스트림 연결 완료. 70초 관찰을 통해 탭 화면에서 새로고침 없이 바 차트 및 가격 실시간 업데이트 확인. 
  - Tooltip 정상 포매팅 및 Hover 동작 검증 완료.

## 4. 잔존 리스크 및 다음 단계 (Next Steps)
- 실제 KIS의 Ticker 데이터를 현재 `getStockName` 정적 딕셔너리로 커버중이나, 종목 Universe가 방대해질 경우 백엔드 측 Metadata DB로 분리 필요.
- Phase 6B: 이제 프론트엔드가 안정화되었으므로, 결정론적(Mock) 데이터를 반환하는 `/api/stocks/[symbol]/report`를 걷어내고, 실제 실시간 뉴스/공시 데이터를 긁어와 **Gemini API (3.1 Flash-Lite)** 모델에 태워 진짜 AI 요약을 받아오는 백엔드 연동 작업에 착수 가능.
