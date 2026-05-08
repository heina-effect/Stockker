# Phase 22 Report — Multi-Source News Expansion, Supabase Persistence, and Curated Research Delivery

## 1. 개요
Phase 22에서는 Stockker의 리서치 데이터 신뢰성과 다양성을 극대화하기 위해 다중 뉴스 소스를 연동하고, 이를 수집-정제-영속화하여 재사용하는 고도화 파이프라인을 완성했습니다. 

## 2. 주요 구현 사항

### A. 다중 뉴스 소스 (Multi-Source Providers) 연동
- **GNewsProvider (`gnews-provider.ts`)**: 주요 검색 API를 사용하여 기업 관련 뉴스를 가져오도록 구현했습니다.
- **NewsApiProvider (`newsapi-provider.ts`)**: 보조 뉴스 소스로서 다양한 매체의 기사를 통합했습니다.
- **통합 파이프라인**: 기존 KIS, Open DART와 함께 총 4개의 Source를 병렬 호출(`Promise.all`)하여 하나의 통일된 `SourceItem` 타입으로 정규화(`collectRawSources`)했습니다.

### B. Supabase 데이터베이스 적재 (Persistence)
- 가져온 모든 Raw 뉴스는 `news_sources` 테이블에 즉시 Upsert 됩니다. 
- API Quota Limit, 실패, 타임아웃에 대한 안전망(Fallback)을 적용하여 실패 시에도 다른 소스로부터 데이터 파이프라인이 중단되지 않도록 설계했습니다.

### C. Gemini 임베딩 기반 큐레이션 최적화
- **정제 및 클러스터링**: `embedding-curator.ts`에서 GNews, NewsAPI를 포함한 모든 소스에 대해 Trust Provider Score 가중치를 부여했습니다. 노이즈 및 스팸을 효과적으로 필터링(`qualityLabel != 'rejected'`)합니다.
- **차원 매칭 오류 해결**: 임베딩 API Quota 제한으로 빈 벡터가 반환되는 케이스를 선제적으로 방어하기 위해, 빈 임베딩은 `source_embeddings` 테이블에 Upsert하지 않도록 조치했습니다.

### D. 데이터 재사용 (Curated Research Delivery)
- `getGlobalRecentCuratedSources` 함수를 `VectorStoreAdapter`에 구현하여, 6시간 내 수집된 전역 Curated Source를 추출합니다.
- 추출된 Curated Source는 홈 대시보드의 `aiGenerateHomeIntelligence` 프롬프트에 직접 주입되어, LLM이 실제 최신 뉴스(Source-grounded) 기반으로 추천 및 판단을 내리게 됩니다.
- 개별 종목의 '최근 핵심 이슈'에도 이 과정이 자연스럽게 연동됩니다.

## 3. 유지된 가드레일 및 원칙
- **API Key 숨김 처리**: GNews와 NewsAPI 키는 하드코딩하지 않고 환경 변수(`.env.local`)를 통해 안전하게 주입받도록 구성했습니다.
- **Metadata-First 렌더링**: 종목 상세 페이지 진입 시 티커, 종목명 등 메타데이터가 Skeleton 없이 즉시 로드되는 UX 원칙을 유지했습니다.
- **Intraday Hidden 정책**: 기존 UI 룰셋(당일 차트 숨김 등)을 위반하지 않고 보존했습니다.

## 4. 결론
이번 페이즈를 통해 Stockker는 단일 KIS 뉴스 의존도를 벗어나, GNews와 NewsAPI를 아우르는 멀티 뉴스 파이프라인을 갖추게 되었습니다. 수집된 Raw 뉴스가 즉시 사용되지 않고 **저장 → 임베딩 큐레이션 → 검증된 데이터 재사용**이라는 구조화된 워크플로우를 통과함으로써, 앱 전체의 신뢰도와 설명 가능성(Explainability)이 대폭 향상되었습니다.
