# Beta Release Checklist — Stockker Phase 32 RC

최종 업데이트: 2026-05-13

## 자동 검증

- [ ] `npm run lint` 통과 (error 0)
- [ ] `npm run typecheck` 통과
- [ ] `npm run validate` 통과
- [ ] `npm run validate:db-master` 통과
- [ ] `npm run test:contracts` 통과
- [ ] `npm run test:workflows` 통과
- [ ] `npm run build` 성공

## 홈 화면

- [ ] 홈 진입 시 카드들이 스켈레톤/빈/오류 상태를 제목과 함께 표시
- [ ] 홈 인텔리전스 요청은 `/api/home/intelligence` 1회만 발생
- [ ] 재진입 시 이전 홈 인텔리전스가 먼저 렌더되고 백그라운드에서 갱신됨
- [ ] 트렌딩 종목 카드는 카드 전체가 클릭 가능
- [ ] 트렌딩 종목 우측 metric은 `근거 N건` 또는 미표시
- [ ] 트렌딩 섹터 카드는 canonical sectorId로만 이동
- [ ] 섹터 카드에 “왜 지금” 설명과 주도주가 보임
- [ ] light/dark/system 전환 시 전체 앱 surface가 바뀜
- [ ] 새로고침 후 테마 preference가 유지됨

## 종목 상세

- [ ] 삼성전자, 현대차, 에이프릴바이오, LIG넥스원 상세 진입 가능
- [ ] 타 종목/타 섹터 이슈가 요약/감성/이슈에 섞이지 않음
- [ ] 리포트 상태 뱃지는 `근거 충분/보통/부족/최신 데이터 없음/생성 중` 기준으로 표시
- [ ] 일봉 차트에서 같은 거래일 봉이 중복 표시되지 않음
- [ ] intraday 차트는 기본적으로 숨김
- [ ] AI 분석 근거 소스 카드는 제목, 로딩, 빈 상태, 오류 상태를 항상 표시
- [ ] 소스 카드는 최신순이며 공시는 공시일, 뉴스는 발행일 기준으로 표시
- [ ] `collectedAt`이 사용자-facing 날짜처럼 보이지 않음
- [ ] 증권사 투자의견 카드는 제목/프레임을 항상 유지
- [ ] 연관 종목은 관계 유형과 이유를 명확히 표시

## 섹터 상세

- [ ] 홈 섹터 카드 클릭 시 404가 발생하지 않음
- [ ] `/sectors/sec-shipping`에 LS ELECTRIC이 보이지 않음
- [ ] 섹터 주요 종목은 canonical taxonomy/DB master와 일치
- [ ] 섹터 AI 분석 실패 시에도 모멘텀 강도 UI가 유지됨
- [ ] 대표 종목/주도주 표현이 중복되어 혼란스럽지 않음

## 저장/워크플로우

- [ ] 검색 결과에서 종목을 관심 종목에 추가할 수 있음
- [ ] 중복 추가가 발생하지 않음
- [ ] 홈 우측 관심 종목 카드가 즉시 갱신됨
- [ ] 관심 종목 저장은 사용자 클릭으로만 발생
- [ ] 북마크 저장은 사용자 클릭으로만 발생
- [ ] 최근 본 종목은 상세 진입 시에만 추가
- [ ] `/workflows/watchlist`에 저장된 관심 종목 카드가 표시됨
- [ ] report snapshot이 없어도 “리포트 준비 중” 상태가 표시됨
- [ ] `/workflows/recent`, `/workflows/bookmarks`, `/workflows/watchlist` 빈 상태 copy가 친절하게 표시

## 운영 확인

- [ ] `/api/health` 정상
- [ ] `/api/ops/metrics` 정상 또는 DB 미연결 사유 명확
- [ ] Supabase `stock_master/sector_master` 검증 결과 error 0
- [ ] 배포 환경에 Gemini, Supabase, KIS, DART, GNews/NewsAPI 키 설정 확인

## 승인 기준

자동 검증이 모두 통과하고, 수동 검증에서 P0/P1 이슈가 없으면 Phase 32 Beta RC로 배포 가능하다.
