# Phase 34 Audit — Watchlist Productization, KIS 정보성 API, 섹터/투자의견 보강

## 진단 요약

Phase 33 문서는 관심 종목 워크플로우가 활성화됐다고 설명했지만, 런타임에서는 검색 결과에서 관심 종목을 추가하는 명시 버튼이 없고 `/workflows/watchlist`가 존재하지 않는 `/api/stocks/[symbol]/summary`를 호출하고 있었다. 즉 저장 레이어는 있었지만 제품 화면과 리서치 데이터 연결이 끊겨 있었다.

## 확인 결과

### 1. 관심 종목 추가 실패 지점
- `LocalStorageAdapter.addToWatchlist()`는 구현되어 있었다.
- 홈 검색 UI(`SearchHeroCard`)는 검색 결과를 상세 페이지 진입 링크로만 사용했고, 관심 종목 추가 액션을 노출하지 않았다.
- `나의 관심 종목` 카드는 localStorage를 읽지만 저장 이벤트 구독이 약해 추가 직후 즉시 갱신되는 흐름이 부족했다.

### 2. Watchlist source of truth
- source of truth는 `localStorage["stockker_user_data_v1"].watchlist`이다.
- 서버 DB sync는 현재 범위에 없다.
- 기존 기본 watchlist에 삼성전자/SK하이닉스가 들어 있어 “명시적 저장 전용” 정책과 충돌했다.

### 3. 관심종목 리서치 모아보기 실패 원인
- `/workflows/watchlist`의 보드가 `/api/stocks/[symbol]/summary`를 호출했지만 해당 엔드포인트는 존재하지 않았다.
- 상세 리포트의 `/report`, `/sentiment`, `/issues`, `/sources`, `/analyst-opinion`에는 필요한 데이터가 분산되어 있었다.
- 결과적으로 저장된 관심 종목이 있어도 리서치 보드는 빈 화면 또는 준비 중 상태에 머물 가능성이 컸다.

### 4. KIS 정보성 API 연결 상태
이미 구현되어 있는 KIS 정보성 API:
- `getDomesticStockQuote()` — 주식현재가 시세
- `getDomesticStockDaily()` — 국내주식기간별시세
- `getDomesticIndex()` — 국내주식업종기간별시세 기반 업종 흐름
- `getStockAnalystOpinions()` — 국내주식 종목투자의견

아직 직접 래퍼가 없는 KIS API:
- 관심종목(멀티종목) 시세조회
- 거래량순위
- 체결강도 상위
- 관심종목등록 상위
- 증권사별 투자의견 상세 래퍼

KIS 공식 개발자 문서에는 위 순위/시세분석 API가 존재하지만, 현재 코드에는 안정적으로 호출 가능한 래퍼가 없으므로 이번 단계에서는 새 provider를 늘리지 않고 기존 래퍼를 재사용한다.

### 5. 홈 주목 종목/섹터 기준
- 홈 주목 종목은 AI home intelligence와 source count 중심이다.
- 홈 주목 섹터는 canonical sector normalizer를 거치지만 KIS 순위 API 기반 랭킹은 아직 아니다.
- 런타임 문구는 “출처 근거 수, 최근 이슈 밀도, 대표 종목 시세 흐름”처럼 설명 가능한 기준으로 맞춰야 한다.

### 6. 섹터 상세 KIS 정보 부족
- 섹터 상세는 `SECTOR_UNIVERSE`와 섹터 AI snapshot 중심으로 표시됐다.
- KIS 업종기간별시세 또는 대표 종목 현재가를 섹터 상세 카드로 보여주는 UI가 없었다.

### 7. 투자의견 카드
- 종목 상세의 투자의견 카드는 `/api/stocks/[symbol]/analyst-opinion`을 통해 붙어 있다.
- watchlist에는 투자의견 요약이 활용되지 않았다.

## Phase 34에서 잠글 범위

- 검색 결과에서 관심 종목 추가 버튼을 실제 동작시킨다.
- local-first watchlist를 명시적 저장 전용으로 유지하고, 기본 watchlist mock을 제거한다.
- `/api/watchlist/summary`를 추가해 관심 종목별 시세/요약/감성/이슈/투자의견을 한 번에 묶는다.
- 홈 `나의 관심 종목` 카드와 `/workflows/watchlist`를 같은 summary API로 연결한다.
- 섹터 상세에 KIS 업종기간별시세 기반 시장 신호 카드를 추가한다.
- 직접 래퍼가 없는 KIS 순위 API는 문서상 known risk로 남기고, UI 문구는 현재 구현 기준에 맞춰 과장하지 않는다.

## Beta RC Gate 추가 감사 — 2026-05-15

### 확인된 P0 후보

1. **검색 결과 없음 submit fallback**
   - 검색 결과가 없더라도 영문/숫자 입력이면 `/stocks/<query>`로 이동할 수 있었다.
   - 없는 종목명/임의 문자열 검증에서 상세 진입 오염 또는 404 UX로 이어질 수 있어 출시 차단 후보로 분류했다.

2. **DB-first 검색의 alias 손실 및 지연**
   - `generateSearch()`가 DB `stock_master`를 우선 사용할 때 stock alias를 비워 두고 있었다.
   - DB 연결이 느릴 때 검색 응답이 local master fallback으로 빠르게 내려오지 못할 수 있었다.

3. **소형/테마 fixture metadata coverage 부족**
   - 대한광통신, 우리로, 인벤티지랩, 에스피시스템스는 DART corp-master에는 있으나 정적 metadata/taxonomy coverage가 약했다.
   - DB가 비거나 느린 환경에서 상세 섹터 표시/연관 종목/검색 안정성이 떨어질 수 있었다.

4. **SourceListCard 초기 로드 경로 회귀**
   - release freeze rule은 초기 로드도 `/sources?page=1&limit=...` 사용을 요구하지만, 런타임은 다시 `/issues`를 통해 전체 sources를 받아오고 있었다.
   - source pagination 정책 위반 가능성이 있어 P0 후보로 분류했다.

### 결론

위 P0 후보는 모두 코드 수정 및 focused test로 잠갔다. 남은 항목은 브라우저 콘솔/모바일 viewport 육안 확인, 첫 방문 KIS quote 체감처럼 베타 중 관찰 가능한 P1이다.
