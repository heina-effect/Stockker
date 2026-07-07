# Stockker Architecture (Phase 34 — Watchlist Productization, KIS 정보성 API, 섹터/투자의견 보강)

## 1. 개요

Stockker는 검색 기반 한국 주식 리서치 서비스입니다. 실시간 매매 터미널이 아닙니다.

핵심 원칙:
- **DB-First**: 외부 API 호출 전 DB 스냅샷을 우선 조회
- **Stale-while-revalidate**: 오래된 스냅샷도 즉시 반환하고 백그라운드에서 조용히 재생성
- **Single-fetch Home**: 홈 화면의 모든 카드는 `/api/home/intelligence` 단일 엔드포인트에서 데이터를 공유
- **Metadata-First**: 종목 이름/티커는 AI 응답 대기 없이 동기적으로 즉시 표시
- **Explicit Save-Only**: 사용자 데이터는 명시적 액션에서만 로컬 스토리지에 저장

---

## 2. 데이터 파이프라인

```
외부 소스 (4개) ─→ collectRawSources ─→ normalizeSources ─→ Supabase news_sources
                                                            ↓
                                              curateSourcesWithEmbedding (Gemini text-embedding-004)
                                                            ↓
                                              Supabase source_embeddings (pgvector)
                                                            ↓
                                              rankAndCluster ─→ IssueCluster[]
```

### 소스 제공자 (4-Source Pipeline)

| 소스 | 타입 | 역할 |
|---|---|---|
| KIS API | 종목 뉴스 | 국내 종목 중심 최신 뉴스 |
| Open DART | 공시 | 기업 공시 (사업보고서, 공정공시 등) |
| GNews | 뉴스 | 글로벌 + 국내 뉴스 키워드 검색 |
| NewsAPI | 뉴스 | 다국어 뉴스 보완 |

---

## 3. AI 모델 라우팅 (Gemini-Only)

모든 AI 기능은 Google Gemini 계열 모델만 사용합니다.

| 기능 | 모델 | 역할 |
|---|---|---|
| 소스 전처리/필터링 (Stage 1) | `gemini-2.5-flash-lite` | 경량 파싱, 관련성 필터, 후보 추출 |
| 최종 요약/감성/홈 인텔리전스 (Stage 2) | `gemini-2.5-flash` | 고품질 텍스트 생성, 감성 분석 |
| 소스 임베딩/큐레이션 | `text-embedding-004` | 768차원 벡터, 의미 기반 품질 필터 |

OpenAI/Claude는 런타임 AI 모델로 사용하지 않습니다. Claude는 구현 에이전트 역할입니다.

---

## 4. 스냅샷 캐시 아키텍처

### 종목 스냅샷 (`stock_research_snapshots`)

```
요청 → getOrGenerateSnapshot(symbol)
  ├─ DB 히트 + TTL(1h) 이내 → 즉시 반환 (live)
  ├─ DB 히트 + TTL 초과 + 24h 이내 → 즉시 stale 반환 + 백그라운드 재생성
  └─ DB 미스 또는 24h 초과 → 실시간 생성 후 저장
```

- **In-flight dedup**: `snapshotPromiseCache` Map으로 동일 symbol 중복 생성 방지
- **Cooldown**: sentimentCooldown Map (5분/symbol, 메모리-only)

### 섹터 스냅샷 (`sector_research_snapshots`)

```
SSR (server component):
  → getSectorSnapshot(sectorId) [DB 조회만, ~50ms]
    ├─ DB 히트 + TTL(1h) 이내 → 쉘 + AI 섹션 즉시 렌더링
    ├─ DB 히트 + TTL 초과 → stale 반환 + 백그라운드 generateSectorSnapshot
    └─ DB 미스 → 쉘만 즉시 반환 + SectorAISection(client) 마운트

클라이언트 (SectorAISection):
  → fetch /api/sectors/[sectorId]
    └─ generateSectorSnapshot 실행 후 결과 반환
    → "AI 분석 생성 중" 상태 표시 후 완료 시 렌더링
```

**Phase 26 개선**: SSR이 generateSectorSnapshot을 직접 await하지 않음. 캐시 미스 시 SSR은 즉시 쉘을 반환하고, 생성은 클라이언트 측에서 비동기로 진행됨.

### 홈 인텔리전스 캐시

- `/api/home/intelligence` → `getHomeIntelligence()` (home-cache.ts)
- Upstash Redis 또는 메모리 캐시 (15분 TTL)
- 만료 시 `aiGenerateHomeIntelligence(recentSources)` 2-stage 재생성
- 생성 결과는 `normalizeHomeIntelligence()`를 통과해 `trendingSectors`와 legacy `sectors`가 모두 canonical `SECTOR_UNIVERSE` ID만 포함하도록 보정
- production fallback은 mock 시장 claims를 반환하지 않고 빈 배열과 fallback meta를 반환
- 클라이언트 `HomeIntelligenceProvider`는 마지막 성공 응답을 `localStorage["stockker_home_intelligence_v1"]`에 보관한다. 재진입 시 stale cache를 먼저 렌더하고 백그라운드에서 단일 `/api/home/intelligence` fetch로 갱신한다.

### 검색 Master

- `/api/stocks/search`는 `generateSearch()`를 통해 DB `stock_master`와 `sector_master`를 먼저 조회한다.
- 검색 랭킹은 symbol/name exact match, alias match, prefix match, substring match 순으로 계산한다. 같은 점수에서는 종목을 섹터/ETF보다 우선한다.
- DB-first 검색은 900ms를 넘기면 local master fallback으로 내려온다. DB stock item에도 local master의 alias/name을 병합해 별칭 검색 정확도를 유지한다.
- 검색 결과가 없을 때 임의 문자열을 상세 페이지로 보내지 않는다. 없는 종목명은 빈 상태로 머무른다.
- `stock_master`는 DART `corp-master.json`을 `npm run sync:stock-master`로 동기화한다. 기존에 수동 보정한 `sector_tag`는 upsert 시 보존한다.
- DART corp-master는 공시 법인 master라 상장폐지 또는 KOSPI/KOSDAQ 지원 범위 밖 종목이 포함될 수 있다. `listing-status.ts`의 unsupported guard는 이런 심볼을 검색/상세 진입에서 제외한다.
- DB 조회 실패 또는 결과 없음일 때만 로컬 fallback(`src/data/dart/corp-master.json` + `STOCK_UNIVERSE` + `SECTOR_UNIVERSE`)을 사용한다.
- `stock_master`는 1,000건을 초과하므로 `db-registry.ts`는 페이지네이션으로 active row 전체를 로드한다.
- 원격 DB consistency는 `npm run validate:db-master`로 확인한다. 이 검증은 active stock, active sector, sector member/representative symbol의 깨짐을 점검한다.

---

## 5. 사용자 저장 레이어 (Local-First)

`src/lib/user-storage/local-adapter.ts` → `localStorage["stockker_user_data_v1"]`

| 스키마 키 | 타입 | 설명 |
|---|---|---|
| `watchlist` | `string[]` | 관심 종목 심볼 목록 |
| `recentSearches` | `RecentSearchItem[]` | 최근 검색 기록 (최대 10개) |
| `recentViewed` | `string[]` | 최근 본 종목 (최대 10개) |
| `buyPrices` | `Record<string, number>` | 종목별 저장 매수 평단가 |
| `bookmarkedReports` | `string[]` | 북마크한 종목 심볼 |
| `preferences` | `UserPreferences` | 테마, 차트 모드 등 |

**저장 정책**: 자동 저장 없음. 사용자 명시적 액션(북마크 클릭, 관심 종목 추가 등)에서만 저장.

`recentViewed`는 종목 상세 페이지 마운트 시 자동 추가됨 — 이것이 유일한 예외이며, 이는 "조회 히스토리"이므로 의도된 동작.

관심 종목은 local-first가 단일 source of truth다. 검색 결과의 `관심 종목 추가` 버튼은 `LocalStorageAdapter.addToWatchlist()`만 호출하며, 저장 후 `stockker:user-storage-updated` 이벤트로 홈 aside와 workflow가 즉시 갱신된다. DB sync는 Phase 33 범위에 없다.

### 관심 종목 리서치 summary (Phase 34)

```
홈 검색 결과 + 버튼
  → LocalStorageAdapter.addToWatchlist(symbol)
  → stockker:user-storage-updated 이벤트
  → WatchlistAsideCard / WatchlistResearchBoard 갱신
  → GET /api/watchlist/summary?symbols=...
      ├─ KIS 현재가 getDomesticStockQuote
      ├─ DB-first report snapshot generateReportSummary
      ├─ 감성 generateSentiment
      ├─ 이슈/소스 generateIssues
      └─ KIS 투자의견 getStockAnalystOpinions
```

`/api/watchlist/summary`는 관심 종목 보드 전용 aggregation이다. 새 뉴스 provider나 새 AI pipeline을 추가하지 않고 기존 상세 리서치 경로를 재사용한다. 실패한 보조 데이터는 null/empty 상태로 낮추며 카드 자체를 제거하지 않는다.

---

## 6. 프론트엔드 아키텍처

### 홈 화면

```
page.tsx (Server Component)
  └─ HomeIntelligenceProvider (Client, single fetch)
       ├─ TrendIssuesCard   (issues)
       ├─ TrendStocksCard   (stocks)
       ├─ TrendSectorsCard  (trendingSectors / sectors)
       └─ AIPicksCard       (aiPicks)
  └─ WatchlistAsideCard (local-first watchlist + /api/watchlist/summary)
```

**중요**: 각 카드는 `useHomeIntelligence()` 훅으로 `HomeIntelligenceProvider`의 context를 공유합니다. 카드 내부에서 별도 fetch 금지.

`WatchlistAsideCard`는 홈 인텔리전스 카드가 아니라 개인 저장 워크플로우 카드다. 저장된 관심 종목이 있을 때만 `/api/watchlist/summary`를 호출하며, 홈 트렌딩 카드에 반복 AI 호출을 만들지 않는다.

**홈 카드 규칙**:
- 트렌딩 종목 카드는 카드 전체가 `/stocks/[symbol]` 링크다.
- 트렌딩 종목 우측 metric은 AI 생성 percent가 아니라 `sourceCount` 기반 `근거 N건`이다.
- 트렌딩 섹터 카드는 `sectorId` canonical slug만 route에 사용한다.

### 종목 상세 (`/stocks/[symbol]`)

```
page.tsx (Server Component, 즉시 렌더링)
  └─ StockReportHeader (Client, metadata-first)
       ├─ 종목명/티커: 동기 getStockName() → 즉시 표시
       ├─ 현재가: useLiveMarket() → SSE 스트림
       └─ AI Summary: fetch /api/stocks/[symbol]/report → skeleton → 결과
  └─ DailyCandlestickChartCard (Client)
  └─ SentimentScoreCard (Client)
  └─ IssueTimelineCard (Client)
  └─ SourceListCard (Client, 페이지네이션)
```

- 일봉 차트는 KIS daily 응답의 마지막 거래일이 KST 오늘이면 live quote 기반 `오늘` 캔들을 추가하지 않는다. 같은 거래일 캔들이 두 번 렌더링되는 것을 금지한다.
- Phase 33 레이아웃은 `max-w-7xl`의 responsive grid를 사용한다. 차트/감성/투자의견/핵심 이슈/연관 종목/소스/평단가 카드는 큰 화면에서 분산 배치되고 모바일에서는 자연스럽게 stack된다.

### LiveMarketProvider 네트워크 범위

`LiveMarketProvider`는 전역 layout에 남아 있지만 KIS bootstrap/SSE는 `/stocks/[symbol]` 종목 상세에서만 열린다. 섹터/홈/workflow 화면에서는 기본 종목 `005930`, KOSPI/KOSDAQ index, mock watchlist extras를 자동 부트스트랩하지 않는다.

보장:
- `/sectors/sec-finance` 진입 시 `/api/kis/bootstrap?symbol=005930`을 호출하지 않는다.
- 섹터 화면에서 `/api/kis/stream?symbol=005930` SSE를 열지 않는다.
- 종목 상세에서는 현재 route symbol 하나만 `/api/kis/bootstrap?symbol=[symbol]`로 초기화한다.
- KOSPI/KOSDAQ index bootstrap은 전역 기본 호출에서 제외한다.

### 섹터 상세 (`/sectors/[sectorId]`)

```
page.tsx (Server Component, 즉시 쉘 렌더링)
  └─ 섹터 이름/설명 (SECTOR_UNIVERSE, 동기)
  └─ 대표 종목 목록 (동기)
  └─ SectorMarketSignalCard (Client)
       ├─ /api/sectors/[sectorId]/market
       ├─ 대표 종목 KIS 현재가
       └─ KIS 업종기간별시세(getDomesticIndex) 기반 업종 흐름
  └─ SectorAISection (Client Component)
       ├─ snapshot 있으면: AI 요약/이슈/리더/관찰후보 즉시 표시
       └─ snapshot 없으면: "생성 중" → fetch /api/sectors/[sectorId] → 결과 표시
```

**보장**: 캐시 미스에도 SSR이 절대 4–12초 블로킹하지 않음.
AI 섹터 분석이 실패해도 섹터 설명, 주요 종목, 모멘텀 강도 UI는 유지한다.

Phase 34부터 섹터 상세는 AI snapshot과 별개로 KIS 정보성 API를 보조 신호로 보여준다. 대표 종목 quote에서 `kisIndustryCode`를 얻을 수 있으면 업종기간별시세를 표시하고, 없으면 대표 종목 등락률 기반 fallback을 표시한다.

## 6.5. KIS 정보성 API 사용 범위 (Phase 34)

| 기능 | 코드 경로 | 용도 |
|---|---|---|
| 주식현재가 시세 | `getDomesticStockQuote()` | watchlist 현재가/등락률, 섹터 대표 종목 신호 |
| 국내주식기간별시세 | `getDomesticStockDaily()` | 일봉 차트 |
| 국내주식업종기간별시세 | `getDomesticIndex()` | 섹터 상세 `KIS 업종 흐름` |
| 국내주식업종 일자별 지수 | `getDomesticIndexDaily()` | 오버나이트 거시필터 (KOSDAQ 정배열) |
| 국내주식 종목투자의견 | `getStockAnalystOpinions()` | 상세/관심종목 투자의견 요약 |

투자의견 API는 KIS 공식 샘플의 정보성 엔드포인트 기준이다. `KIS_MODE=mock`에서도 호출은 허용하지만 응답 meta와 UI 뱃지에 `KIS mock · 실제 응답`을 표시해 Stockker mock/fallback 데이터와 구분한다.

아직 직접 래퍼가 없는 KIS 순위 API는 거래량순위, 체결강도 상위, 관심종목등록 상위다. 홈 주목 종목/섹터는 현재 구현 기준상 source count, 이슈 밀도, 대표 종목 시세 흐름을 중심으로 설명한다.

### KIS 응답 봉수 한도와 기간별시세 페이지네이션 (Phase 37–38)

KIS 기간별시세 엔드포인트는 단일 호출당 반환 봉수에 상한이 있다. 측정값 기준 **업종 일자별 지수(`FHKUP03500100`)는 약 50봉, 주식 일봉/주봉(`FHKST03010100`)은 약 100봉**이다. 120봉 정배열(5>20>60>120) 판정에는 단일 호출 데이터가 부족해, 거시필터는 `kosdaqClose=0`으로 비활성화되고 종목은 "120봉 부족"으로 일괄 탈락(normal/aggressive 0개)하던 버그가 있었다.

- **공통 헬퍼 `fetchPaginatedCandles()`** (`rest-client.ts`)가 지수/일봉/주봉의 페이지네이션을 단일 로직으로 처리한다. 날짜 창을 과거로 옮겨가며 목표 130봉(최대 3~4페이지)을 누적하고, `stck_bsop_date`로 중복 제거 후 최신순으로 정렬한다.
  - `getDomesticIndexDaily()` — 지수(window 90일, 최대 4페이지) · **Phase 37**
  - `getDomesticStockDaily()` — 일봉(window 150일, 최대 3페이지) · **Phase 38**
  - `getDomesticStockWeekly()` — 주봉(window 760일, 최대 3페이지, 120주≈2.5년) · **Phase 38**
- 결과는 **하루 단위 캐시**다. 캐시 키에 KST 날짜를 포함(`{daily|weekly|index_daily}_{id}_{YYYYMMDD}`)하고 TTL 26h를 둬, 종목/지수당 거래일 1회만 신규 조회한다(2차 호출부터 캐시 적중).
- 모든 페이지 호출은 `callKisApi` → 단일 통합 큐(`globalKisRequestQueue`)를 경유하므로 추가 호출도 동일 큐에서 rate limit이 보호된다 (수동 setTimeout으로 큐를 우회하지 않는다).
- 페이지 호출이 `EGW00201`(초당 거래건수 초과)로 막히면 1.2s 백오프 후 1회 재시도하고, 그래도 실패하면 그때까지 확보한 봉으로 Graceful Break한다 (첫 페이지 실패만 에러 전파).
- **호출량 대응**: 일/주봉 페이지네이션으로 종목당 호출이 늘어(상세 1 + 일봉 ~2 + 주봉 ~2) cold-start 부하가 커지므로, 오버나이트 분석 대상을 **`MAX_TARGET_STOCKS = 8`**로 제한한다. 하루 단위 캐시 덕에 당일 2차 호출부터는 거의 즉시 응답한다(실측 cold 16s → warm 0s).

### KIS 요청 큐 단일화 (Phase 37)

`auth.ts`의 KIS REST 호출 직렬화 큐는 `globalThis` 싱글톤 `KisRequestQueue` 하나로 통합되어 있다.

- 시세/주문을 막론하고 모든 `callKisApi`가 **단일 큐(`globalKisRequestQueue`)**를 통과한다. `minIntervalMs=350`(초당 ~2.8건)으로, 실전 계정의 빡빡한 초당 한도(`EGW00201`)를 보수적으로 회피한다.
- 주문 기능 미구현 상태에서는 시세/주문 큐 분리의 이점이 없으므로 단일화한다. 향후 주문 추가 시 `cacheKey`(앱키)별 큐 매핑으로 전환해 같은 앱키는 같은 큐로 직렬화하고 주문/시세를 독립 병렬화하는 방안을 검토한다.
- dev 핫리로드에서 큐 인스턴스가 1개만 존재하는지 기동 로그(`[KIS Queue] ... instanceId=...`)로 확인한다 — 싱글톤이면 id가 매 모듈 평가마다 동일하다.
- **알려진 한계**: 토큰 캐시가 없는 cold-start(프로세스당 사실상 하루 1회)에서는 신규 토큰 발급 직후 첫 1~2회 호출이 `EGW00201`로 트립한 뒤 자동 복구될 수 있다. warm 상태(토큰 캐시 보유)에서는 관측되지 않는다.

---

## 7. 연관 종목 모델 (Phase 31)

`/api/stocks/[symbol]/related` → `pipeline/related-stocks.generateRelatedStocks(symbol)`

### 선정 방식 (결정론적, API 호출 없음)

| 단계 | 신호 | 출처 |
|------|------|------|
| 1. 섹터 동종 | `SECTOR_UNIVERSE[sectorId].memberSymbols` | 정적/DB 섹터 |
| 2. 메타데이터 peer | `stock_master` / `STOCK_UNIVERSE.sector` | canonical sector 보조 |
| 3. 이슈 공동 언급 | `IssueCluster.relatedSymbols` | DB 캐시 / 소스 제목 추출 |
| 4. 공시 연결 | 공동 언급 source가 Open DART인 경우 | 공시 기반 |

- 연관 종목 카드는 heavy quote fanout을 하지 않는다. 공유 live store에 현재가가 있으면 표시하고, 없으면 `불러오는 중...` 또는 `최신가 없음` 상태를 표시한다.

### RelatedStock 필드

| 필드 | 설명 |
|------|------|
| `relationType` | `sector_peer` / `issue_mention` / `supply_chain` / `disclosure_linked` / `peer` / `ai_inferred` |
| `relationReason` | 인간이 읽을 수 있는 선정 이유 |
| `basisSourceCount` | 이슈 연관 시 관련 소스 수 |
| `quoteMode` | 항상 `live-sync` (클라이언트 SSE 스트림 사용) |

### 보장
- 개별 종목별 라이브 가격 fetch 없음
- KIS API 팬아웃 없음
- 레이트리밋 쿨다운 영향 없음

## 7.5. 종목 오염 차단 (Phase 31)

- `normalizeSources()`는 회사명과 alias를 함께 보며, `LIG넥스원` 같은 legacy/실사용 명칭을 허용한다.
- `entity-guard.ts`가 AI 생성 직전에 source와 cluster를 다시 검증한다.
- fallback snapshot 또는 `basis_source_ids` 2건 미만 snapshot은 재사용하지 않는다.
- 리포트 상태는 실시간 여부가 아니라 근거 수에 따라 `근거 충분 / 근거 보통 / 근거 부족 / 최신 데이터 없음`으로 낮춘다.
- 타 섹터 키워드만 있고 대상 종목 언급이 없는 cluster는 상세 이슈/요약 입력에서 제외한다.

---

## 8. 테마 시스템 (Phase 28 수정)

- **라이브러리**: `next-themes` v0.4.6
- **전략**: `attribute="class"` (Tailwind `dark:` 클래스 기반)
- **기본값**: `defaultTheme="system"` (OS 설정 따름)
- **모드**: light / dark / system (헤더의 명시적 segmented appearance control)
- **지속성**: next-themes가 `localStorage`에 자동 저장
- **적용 위치**: `layout.tsx`의 `ThemeProvider` — 모든 페이지에 자동 적용
- **전역 표면**: `body`와 page root가 `bg-background text-foreground` 토큰을 소비
- **핵심 설정**: `globals.css`에 light/dark token set과 `@custom-variant dark (&:where(.dark, .dark *));` 추가 필수
  - Tailwind v4는 dark: 유틸리티를 기본적으로 미디어 쿼리에 바인딩
  - `.dark` class와 token contract가 함께 있어야 전체 앱 표면이 일관되게 바뀜
- 자세한 규칙은 `docs/core/theme-behavior.md` 참조

## 8.5. 섹터 라우팅 정합성 (Phase 28 수정)

- **진실의 원천**: `src/data/sectors/taxonomy.ts`의 `SECTOR_UNIVERSE` (12개 섹터)
- **유효 ID 목록**: `sec-semiconductor`, `sec-battery`, `sec-biotech`, `sec-platform`, `sec-finance`, `sec-entertainment`, `sec-auto`, `sec-defense`, `sec-ai-infra`, `sec-obesity-bio`, `sec-robotics`, `sec-advanced-materials`
- **Canonical helpers**: `SectorId`, `isSectorId`, `resolveSectorId`, `getSectorById`
- **홈 AI 출력 정규화**: `home-intelligence-normalizer.ts`가 `sectorId/id/name/alias`를 canonical ID로 매핑하고, 유효하지 않은 섹터를 제거
- **홈 schema**: `trendingSectors[] = { sectorId, name, whyNow, representativeSymbols, sourceCount, trendStrength, basisSourceIds? }`
- **라우팅 규칙**: UI는 display name으로 slug를 만들지 않고 canonical `sectorId`만 `/sectors/[sectorId]`에 사용

## 8.6. 소스 날짜 의미론 (Phase 27 수정)

| 필드 | 의미 | UI 표시 |
|------|------|---------|
| `generatedAt` | 원본 날짜 (공시 접수일 rcept_dt / 뉴스 발행일) | ✅ "공시일" / "발행일" 레이블로 표시 |
| `collectedAt` | Stockker API 수집 시각 (항상 현재에 가까움) | ❌ UI 표시 안 함 |

---

## 9. 가드레일 & 비기능 정책

| 정책 | 적용 위치 | 설명 |
|---|---|---|
| 인트라데이 숨김 | `chartMode` preference | 당일 분봉 차트 비활성화 |
| 단일 fetch 홈 | `HomeIntelligenceProvider` | 카드별 개별 fetch 금지 |
| 명시적 저장 전용 | `LocalStorageAdapter` | 자동 저장 없음 (recentViewed 제외) |
| 상세 진입 속도 제한 | `model-router.ts` | 종목 상세 시 외부 API 직접 호출 금지, 스냅샷 우선 |
| 추천 disclaimer | 모든 추천 컴포넌트 | 면책 조항 필수 노출 |
| 지시적 언어 차단 | `evaluator.ts` | "매수 추천", "사야" 등 자동 필터 |

---

## 10. Ops 모니터링

- `GET /api/ops/metrics` — DB 스냅샷 수, 소스 품질, 24시간 큐레이션 현황
- `GET /api/health` — 서비스 헬스 체크
- `npm run test:evals` — AI 출력물 평가 자동화 테스트
