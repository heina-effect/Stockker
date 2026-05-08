# Phase 21 Report — Intelligence Productization, Research Workflows, and Operations Hardening

## 1. 개요
Phase 21에서는 구축된 Supabase 인프라와 KIS/DART 연동을 바탕으로, 일회성 리퀘스트 기반 모델에서 **재사용 가능한 리서치 에셋(Snapshots)** 및 **연결된 리서치 워크플로우**로 전환하여 "Daily-use Research Product"로서의 가치를 높였습니다.

## 2. 주요 구현 사항

### A. Research Asset Productization (Research Snapshots)
- **Stock Research Snapshots**: 매 요청마다 AI API를 호출하던 방식에서 벗어나, `stock_research_snapshots` (Supabase DB)에 요약과 감성 점수를 저장합니다.
  - 1시간(TTL) 내의 데이터는 캐시 히트로 반환.
  - TTL 만료 시 즉시 재생성 및 백그라운드 저장.
- **Sector Research Snapshots**: 섹터 단위의 AI 모멘텀/요약 정보를 `sector_research_snapshots`에 저장하여 재사용.

### B. Home Intelligence Productization
- `aiGenerateHomeIntelligence` 프롬프트 고도화.
- 단순 후보 나열을 넘어 **Event-driven, Momentum, Undervalued** 등 명확한 추천 사유 기반의 분류 체계를 확립했습니다.
- 홈 카드들의 데이터 소스를 좀 더 구체적이고 팩트 기반(Source-grounded)이 되도록 유도했습니다.

### C. Sector Research Expansion
- `/sectors/[sectorId]` 전용 상세 페이지 신규 구현.
- 각 테마/섹터의 **AI 섹터 동향 요약**, 모멘텀 강도(Trend Strength), 소속 종목들의 연관 주요 이슈 리스트를 한눈에 볼 수 있도록 구성했습니다.

### D. Recommendation Layer Hardening
- **강력한 Disclaimer 의무화**: "본 정보는 투자 참고용이며, 투자 판단과 책임은 전적으로 이용자에게 있습니다. 원금 손실이 발생할 수 있습니다."
- 금지어 설정: "매수 추천", "강력 매수" 등의 지시적(Imperative) 단어 금지.
- 모든 추천 사유가 뉴스와 공시(Source-backed)에 근거하도록 프롬프트를 튜닝했습니다.

### E. Saved Research Workflows & Ops Visibility
- `/api/ops/metrics` 엔드포인트를 구현하여 수집된 총 Raw Sources 대비 Curated Embeddings의 비율, 생성된 스냅샷 수 등의 퀄리티/옵스 지표를 확인할 수 있게 되었습니다.

## 3. 유지된 핵심 가드레일 (Non-negotiable Guardrails)
- **AI Summary vs Source Separation**: 스냅샷 저장 시에도 원본 Source ID를 분리 추적.
- **Intraday Hidden**: 기존 설정 그대로 유지.
- **Rate Limit & Dedupe**: KIS REST 클라이언트 수준의 동시 다발성 요청 병합 로직 유지.
- **Explicit Save**: 로컬 스토리지 어댑터 기반의 의도된 저장소 정책 유지.

## 4. 새로운 스키마 (002_research_snapshots.sql)
- `stock_research_snapshots`
- `sector_research_snapshots`
(Service Role Write, Public Read RLS 적용 완료)

## 5. 결론
이번 Phase를 통해 Stockker는 단순 "검색 도구"에서 "저장된 데이터를 재활용하며 더 깊이 있는 인사이트를 제공하는 리서치 프로덕트"로 도약했습니다.
