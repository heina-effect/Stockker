# Phase 32 Report — Beta Polish & Release Candidate

## 변경 요약

- 전역 테마 surface를 `html/body` 모두에 적용했다. light/dark/system은 next-themes class와 CSS token contract를 통해 앱 전체 배경/텍스트에 반영된다.
- DB stock registry 로드를 페이지네이션으로 변경했다. `stock_master`가 1,000건을 넘어도 검색/metadata DB-first 경로가 일부만 읽히지 않는다.
- AI 분석 근거 소스 카드는 초기 로드부터 `/api/stocks/[symbol]/sources?page=1&limit=5`를 사용한다. 더 보기 역시 같은 pagination endpoint를 유지한다.
- 소스 카드 표시 날짜는 원문 날짜(`generatedAt`)만 사용한다. `collectedAt`은 정렬 보조/내부 수집 시각으로만 남기고 발행일/공시일처럼 표시하지 않는다.
- 증권사 투자의견 날짜를 공통 리서치 날짜 형식으로 맞췄다.
- 연관 종목 카드에서 opaque한 `AI 추론` 문구를 제거하고 `보조 연관`으로 낮췄다.
- 일봉 차트는 KIS daily 응답의 마지막 거래일이 KST 오늘이면 live quote 기반 `오늘` 캔들을 중복 추가하지 않는다.
- 해운 섹터에서 잘못된 LS ELECTRIC(`010120`)을 제거하고 HMM, 팬오션, 대한해운, KSS해운, 흥아해운으로 정리했다.
- 섹터 AI 분석 실패 상태에서도 모멘텀 강도 UI가 유지된다.
- Phase 32 audit, beta release checklist, known issues, release freeze rules, ops playbook, architecture/setup/README를 RC 기준으로 업데이트했다.

## 보존한 정책

- intraday hidden 유지
- 홈 single-fetch 유지
- 상세 진입 DB-first/cache 안정성 유지
- source pagination 유지
- 명시적 저장 전용 정책 유지
- AI 요약과 원문 출처 분리 유지
- 신규 provider / 신규 AI pipeline 추가 없음

## 검증

- `npx vitest run src/lib/stocks/chart-utils.test.ts src/data/sectors/taxonomy.test.ts src/lib/stocks/master-validation.test.ts`
- `npx vitest run src/components/report/intraday-hidden.test.ts src/lib/stocks/search-master.test.ts`
- `npx vitest run src/app/theme-contract.test.ts src/components/home/dashboard-header.test.tsx src/components/report/source-list-card.test.tsx`
- `npm run validate:db-master`
- `npm run validate`
- `npm run build`

## Known Issues

- 기존 lint warning 21건은 남아 있으나 error는 없다.
- 오래된 snapshot에 충분한 `basis_source_ids`가 있으면서 본문 자체가 오염된 경우 완전 자동 판별은 어렵다. 현재는 entity guard와 weak snapshot rejection으로 방어한다.
- DART corp-master는 상장폐지/지원 외 시장 종목을 포함할 수 있어 `listing-status` guard와 DB validation으로 차단한다.

## Beta Release 판단

현재 기준으로 베타 RC 가능. 단, 배포 전 `docs/release/beta-release-checklist.md`의 수동 검증 8개 항목은 실제 브라우저에서 완료해야 한다.
