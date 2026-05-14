# Phase 31 Audit — 종목 오염 차단 / 카드 상태 / 연관 종목

## 원인 진단

- LIG디펜스앤에어로스페이스에서 반도체 요약이 섞일 수 있었던 주 원인은 오래된 snapshot 또는 DB curated source를 반환할 때 최종 entity validation이 한 번 더 걸리지 않았기 때문이다.
- `aiSummarizeIssues()`는 `clusters.length > 0`이면 요약 생성을 허용했고, `basisSourceIds`가 1건이거나 약해도 “live” 리포트로 표시될 수 있었다.
- `FreshnessLabel`은 `type="report"`이면 `리포트 방금 생성`과 `리포트 방금 생성 실시간` 문구를 만들었다. 이 문구는 실제 근거 충분성보다 `FreshnessState`에만 의존했다.
- `IssueTimelineCard`는 empty 상태에서 카드 제목이 사라지는 별도 레이아웃을 반환했다.
- `AnalystOpinionCard`, `SourceListCard`, `RelatedStocksCard`는 제목은 대체로 유지했지만 loading 문구와 empty/error copy가 서로 달라 상태 일관성이 약했다.
- `RelatedStocksCard`가 비는 주요 이유는 `SECTOR_UNIVERSE.memberSymbols`에 없는 종목, KIS sector map의 non-canonical ID, 그리고 `IssueCluster.relatedSymbols` 미생성에 의존했기 때문이다.
- 상세 헤더는 `kisIndustryCode`, `kisIndustryName`, canonical sector metadata를 가격/리포트 헤더에 표시하지 않았다.
- LS ELECTRIC 검색 시 연관 종목에 `LS`가 중복처럼 보인 이유는 로컬 `STOCK_UNIVERSE`에서 `000880`이 `LS`로 잘못 등록되어 있었고, `sec-ai-infra.memberSymbols`도 실제 LS(`006260`)가 아니라 `000880`을 포함했기 때문이다. 이후 공시 공동언급에서 실제 LS(`006260`)가 다시 들어와 `LS`가 두 번 보였다.
- 소스 카드와 최근 핵심 이슈는 서로 다른 날짜 포맷터를 사용했다. 7일 이내 날짜는 `MM.DD`, 오래된 날짜는 locale 기반 `YYYY. MM. DD.`처럼 표시되어 `공시일/발행일`의 날짜 모양이 일관되지 않았다.
- `한화` 검색에서 보통주 `한화(000880)`가 보이지 않은 직접 원인은 위 `000880 -> LS` 오등록이었다. 검색 정렬도 exact common-stock 우선이 약해 prefix 종목들이 먼저 노출될 수 있었다.
- 일회성 수동 패치로는 같은 유형의 오류를 막을 수 없다. DB `stock_master`, static `STOCK_UNIVERSE`, `SECTOR_UNIVERSE`, DART `corp-master.json` 사이의 코드/종목명/섹터 membership 일치성을 자동 검증해야 한다.
- 읽기 전용 DB 감사 결과, 현재 업로드된 DB는 `49 stocks / 12 sectors`만 보유하고 있고 `14 errors / 2 warnings`가 확인됐다. 주요 오류는 `000880=LS`, `419080=펩트론`, `033640=SKC`, `222420=이오테크닉스`, `041510=SK스퀘어`, `003670=포스코인터내셔널`, `035720=KAKAO`, `073120=LIG넥스원`, `054060=뉴로메카`였다.
- 검색 API(`/api/stocks/search`)는 DB `stock_master`를 읽지 않고 `src/data/dart/corp-master.json` 전체에 `STOCK_UNIVERSE`, `SECTOR_UNIVERSE`를 덮어쓴 로컬 인덱스를 사용했다. 따라서 DB master를 정제해도 검색 결과는 로컬 DART/metadata 상태에 다시 끌려갈 수 있었다.
- 검색 원천 자체가 local DART였기 때문에, 검색에서 보이는 전체 종목 universe를 `stock_master`에 동기화하고 런타임 검색은 DB-first로 바꿔야 한다. 로컬 인덱스는 Supabase 장애 또는 env 누락 시 fallback으로만 유지한다.
- `지디(155960)`, `젬(248020)`은 검색에서 DART corp-master를 그대로 사용하면서 노출됐다. `155960`은 DART에 남아 있지만 상장폐지 이력이 있고, `248020`은 KOSPI/KOSDAQ이 아닌 KONEX 성격이라 Stockker의 현재 KOSPI/KOSDAQ 리서치 런타임 지원 대상이 아니다.
- DART corp-master는 공시 법인 코드 매핑에는 필요하지만 “현재 검색 가능한 상장 종목 master”로 단독 사용하면 상장폐지/지원 외 시장 종목이 섞인다. 검색/상세 진입에는 별도 listing support guard가 필요하다.
- 일봉 차트에 같은 모양의 마지막 봉이 두 개 보인 원인은 KIS 일봉 응답이 이미 `2026-05-13` 캔들을 포함했는데, 클라이언트가 live quote로 만든 `오늘` 캔들을 추가로 append했기 때문이다. 일봉 API의 날짜 키와 KST 오늘 날짜가 같으면 live daily candle을 붙이면 안 된다.
- 해운 섹터에 LS ELECTRIC이 노출된 원인은 `sec-shipping.memberSymbols`와 `sector_master.member_symbols`에 `010120`이 잘못 들어가 있었기 때문이다. `010120`은 LS ELECTRIC(전력)이며 해운 섹터 구성 종목이 아니다.
- 섹터 AI 분석 API가 실패하면 기존 에러 분기에서는 “모멘텀 강도” 헤더가 사라질 수 있었다. AI 본문은 실패하더라도 모멘텀 지표 UI는 유지되어야 한다.

## 확인한 회귀 위험

- intraday hidden은 `DailyCandlestickChartCard`의 env gate에 남아 있으며 이번 수정에서 건드리지 않았다.
- 상세 진입 안정성은 DB snapshot 우선 구조를 유지하되, fallback/1개 이하 근거 snapshot만 무시하도록 좁게 변경했다.
- source pagination은 `/api/stocks/[symbol]/sources?page=&limit=` 유지.
- explicit save-only, AI summary/raw source separation, 홈 single-fetch 구조는 변경하지 않았다.

## 관리 섹터

현재 canonical `SECTOR_UNIVERSE`는 다음 섹터를 관리한다.

- `sec-semiconductor` 반도체
- `sec-battery` 2차전지
- `sec-biotech` 바이오·제약
- `sec-platform` 인터넷·플랫폼
- `sec-finance` 금융
- `sec-entertainment` 엔터테인먼트
- `sec-auto` 자동차
- `sec-defense` 우주항공·방산
- `sec-ai-infra` AI 인프라·전력
- `sec-obesity-bio` 차세대 바이오·비만
- `sec-robotics` 로봇·자동화
- `sec-advanced-materials` 첨단 소재·기판
- `sec-banking` 은행
- `sec-securities` 증권
- `sec-insurance` 보험
- `sec-shipbuilding` 조선
- `sec-heavy-machinery` 중공업
- `sec-construction` 건설
- `sec-shipping` 해운
- `sec-nuclear` 원전
- `sec-energy` 에너지·화학
- `sec-retail` 백화점·유통
- `sec-content` 영화·콘텐츠
- `sec-food` 식음료
- `sec-beauty` 뷰티·의료기기
- `sec-gaming` 게임
- `sec-telecom` 통신
- `sec-steel` 철강·금속
- `sec-travel` 여행·카지노

## Master 검증 기준

- stock symbol은 DART `corp-master.json`의 `stock_code -> corp_name`과 비교한다.
- 일반적으로 표시명이 DART명과 달라도 되는 종목은 explicit alias allow-list로만 허용한다. 예: `현대차`, `LS ELECTRIC`, `KT`.
- sector `memberSymbols`는 static metadata 또는 DART corp master 중 하나에는 반드시 존재해야 한다.
- sector `representativeSymbols`는 반드시 같은 sector의 `memberSymbols`에 포함되어야 한다.
- DB master는 static canonical master와 merge되지만, 업로드된 DB 자체도 migration으로 정정해야 한다.
