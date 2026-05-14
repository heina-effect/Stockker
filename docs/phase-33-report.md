# Phase 33 Report — Runtime Truth / Watchlist Workflow / Stale-first UX

## 변경 요약

- 검색 결과에 관심 종목 추가 버튼을 추가했다. 종목 결과만 추가할 수 있고, 섹터 결과는 기존처럼 섹터 페이지 이동만 한다.
- `LocalStorageAdapter` 저장 후 `stockker:user-storage-updated` 이벤트를 발행해 같은 화면의 watchlist UI가 즉시 갱신되게 했다.
- 관심 종목 source of truth를 local-first `watchlist`로 명확히 유지했다. DB sync는 추가하지 않았다.
- 홈 우측 `WatchlistAsideCard`는 storage/custom event를 구독해 검색 결과에서 추가한 종목을 즉시 반영한다.
- `/workflows/watchlist`는 존재하지 않는 `/summary` 대신 `/report`를 호출한다. snapshot/요약이 없어도 각 관심 종목 카드는 “리포트 준비 중” 상태로 남는다.
- `/workflows/recent`, `/workflows/bookmarks`는 `/sentiment` 응답의 `{ sentiment }` wrapper를 풀어 실제 점수/요인을 표시한다.
- `HomeIntelligenceProvider`에 stale-first local cache를 추가했다. 이전 성공 응답이 있으면 먼저 렌더하고, 백그라운드에서 `/api/home/intelligence`를 갱신한다.
- 종목 리포트 화면을 `max-w-7xl`과 카드별 grid span으로 재배치했다. 차트/감성/투자의견/핵심 이슈/연관 종목/소스/평단가 카드가 큰 화면에서 더 넓게 분산된다.
- 연관 종목 현재가가 없을 때 `—`만 보이지 않도록 `불러오는 중...`, `최신가 없음`, `공유 시세` 상태를 표시한다.

## 보존한 정책

- intraday hidden 유지
- 상세 진입 DB-first/cache 안정성 유지
- source pagination 유지
- 명시적 저장 전용 정책 유지
- AI 요약과 원문 출처 분리 유지
- 홈 single-fetch 유지
- 새 provider / 새 AI pipeline 추가 없음

## 검증

- `npx vitest run src/components/home/search-hero-card.test.tsx src/lib/user-storage/local-adapter.test.ts src/components/workflows/watchlist-research-board.test.tsx src/components/home/home-intelligence-provider.test.tsx src/components/report/source-list-card.test.tsx src/components/report/intraday-hidden.test.ts src/lib/stocks/chart-utils.test.ts`
- `npm run validate:master`
- `npm run validate:db-master`
- `npm run validate`
- `npm run build`

## 남은 리스크

- 관심 종목은 local-first라 브라우저/기기 간 동기화되지 않는다. 이는 현재 정책상 의도된 상태다.
- 홈 stale-first cache는 마지막 성공 응답을 브라우저 localStorage에 저장한다. 오래된 응답일 수 있으므로 “갱신 중” 상태를 함께 표시한다.
- 연관 종목 현재가는 heavy fanout을 하지 않기 때문에 공유 live store에 quote가 없는 종목은 “최신가 없음”으로 남을 수 있다.

## Beta 판단

Phase 33 기준으로 watchlist workflow와 홈 stale-first UX가 실제 런타임에 연결됐다. 브라우저 수동 확인 7개 항목 통과 시 Beta RC 유지 가능.
