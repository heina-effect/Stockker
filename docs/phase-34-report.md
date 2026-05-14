# Phase 34 Report — Watchlist Productization, KIS 정보성 API, 섹터/투자의견 보강

## 완료 요약

관심 종목 저장은 local-first source of truth로 정리하고, 홈 검색 결과에서 바로 추가할 수 있게 복구했다. `나의 관심 종목` 카드와 `/workflows/watchlist`는 새 `/api/watchlist/summary`를 통해 현재가, 등락률, 섹터, AI 요약, 이슈, 감성, 공시/뉴스 수, 투자의견을 함께 보여준다.

섹터 상세에는 KIS 업종기간별시세와 대표 종목 현재가를 활용하는 `KIS 업종 흐름` 카드를 추가했다. 직접 래퍼가 없는 KIS 순위 API는 이번 단계에서 새로 추정 구현하지 않고, 홈/섹터 카드 문구는 현재 구현된 근거 기준에 맞춰 정리했다.

## 주요 변경

### 관심 종목 추가 복구
- 홈 검색 결과에 관심 종목 추가 버튼을 추가했다.
- 이미 저장된 종목은 체크 상태로 표시해 중복 추가를 막는다.
- 저장 후 `stockker:user-storage-updated` 이벤트로 홈 카드와 workflow가 즉시 갱신된다.
- 기본 watchlist mock 값을 제거해 명시적 저장 전용 정책과 맞췄다.

### 나의 관심 종목 카드 제품화
- 기존 단순 저장 목록에서 리서치 허브 카드로 변경했다.
- 각 종목은 종목명/티커, 현재가/등락률, 섹터, 왜 지금 봐야 하는지, 감성 상태, 새 이슈 수, 공시 수를 보여준다.
- 카드 클릭 시 상세 리포트로 이동한다.

### 관심종목 리서치 모아보기 실구현
- `/workflows/watchlist`가 존재하지 않는 summary API 대신 `/api/watchlist/summary`를 사용한다.
- 종목별 AI 헤드라인/요약, 최근 핵심 이슈 1~2개, 감성, 이슈/소스 수, 투자의견 요약을 표시한다.
- snapshot이 없거나 일부 보조 API가 실패해도 카드 전체가 사라지지 않고 `리포트 준비 중` 상태를 유지한다.

### KIS 정보성 API 활용
- watchlist summary에서 `getDomesticStockQuote()`로 현재가/등락률을 가져온다.
- watchlist summary에서 `getStockAnalystOpinions()`로 평균 목표가/최근 의견 수를 가져온다.
- 섹터 상세에서 대표 종목 KIS 현재가와 대표 종목의 KIS 업종코드를 이용해 `getDomesticIndex()` 업종기간별시세를 조회한다.
- 국내주식 종목투자의견/증권사별 투자의견은 KIS 공식 샘플 기준 정보성 엔드포인트를 사용한다. `KIS_MODE=mock`이어도 호출은 허용하되, 응답과 UI에 `KIS mock · 실제 응답` meta를 노출해 Stockker mock 데이터와 구분한다.

### 증권사 투자의견 카드 마감
- 기존 빈 배열 원인은 오래된 TR-ID와 실제 KIS 필드명 불일치였다. 공식 샘플 기준 `invest-opinion/FHKST663300C0/16633`, `invest-opbysec/FHKST663400C0/16634`를 사용하도록 수정했다.
- 투자의견 목록은 3개씩 pagination한다.
- 의견 텍스트는 pill 뱃지로 표시한다.
- 평균 목표가, 최고 목표가, 현재가 대비를 요약으로 표시하고 최근 30일 의견 수는 카드 제목 옆에 배치했다.
- 현재가 대비 계산은 상세 화면의 live quote를 우선 사용하고, 없을 때만 API `currentPrice`를 fallback으로 사용한다.
- `KIS real` 상태 뱃지는 숨기고, mock 모드에서만 `KIS mock · 실제 응답` 뱃지를 표시한다.

### 섹터 상세 보강
- `SectorMarketSignalCard`를 추가했다.
- KIS 업종명, 업종 지수, 등락률을 보여준다.
- 대표 종목별 퍼센트 목록과 업종코드 미확인 fallback 문구는 제거해 카드 밀도를 낮췄다.
- `섹터 주요 종목`은 메인 8칸 영역의 emerald 카드로 이동하고, 각 종목은 흰색 미니 카드로 표시한다.
- `관찰 후보`는 KIS 업종 흐름 카드 하단으로 이동해 오른쪽 보조 정보 흐름에 맞췄다.

### 감성 카드 문구 정리
- `주요 호재 (Positive)`, `주요 악재 (Negative)`의 영어 병기를 제거했다.
- AI가 요인 뒤에 붙인 영어 괄호 번역은 표시 단계에서 제거한다.

### KIS 네트워크 범위 정리
- 전역 `LiveMarketProvider`가 섹터/홈/workflow에서도 기본 종목 `005930`과 index를 부트스트랩하던 흐름을 제거했다.
- KIS bootstrap/SSE는 `/stocks/[symbol]` 종목 상세에서만 열리며, route symbol 하나만 초기화한다.
- 섹터 화면의 KIS 호출은 `/api/sectors/[sectorId]/market` 경로로 한정되어, 해당 섹터 대표 종목과 업종기간별시세만 조회한다.

## 보존한 가드레일

- intraday 차트는 열지 않았다.
- 홈 인텔리전스 single-fetch 구조는 유지했다.
- watchlist summary는 관심 종목 보드 전용 aggregation이며 홈 트렌딩 카드별 AI 호출을 추가하지 않았다.
- 사용자 저장은 localStorage 명시 저장만 사용한다.
- AI 요약과 원문 출처 분리 정책은 변경하지 않았다.
- production mock market claim을 재도입하지 않았다.
- 섹터 페이지에서 무관한 삼성전자/index live bootstrap이 열리지 않도록 회귀 테스트를 추가했다.

## 검증

- `npm run typecheck`
- `npm run lint`
- `npm run build`
- focused Vitest:
  - `src/server/kis/analyst-opinion.test.ts`
  - `src/components/report/analyst-opinion-card.test.tsx`
  - `src/components/report/sentiment-score-card.test.tsx`
  - `src/components/sectors/sector-market-signal-card.test.tsx`
  - `src/components/dashboard/live-market-provider.test.tsx`
  - `src/components/workflows/watchlist-research-board.test.tsx`

## 남은 리스크

- KIS 공식 문서에는 거래량순위, 체결강도 상위, 관심종목등록 상위 API가 있으나 현재 코드에 안정 래퍼가 없다. 이번 Phase에서는 추정 TR-ID로 새 래퍼를 만들지 않았다.
- `/api/watchlist/summary`는 최대 10개 종목까지 묶지만 각 종목의 report/sentiment/issues/opinion을 조회하므로, Gemini/KIS quota 상태에 따라 일부 필드가 `리포트 준비 중` 또는 `데이터 없음`으로 낮아질 수 있다.
- KIS 업종 흐름은 대표 종목 quote의 `kisIndustryCode`가 있어야 업종기간별시세까지 표시된다. 업종코드가 없으면 대표 종목 시세 fallback으로 동작한다.
