# Phase 33 Audit — Runtime Truth / Watchlist / Stale-first / Report Layout

## 원인 진단

- 관심 종목 저장의 source of truth는 `LocalStorageAdapter`의 `watchlist`이다. DB 동기화는 없다. 문제는 검색 결과 UI에 `addToWatchlist()`를 호출하는 명시적 액션이 없어서 사용자가 검색 후 바로 관심 종목에 추가할 수 없었다.
- 홈 우측 `WatchlistAsideCard`는 mount 시 localStorage를 1회만 읽었다. 같은 화면에서 관심 종목을 추가해도 UI가 즉시 갱신되지 않았다.
- `/workflows/watchlist`는 존재하지 않는 `/api/stocks/[symbol]/summary`를 호출했다. 실제 런타임 API는 `/api/stocks/[symbol]/report`이므로 저장된 관심 종목이 있어도 리서치 요약이 채워지지 않았다.
- `/workflows/recent`, `/workflows/bookmarks`는 `/sentiment` 응답의 wrapper를 풀지 않고 `score/trend`를 직접 읽었다. 실제 응답은 `{ ok, sentiment }`라 카드 내용이 빈 상태처럼 보일 수 있었다.
- 홈 `HomeIntelligenceProvider`는 매 mount마다 `data=null`에서 시작해 fetch 완료 전까지 전체 카드가 skeleton으로 보였다. 서버 cache가 있어도 클라이언트 진입 UX는 stale-first가 아니었다.
- 종목 상세 레이아웃은 `max-w-5xl` 안에서 7/5 양열에 카드가 세로로 쌓였다. 큰 화면에서 가로 폭을 충분히 쓰지 못하고 스크롤 피로가 컸다.
- 연관 종목 현재가는 `useLiveMarket()` 공유 store에 quote가 없으면 `—`만 표시했다. heavy quote fanout은 금지되어 있으므로, 가격이 없을 때도 relation type/reason과 상태 문구를 유지해야 한다.
- Phase 32 후속으로 일봉 오늘 캔들 중복, 해운 섹터 LS ELECTRIC 오등록, DART-only 미지원 종목 노출은 이미 코드/DB에 반영됐으며 Phase 33에서도 보존해야 한다.

## Source of Truth

- 관심 종목: local-first `localStorage["stockker_user_data_v1"].watchlist`
- 최근 본 종목: 상세 진입 시 `recentViewed`
- 북마크: 사용자 클릭 시 `bookmarkedReports`
- 홈 인텔리전스: `/api/home/intelligence` 단일 fetch + 클라이언트 stale-first cache
- 리포트/감성/소스/연관 종목: 기존 `/api/stocks/[symbol]/*` 엔드포인트

## 닫을 항목

- 검색 결과에서 관심 종목 추가 버튼 제공
- 중복 추가 방지 및 즉시 watchlist UI 갱신
- watchlist workflow를 `/report` API로 연결하고 snapshot이 없어도 “리포트 준비 중” 상태 표시
- recent/bookmarks 응답 wrapper 처리
- 홈 stale-first local cache 적용
- 상세 리포트 grid를 `max-w-7xl` 기반으로 재배치
- 연관 종목 가격 상태를 `불러오는 중 / 최신가 없음 / 정상 가격`으로 표현

## 보존할 가드레일

- intraday hidden 유지
- 상세 진입 안정성 유지
- source pagination 유지
- 명시적 저장 전용 정책 유지
- AI 요약과 원문 출처 분리 유지
- 새 provider / 새 AI pipeline 추가 없음
