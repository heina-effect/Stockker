# Phase 5: Search-First Research Service Pivot Report

## 개요
기존의 복잡한 실시간 호가/트레이딩 대시보드(Trading-first) 환경에서, 초심자도 직관적으로 주식 정보를 탐색하고 AI 요약 및 대응 플랜을 제공받는 **리서치 중심 프로덕트(Research-first)** 로 전면 피벗(Pivot)을 성공적으로 수행하였습니다.

## 주요 변경 사항

### 1. Information Architecture (IA) 및 UX 변경
- **홈 화면 (`/`)**: Orderbook과 PriceChart를 과감히 제거하고, 화면 중앙에 "종목명/티커 검색"을 유도하는 거대한 **Search Hero** UI를 배치했습니다.
- **보고서 화면 (`/stocks/[symbol]`) 신설**: 사용자가 종목 검색 후 도착하는 핵심 랜딩 페이지입니다. 복잡한 캔들차트 대신 추세를 직관적으로 보여주는 Simple Line Chart를 사용하고, 그 옆에 "AI Summary", "감성 점수(Sentiment)", "내 평균단가 기반 가이드" 등 의사결정 보조 위젯을 집중 배치했습니다.

### 2. KIS 실시간 인프라의 위상 축소
기존 Phase 3~4에서 고도화했던 KIS API 및 SSE WebSocket 연동망은 버리지 않고 유지하되 그 역할을 완전히 재정의했습니다.
지금은 메인 UI에서 트레이딩의 긴장감을 주지 않으며 백그라운드에서 "가격 신선도(Price Freshness)"를 제공하고 라인 차트 선분을 업데이트하는 소극적인 보조 도구로만 동작합니다. (Orderbook 기능은 표면에서 숨김 처리됨)

### 3. 리서치 특화 도메인 타입 및 API 구축
`src/types/research.ts` 규격을 정의하여 리서치 앱에 필요한 6대 핵심 기능을 Mock API(`app/api/stocks/...`)로 뚫어두었습니다.
- **Search API**: 단순 명칭/코드 유사도 기반 목록 반환.
- **Report API**: 단건 기업의 가격/요약/헤드라인 복합 정보 응답.
- **Issues API**: 최근 시장 이슈를 타임라인/이벤트 목록 형태로 큐레이팅.
- **Sentiment API**: 긍정(Positive)/부정(Negative) 요인 분리 및 수치화 점수 반환.
- **Related Stocks API**: AI가 포착한 관련성(테마, 밸류체인) 정보 반환.
- **Buy-plan API**: 매수가 입력 시 손익 분할 플랜 제안(POST 메서드 사용).

## 향후 계획 (Phase 6+)
본격적으로 `src/server/research/model-router.ts` 컨트롤러에 **Gemini 3.1 Flash-Lite** 및 **Gemini 3 Flash** API Key를 주입하여, 고정형 Mock 데이터가 아닌 KIS 최신 공시/뉴스 데이터를 긁어서 On-the-fly로 프롬프트를 넘겨 리얼타임 AI 인사이트를 토해내는 완전 연동(Full Integration)을 진행할 수 있게 되었습니다. 대상 아키텍처와 컨트랙트가 이미 완료되었기 때문입니다.
