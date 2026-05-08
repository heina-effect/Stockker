# Phase 23 Audit — Reality Check vs Documentation

## 1. Docs vs Runtime Reconciliation

### Stale Documents
- **`docs/architecture.md`**: Very stale. Still explicitly calls out "Phase 12", mentions "OpenAI GPT-5.4-mini" and "GPT-5.5", which is completely fabricated/old. We are strictly using Gemini 3.1 Pro / Flash / Flash-Lite. It also incorrectly limits the data pipeline to KIS and Open DART, completely ignoring the new multi-source setup (GNews, NewsAPI) and Supabase pgvector.
- **`docs/research-api-contract.md`**: Stale. Refers to `IssueItem` instead of `SourceItem` and still mentions `getDomesticStockNews` + `getDisclosures` without acknowledging `fetchGNews` or `fetchNewsApi`.
- **`docs/vector-store-design.md`**: Slightly stale, mostly correct but refers to Phase 19. Needs update to reflect that global curated sources are now used for Home Intelligence.

### Actual Runtime Reality (Phase 22 Baseline)
- We have a robust 4-source pipeline (KIS, Open DART, GNews, NewsAPI) working via `collectRawSources`.
- We persist these raw sources and their embeddings to Supabase pgvector (`news_sources`, `source_embeddings`).
- AI orchestrator relies solely on the Gemini family (Flash/Flash-Lite).
- `stock_research_snapshots` and `sector_research_snapshots` are implemented but we still see many request-time AI generations in certain endpoints that could leverage the DB more heavily.

## 2. Answers to Audit Questions

### Which features are truly implemented in runtime versus only documented?
- Multi-source pipeline is truly implemented.
- Supabase persistence and embedding curation are truly implemented.
- Snapshot persistence exists, but reuse of these snapshots is not as aggressive as it should be (often bypassing DB or regenerating too aggressively).
- Saved states (local storage) are implemented but aren't being fully leveraged for user-centric workflows.

### Which parts still generate summaries/sentiment at request time?
- Stock sentiment (`/api/stocks/[symbol]/sentiment`) still often regenerates rather than aggressively returning snapshot data.
- Buy price plan (`BuyPricePlanCard`) generates on request.
- Home Intelligence (`/api/home/intelligence`) uses some recent sources but still heavily relies on request-time Flash-Lite & Flash calls rather than entirely leveraging pre-computed cluster/sector snapshots.

### Which Home surfaces are strong and which remain weak?
- **Strong**: General layout and metadata rendering. Search hero is good.
- **Weak**: "AI 포착 후보" (AI Picks) and "지금 주목받는 종목/섹터" are often generic "single prompt blob" outputs. They lack deep source-grounding visibility directly on the card. Freshness visibility is sometimes vague.

### Are sector pages truly useful or still shallow?
- **Shallow**: Currently, `/sectors/[sectorId]` exists and has snapshots, but the depth is lacking. It provides a generic trend strength and basic issue summary, but lacks true "leaders/laggards" tracking, deep issue density timelines, and related source bundles specific to the sector.

### Which saved states exist but are not yet converted into workflows?
- `watchlist`, `recentSearches`, `recentViewed`, `buyPrices`, `bookmarkedReports` exist in `local-adapter.ts`.
- **Not converted**: We don't have a "saved reading path", a unified "관심 종목 리서치 모아보기" (Watchlist Research Dashboard), or a "최근 본 종목 히스토리" detailed view.

### Which docs are stale and contradict the current multi-source stack?
- `docs/architecture.md` and `docs/research-api-contract.md` contradict the 4-source stack and Gemini-only AI architecture.
