# Phase 32 Audit — Beta Polish & Release Candidate

## 원인 진단

- 테마 시스템은 `ThemeProvider attribute="class"`와 토큰 기반 CSS로 대부분 정리됐지만, `html` 자체에는 배경/색상 토큰이 직접 적용되지 않았다. 페이지 전환이나 overscroll 영역에서 body 바깥 표면이 어긋날 수 있어 `html/body` 모두 token surface를 소비해야 한다.
- 섹터 404의 주요 원인은 Phase 28 이전 AI/free-text sector route와 canonical taxonomy 불일치였다. 현재 홈 섹터 카드는 `sectorId`만 사용하고 invalid sector는 필터링한다. 다만 master DB 로드가 Supabase 기본 1,000건 페이지만 읽는 구조라 검색/metadata coverage가 부분적으로 줄어들 수 있었다.
- 해운 섹터에 LS ELECTRIC이 보인 원인은 `sec-shipping.memberSymbols` 및 DB `sector_master.member_symbols`에 `010120`이 잘못 포함된 것이다. `010120`은 전력 섹터 종목이며 해운 섹터 구성원이 아니다.
- 종목 상세 오염은 Phase 31에서 `entity-guard`, basis source threshold, stale snapshot guard로 크게 줄었다. 남은 위험은 오래된 DB source 본문이 이미 오염되어 있고 `basis_source_ids`가 2개 이상인 경우다.
- AI 분석 근거 소스 카드는 제목/로딩/빈/오류 프레임은 유지하지만 초기 로드가 `/issues`에서 전체 source를 일부 잘라 쓰고 있었다. 베타 기준으로는 `/sources?page=&limit=` 페이지네이션 엔드포인트를 처음부터 사용해야 한다.
- 소스 카드 날짜 표시는 `generatedAt || collectedAt` fallback을 사용했다. `collectedAt`은 Stockker 수집 시각이므로 원문 발행일/공시일처럼 표시하면 날짜 의미가 흐려진다.
- 증권사 투자의견 카드는 API 미지원/오류를 서버에서 빈 결과로 흡수하고 있어 계정/미지원 문구는 직접 노출되지 않는다. 날짜 표시는 `YYYY-MM-DD`라 다른 리서치 카드의 `yyyy.mm.dd` 규칙과 어긋났다.
- 연관 종목은 deterministic sector peer와 issue co-mention 기반으로 동작한다. 다만 `ai_inferred` 표시 문구는 베타 사용자에게 opaque AI 선정처럼 보일 수 있어 피하는 것이 낫다.
- 일봉 차트 중복 봉은 KIS daily 응답이 이미 오늘 거래일을 포함했는데 live quote 기반 `오늘` 캔들을 추가하면서 발생했다.

## Phase 32에서 닫을 항목

- `html/body` 모두 theme token surface 적용
- DB stock registry 페이지네이션 로드
- source card 초기 로드도 `/api/stocks/[symbol]/sources?page=1&limit=5` 사용
- 소스 카드에서 `collectedAt`을 표시 날짜로 사용하지 않음
- 증권사 투자의견 날짜 형식 통일
- 연관 종목에서 opaque AI 표현 제거
- 해운 섹터 master 정정 및 regression test 유지
- beta release 문서 최신화

## 보존할 가드레일

- intraday hidden 유지
- 상세 진입 DB-first/cache 구조 유지
- source pagination 유지
- 명시적 저장 전용 정책 유지
- AI 요약과 원문 source list 분리 유지
- 홈 single-fetch 유지
- 신규 provider / 신규 AI pipeline 추가 없음
