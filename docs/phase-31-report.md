# Phase 31 Report — 신뢰도 잠금

## 변경 요약

- 종목 상세 요약/감성/이슈 생성 직전에 `entity-guard`를 추가해 타 종목·타 섹터 소스를 한 번 더 제거했다.
- fallback snapshot 또는 `basis_source_ids` 2건 미만 snapshot은 재사용하지 않고 재생성을 시도한다.
- 리포트 상태 뱃지는 “방금 생성 실시간” 대신 `근거 충분 / 근거 보통 / 근거 부족 / 최신 데이터 없음 / 생성 중`으로 표시한다.
- 최근 핵심 이슈, AI 분석 근거 소스, 국내 증권사 투자의견, 연관 종목 카드는 제목을 항상 유지하고 loading/empty/error 상태를 표시한다.
- 상세 헤더에 canonical 섹터 아이콘/섹터명과 KIS 업종명을 표시한다.
- KIS sector map을 canonical sector ID로 보정하고, stock metadata에 에이프릴바이오를 추가했다.
- 연관 종목은 sector peer, issue mention, disclosure linked, peer 타입을 지원하며 `rankAndCluster`에서 공동 언급 종목을 추출한다.
- KIS `일반서비스` 업종은 더 이상 인터넷·플랫폼으로 fallback하지 않는다. 에이프릴바이오처럼 KIS 업종이 넓게 잡히는 종목은 Stockker canonical master를 우선한다.
- `sector_master`, `stock_master` 확장 migration을 추가하고, DB가 오래되어도 static canonical master와 merge되도록 했다.
- `000880` 오등록을 `한화`로 수정하고, 실제 LS는 `006260`으로 추가했다. `sec-ai-infra`의 member도 `000880`에서 `006260`으로 교체해 LS ELECTRIC 연관 종목 중복을 막았다.
- 검색 랭킹을 exact name/symbol 우선으로 조정해 `한화` 입력 시 보통주 `한화(000880)`가 먼저 나오도록 했다.
- 소스 카드와 최근 핵심 이슈 날짜를 공통 `formatResearchDate()`로 통일했다. 당일 데이터는 `HH:mm`, 그 외는 `yyyy.mm.dd`로 표시한다.
- `master-validation`을 추가해 static metadata/taxonomy/DART corp master 불일치를 테스트에서 차단한다.
- `npm run validate`에 `validate:master`를 포함해 lint/typecheck 이후 master consistency도 함께 확인한다.
- DB 읽기 감사에서 발견된 업로드 오류를 `006_phase31_master_table_expansion.sql`에 반영했다. migration 적용 시 `000880 한화`, `006260 LS`, `087010 펩트론`, `011790 SKC`, `348340 뉴로메카`, `035720 카카오`, `003670 포스코퓨처엠`, `041510 에스엠`이 정정되고, 잘못된 `073120 LIG넥스원`, `054060 뉴로메카` row는 비활성화된다.
- 원격 Supabase `sector_master / stock_master`도 service role로 직접 업데이트했다. 최종 DB 검증 결과는 `0 errors / 0 warnings / 105 stocks / 29 sectors`.
- 검색 API를 DB-first로 전환했다. `/api/stocks/search`는 이제 `stock_master + sector_master`를 먼저 랭킹하고, DB 조회 실패 또는 결과 없음일 때만 로컬 `corp-master.json + metadata + taxonomy` 인덱스로 fallback한다.
- `scripts/sync-stock-master-from-dart.mjs`와 `npm run sync:stock-master`를 추가했다. 검색 원천이었던 DART `corp-master.json`의 3,916개 종목을 `stock_master`에 upsert하고 기존 `sector_tag`는 보존한다.
- `scripts/validate-db-master.mjs`와 `npm run validate:db-master`를 추가했다. 원격 DB 검증 결과는 `0 errors / 0 warnings / 3,924 active stocks / 29 active sectors`.

## 보존한 정책

- intraday hidden 유지
- 상세 진입 DB-first/cache 구조 유지
- source pagination 유지
- mock production path 재도입 없음
- AI 요약과 원문 source list 분리 유지
- explicit save-only 정책 유지

## 검증

- `npm run typecheck`
- `npx vitest run src/server/research/entity-guard.test.ts src/lib/date-format.test.ts src/lib/stocks/search-master.test.ts src/lib/stocks/sector-utils.test.ts src/server/kis/sector-map.test.ts src/server/research/pipeline/related-stocks.test.ts src/components/report/source-list-card.test.tsx src/components/report/intraday-hidden.test.ts`
- `npm run validate:master`
- `npm run validate:db-master`
- `npm run sync:stock-master`
- `npm run lint`
- `npm run build`

## 남은 리스크

- 오래된 snapshot에 `basis_source_ids`가 2건 이상 들어 있으면서 실제 내용만 오염된 경우는 DB source 본문 없이 완전 판별하기 어렵다.
- KIS 업종명은 bootstrap quote가 도착한 뒤 표시된다. canonical 섹터명은 metadata-first로 즉시 표시된다.
- DART `corp-master.json`에는 과거 상장/비상장 이력이 포함될 수 있다. 현재 Phase 31에서는 기존 검색 원천을 DB와 맞추는 데 초점을 두었고, 정확한 상장상태 필터는 KRX 상장 마스터 연동이 필요하다.
