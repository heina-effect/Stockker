# Stockker Phase 16 Report: AI 효율화 및 관측성 개선

## 1. 개요
Phase 16에서는 무분별한 AI API 호출을 방지하고 비용 및 대기 시간(Latency) 최적화를 달성하기 위한 전반적인 모델 구조 및 아키텍처 개편을 진행했습니다. 개발자 관점에서의 가시성(Observability) 또한 대폭 강화되었습니다.

## 2. 주요 개선 내역

### 2.1 하이브리드 모델 라우팅 최적화
- **구조적 변경 (orchestrator.ts)**: 기존 GPT-4o 단일 의존성을 완화하고 최신 모델 조합으로 세분화했습니다.
- **역할 분담**:
  - `gpt-5.5` (OpenAI): 상세 페이지 요약 등 논리적 추론이 강하게 요구되는 작업.
  - `gemini-3.0-flash` (Gemini): 뉴스 감성 점수 측정 및 출처(Basis Source) 구조화.
  - `gpt-5.4-mini` (OpenAI): 홈 대시보드의 실시간 이슈 및 섹터 데이터 생성용 빠르고 가벼운 모델 도입.

### 2.2 홈 화면 호출(Fetch) 단일화 (Consolidation)
- **개선 전**: 4개의 개별 카드(이슈, 종목, 섹터, AI픽)가 각각 API를 찔러 OpenAI 호출이 4번까지 중복 발생 가능성 내재.
- **개선 후**:
  - `/api/home/intelligence` 단일 엔드포인트 신설.
  - Client-side에서 `HomeIntelligenceProvider` 컨텍스트를 도입해 최초 1회만 fetch 하도록 구조 변경.
  - Server-side(`home-cache.ts`)에서 `inFlightPromise`를 활용해 동시 다발적 요청에 대한 중복 호출 원천 차단 (Race Condition 해결).

### 2.3 UX 및 관측성(Observability) 개선
- **Sentiment Score Skeleton**: 로딩 중 뼈대(Skeleton UI)와 `분석 중...` 상태를 명확히 렌더링해 레이아웃 점프를 방지.
- **Sector Icons**: `SECTOR_UNIVERSE`(`taxonomy.ts`)에 `iconKey` 필드를 추가하고, Lucide 아이콘과 동적 매핑하여 홈 화면의 시각적 완성도 증진.
- **Dev Observability**: API 응답값에 `_meta` 필드를 주입하여, `development` 모드 시 `SentimentScoreCard` 및 홈 화면 하단 플로팅 배지에 모델명, 제공자, 응답 속도, Fallback 사유를 노출. 일반 사용자는 볼 수 없도록 처리.

### 2.4 안전망 유지
- `safeMock` 등 Fallback 정책은 유지. (API Key 없거나 오류 발생 시 Mock 데이터로 즉시 전환됨)
- Recent Search Focus 정책(최근 검색어)의 ESC 키 닫기 등 회귀(Regression) 방지 확인 완료.

## 3. 결론
이로써 Stockker는 다수의 AI 호출을 안정적, 경제적으로 관리하면서도 지연 시간을 극복하는 프론트/백엔드 최적화 아키텍처를 완성했습니다. 개발 중 장애가 생기더라도 화면의 Dev 배지를 통해 원인을 즉각 파악할 수 있어 디버깅 생산성이 크게 향상되었습니다.
