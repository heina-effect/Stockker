# Stockker Architecture (Phase 12 - Data Pipeline & Persistence)

## 1. 개요
Stockker는 초기 실시간 호가/트레이딩 대시보드에서 **“검색 기반 주식 리서치 및 리포트 서비스(Research-first)”** 로 전면 혁신을 거쳤습니다. Phase 12를 통해 실제 데이터(뉴스, 공시) 기반의 AI 파이프라인과 로컬 우선 저장소 아키텍처가 확립되었습니다.

## 2. 코어 모델(Research Domain) 라우팅 및 파이프라인
- **Model Router (`src/server/research/model-router.ts`)**: 클라이언트 요청을 받아 파이프라인 모듈로 분배합니다.
- **Pipeline (`src/server/research/pipeline/*`)**:
  - `collect.ts`: KIS(뉴스), DART(공시) 등 다수의 프로바이더에서 Raw 데이터 수집.
  - `normalize.ts`: 각각 다른 규격의 데이터를 `IssueItem`으로 표준화 및 중복 제거.
  - `rank.ts`: 시간 역순, 중요도 등에 따라 데이터를 정렬 및 클러스터링.
  - `summarize.ts`: 랭킹된 데이터를 바탕으로 AI 요약 (추후 LLM 바인딩).

## 3. 로컬 스토리지 어댑터 (Persistence Layer)
- `src/lib/user-storage/local-adapter.ts`를 통해 클라이언트 측 로컬 스토리지에 데이터를 영속화합니다.
- **스키마 (Schema)**: `watchlist`, `recentSearches`, `recentViewed`, `buyPrices`, `bookmarkedReports`, `preferences`.
- 추후 백엔드 DB 연동 시 이 어댑터 인터페이스만 교체하여 Seamless한 서버 마이그레이션이 가능합니다.

## 4. KIS 인프라의 위상 변경 (Freshness Provider)
실시간 KIS API(웹소켓 포함)는 보조 정보(Freshness Provider)로서 백그라운드에서 동작합니다. 
- 복잡한 당일 분봉 차트는 시스템 안정성 확보를 위해 Hidden 처리되었습니다 (`NEXT_PUBLIC_ENABLE_INTRADAY_CHART=0`).
- KIS 트랜잭션 초과 에러(EGW00201) 방지를 위해 서버단 In-flight Deduplication이 적용되어 있습니다.

## 5. 컴포넌트 계층도
1. **app/page.tsx**: 홈 화면. 최근 검색어 및 Watchlist가 연동된 Search Hero 포함.
2. **app/stocks/[symbol]/page.tsx**: 리서치 리포트 진입점.
   - `StockReportHeader` (가격/북마크/AI 한줄요약)
   - `BuyPricePlanCard` (평단가 입력형 명시적 액션 플랜 폼)
   - `DailyCandlestickChartCard`, `IssueTimelineCard`, `SentimentScoreCard`, `RelatedStocksCard`, `SourceListCard`
