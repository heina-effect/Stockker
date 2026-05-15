# Phase 23 진단 보고서 — 문서와 실제 런타임의 정합성 검토

## 1. 문서와 실제 런타임 간의 괴리 (Docs vs Runtime Reconciliation)

### 오래된 문서 (Stale Documents)
- **`docs/core/architecture.md`**: 매우 낡은 상태입니다. 여전히 "Phase 12"라고 명시되어 있으며, "OpenAI GPT-5.4-mini"나 "GPT-5.5"와 같은 실존하지 않거나 사용하지 않는 모델을 언급하고 있습니다. 현재 우리는 전적으로 Gemini 3.1 Pro / Flash / Flash-Lite 패밀리를 사용하고 있습니다. 또한 데이터 파이프라인이 KIS와 Open DART로만 제한되어 있다고 설명하고 있어, 새롭게 추가된 다중 소스(GNews, NewsAPI)와 Supabase pgvector 연동 내용이 누락되어 있습니다.
- **`docs/core/research-api-contract.md`**: 낡은 상태입니다. `SourceItem` 대신 과거의 `IssueItem`을 참조하고 있으며, `fetchGNews`나 `fetchNewsApi`의 존재를 반영하지 않은 채 `getDomesticStockNews` 및 `getDisclosures`만 언급하고 있습니다.
- **`docs/core/vector-store-design.md`**: 대부분 정확하지만 Phase 19 기준에 머물러 있습니다. 홈 화면 인텔리전스에서 전역 큐레이션 소스(Global Curated Sources)를 활용하는 현재 방식을 반영하여 업데이트가 필요합니다.

### 실제 런타임 현황 (Phase 22 기준)
- `collectRawSources`를 통해 작동하는 견고한 4개 소스 파이프라인(KIS, Open DART, GNews, NewsAPI)을 갖추고 있습니다.
- 이러한 원시 소스들과 그 임베딩 데이터를 Supabase pgvector(`news_sources`, `source_embeddings`)에 영속적으로 저장합니다.
- AI 오케스트레이터는 전적으로 Gemini 패밀리(Flash/Flash-Lite)에 의존합니다.
- `stock_research_snapshots` 및 `sector_research_snapshots`가 구현되어 있지만, 일부 엔드포인트에서는 여전히 DB를 충분히 활용하지 않고 요청 시점에 AI 생성을 반복하는 경향이 있습니다.

## 2. 진단 질문에 대한 답변

### 어떤 기능이 실제로 구현되어 있고 어떤 것이 문서상으로만 존재하는가?
- **실제 구현됨**: 다중 소스 파이프라인, Supabase 영속성 및 임베딩 큐레이션.
- **부분적/개선 필요**: 스냅샷 영속성은 존재하지만, 이를 재사용하려는 노력이 부족합니다(자주 DB를 우회하거나 불필요하게 공격적으로 재생성함).
- **개선 필요**: 로컬 스토리지 기반의 사용자 저장 상태는 구현되어 있으나, 이를 사용자 중심의 실제 리서치 워크플로우로 연결하는 기능은 미비합니다.

### 여전히 요청 시점에 요약/감성을 생성하는 부분은 어디인가?
- **종목 감성 분석 (`/api/stocks/[symbol]/sentiment`)**: 스냅샷 데이터를 우선적으로 반환하기보다 매번 재생성하는 경우가 많습니다.
- **매수 가격 계획 (`BuyPricePlanCard`)**: 요청 시점에 생성됩니다.
- **홈 화면 인텔리전스 (`/api/home/intelligence`)**: 일부 최근 소스를 사용하긴 하지만, 미리 계산된 클러스터/섹터 스냅샷을 활용하기보다 여전히 요청 시점에 Flash-Lite 및 Flash 호출에 크게 의존하고 있습니다.

### 홈 화면의 강점과 약점은 무엇인가?
- **강점**: 일반적인 레이아웃 및 메타데이터 렌더링. 검색 히어로 카드(Search Hero)가 잘 구현되어 있습니다.
- **약점**: "AI 포착 후보" 및 "지금 주목받는 종목/섹터"가 종종 단일 프롬프트 결과물(Blob)로 출력되어 구체적인 근거 데이터 노출이 부족합니다. 카드 상에서 소스와의 연결성 및 최신성(Freshness) 가시성이 다소 모호합니다.

### 섹터 페이지는 실제로 유용한가, 아니면 여전히 피상적인가?
- **피상적임**: 현재 `/sectors/[sectorId]`가 존재하고 스냅샷도 생성되지만 깊이가 부족합니다. 일반적인 트렌드 강도와 기본적인 이슈 요약만 제공할 뿐, 실제 "주도주/소외주(Leaders/Laggards)" 추적, 심층 이슈 밀도 타임라인, 섹터별 연관 소스 묶음 등의 깊이 있는 정보가 부족합니다.

### 존재하지만 아직 워크플로우로 전환되지 않은 저장 상태는 무엇인가?
- `local-adapter.ts`에는 `watchlist`, `recentSearches`, `recentViewed`, `buyPrices`, `bookmarkedReports`가 존재합니다.
- **전환되지 않음**: 통합된 "관심 종목 리서치 모아보기" 대시보드나 상세한 "최근 본 종목 히스토리" 뷰 등 사용자의 저장 데이터를 기반으로 한 연속적인 리서치 경로가 마련되어 있지 않습니다.

### 현재의 다중 소스 스택과 모순되는 낡은 문서는 무엇인가?
- `docs/core/architecture.md`와 `docs/core/research-api-contract.md`가 현재의 4개 소스 스택 및 Gemini 전용 AI 아키텍처와 모순됩니다.
