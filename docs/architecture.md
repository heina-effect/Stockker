# Stockker Architecture (Phase 26 — Post-Beta UX Corrections)

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

---

## 6. 프론트엔드 아키텍처

### 홈 화면

```
page.tsx (Server Component)
  └─ HomeIntelligenceProvider (Client, single fetch)
       ├─ TrendIssuesCard   (issues)
       ├─ TrendStocksCard   (stocks)
       ├─ TrendSectorsCard  (sectors)
       └─ AIPicksCard       (aiPicks)
  └─ WatchlistAsideCard (별도 로컬 저장소 읽기)
```

**중요**: 각 카드는 `useHomeIntelligence()` 훅으로 `HomeIntelligenceProvider`의 context를 공유합니다. 카드 내부에서 별도 fetch 금지.

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

### 섹터 상세 (`/sectors/[sectorId]`)

```
page.tsx (Server Component, 즉시 쉘 렌더링)
  └─ 섹터 이름/설명 (SECTOR_UNIVERSE, 동기)
  └─ 대표 종목 목록 (동기)
  └─ SectorAISection (Client Component)
       ├─ snapshot 있으면: AI 요약/이슈/리더/관찰후보 즉시 표시
       └─ snapshot 없으면: "생성 중" → fetch /api/sectors/[sectorId] → 결과 표시
```

**보장**: 캐시 미스에도 SSR이 절대 4–12초 블로킹하지 않음.

---

## 7. 연관 종목 모델 (Phase 26)

`/api/stocks/[symbol]/related` → `pipeline/related-stocks.generateRelatedStocks(symbol)`

### 선정 방식 (결정론적, API 호출 없음)

| 단계 | 신호 | 출처 |
|------|------|------|
| 1. 섹터 동종 | `SECTOR_UNIVERSE[sectorId].memberSymbols` | 정적 데이터 |
| 2. 이슈 공동 언급 | `IssueCluster.relatedSymbols` (DB 캐시) | Supabase pgvector |

### RelatedStock 필드

| 필드 | 설명 |
|------|------|
| `relationType` | `sector_peer` / `issue_mention` / `supply_chain` / `ai_inferred` |
| `relationReason` | 인간이 읽을 수 있는 선정 이유 |
| `basisSourceCount` | 이슈 연관 시 관련 소스 수 |
| `quoteMode` | 항상 `live-sync` (클라이언트 SSE 스트림 사용) |

### 보장
- 개별 종목별 라이브 가격 fetch 없음
- KIS API 팬아웃 없음
- 레이트리밋 쿨다운 영향 없음

---

## 8. 테마 시스템 (Phase 26)

- **라이브러리**: `next-themes` v0.4.6
- **전략**: `attribute="class"` (Tailwind `dark:` 클래스)
- **기본값**: `defaultTheme="system"` (OS 설정 따름)
- **모드**: light / dark / system (3-way 순환 토글)
- **지속성**: next-themes가 `localStorage`에 자동 저장
- **적용 위치**: `layout.tsx`의 `ThemeProvider` — 모든 페이지에 자동 적용

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
