# Stockker Architecture (Phase 5 - Research Pivot)

## 1. 개요
Stockker는 초기 실시간 호가/트레이딩 대시보드(Phase 1~4)에서 **“검색 기반 주식 리서치 및 리포트 서비스(Research-first)”** 로 전면 파괴적 혁신을 거쳤습니다. 사용자는 종목을 검색하고 최신 이슈, AI 감성 분석, 자신의 평균단가(평단가)에 맞춘 대응 가이드라인을 쉽고 부드러운 UI로 제공받습니다.

## 2. 코어 모델(Research Domain) 라우팅 
`src/types/research.ts` 인터페이스에 기초하여, 실시간 시세뿐 아니라 비정형 데이터(뉴스, 공시, SNS)를 응집시키는 계층 구조를 갖습니다.
- **Model Router (`src/server/research/model-router.ts`)**: 
  - 현재는 결정론적 모의 데이터(Mock/Stub)를 반환하여 UI/UX 개발 속도를 높였습니다.
  - Phase 6 확장 시 Google Gemini 3.1 Flash-Lite (구조화, 다건 파싱) 및 Gemini 3 Flash (단순 요약) API로 맵핑(Mapping)되어 실시간 분석 리포트를 제공합니다.

## 3. KIS 인프라의 위상 변경 (Freshness Provider)
과거 대시보드의 메인이었던 실시간 KIS API(웹소켓 포함)는 이제 **보조 정보(Freshness Provider)** 로서 백그라운드에서 동작합니다. 
- 복잡한 캔들차트는 심플 꺾은선 추세 차트로 교체되었습니다.
- 트레이딩용 호가창(Orderbook) 기능은 메인 화면에서 전부 제거되었습니다.
- KIS의 토큰 캐싱 및 SSE 재연결 로직은 여전히 유지되나, UI 상으로는 가격이 조금 지연되더라도 심각한 에러(Stale Warning) 대신 부드러운 배지 알림("가격 N시간 전")으로 노출됩니다.

## 4. 컴포넌트 계층도
1. **app/page.tsx**: 홈 화면. 큰 검색 Hero 위젯 하나에 집중해 사용자 흐름을 `app/stocks/[symbol]/page.tsx`로 유도합니다.
2. **app/stocks/[symbol]/page.tsx**: 리서치 리포트 진입점.
   - `StockReportHeader` (가격/AI 한줄요약)
   - `BuyPricePlanCard` (평단가 입력형 액션 플랜 폼)
   - `SimpleLineChartCard`, `IssueTimelineCard`, `SentimentScoreCard`, `RelatedStocksCard`, `SourceListCard`

## 5. UI/UX 디자인 원칙
- **Simple & Clean**: 꽉 찬 화면(Dense UI)을 벗어나 충분한 여백(Gap, Padding)을 유지합니다.
- **2-Button Rule**: 사용자 액션을 강요하지 않도록 화면 당 주요 버튼은 2개 이하로 제한합니다.
- 특정 경쟁사들의 UI 에셋을 복제하지 않고 Shadcn/ui 기반의 고유한 White & F2F4F6 기반의 디자인을 자체 구축했습니다.
