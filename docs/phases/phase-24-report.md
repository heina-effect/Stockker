# Phase 24 Report — Trust, Evaluation, and Daily Workflow

## 1. 개요
Phase 24에서는 단순한 정보의 나열을 넘어, AI 리서치 결과물에 대한 기계적인 **평가(Evaluation)**와 사용자 경험을 일상적인 **워크플로우(Daily Workflows)**로 전환하는 데 중점을 두었습니다. 이를 통해 "신뢰할 수 있고(Trustworthy), 설명 가능하며(Explainable), 매일 유용한(Useful)" 리서치 프로덕트로서의 Stockker를 완성했습니다.

## 2. 주요 구현 사항 및 개선점

### A. AI 신뢰도 및 평가 레이어 도입 (Trust & Evaluation Layer)
- **공식 평가 정책 수립**: `docs/core/evaluation-policy.md`를 작성하여 AI 생성물에 대한 5가지 핵심 검증 차원(Grounding, Relevance, Recency, Sufficiency, Hallucination Risk)을 정의했습니다.
- **기계적 평가 스크립트 추가**: `src/server/research/evals/evaluator.ts`에 평가 로직을 구현하고, `npm run test:evals`로 자동화된 테스트를 추가하여, 면책 조항 누락, 지시적 표현(매수 추천 등), 출처 부족 등의 위험 요소가 있는 생성물이 걸러지도록 장치를 마련했습니다.

### B. 스냅샷 재사용 대폭 확장 (Snapshot Reuse Expansion)
- **Stale-while-revalidate 전략 도입**: `src/server/research/model-router.ts`의 스냅샷 조회 로직을 고도화하여, 기존 스냅샷이 TTL을 초과했더라도 즉시 화면에 `stale` 상태로 표시한 후, 백그라운드에서 조용히 재생성(Background regeneration)하도록 개선했습니다.
- 이를 통해 실시간 조회 시 발생하는 병목과 AI API Quota Exceeded 에러 빈도를 획기적으로 낮췄습니다.

### C. 홈 화면 퀄리티 및 설명력 고도화 (Home Quality Refinement)
- **지금 주목받는 종목 / 섹터**: 단순 나열에 그치던 카드를 개선하여, 각 카드에 "관련 출처 N건 기반", "주도주 표시(섹터)", 그리고 명시적인 **투자 위험/면책 고지(Risk Note)** 문구를 하단에 추가했습니다.
- 사용자에게 정보의 근거를 시각적으로 노출함으로써 맹목적인 신뢰를 지양하고 툴로서의 안정감을 제공합니다.

### D. 섹터 상세 화면 심층화 (Sector Research Deepening)
- `/sectors/[sectorId]/page.tsx` 페이지를 피상적인 AI 한 줄 요약에서 벗어나, **주도주(Leaders)**, **소외주(Laggards)**, 그리고 **섹터 내 관찰 후보(Watch Candidates)**를 구체적인 사유와 함께 렌더링하도록 개선했습니다.
- 데이터베이스 마이그레이션(`002_research_snapshots.sql`)과 스냅샷 매니저에 해당 필드를 추가하여, 섹터 리서치의 실질적 깊이를 더했습니다.

### E. 저장된 사용자 상태 기반 일일 워크플로우 (Saved Daily Workflows)
- 로컬 스토리지에 방치되던 `recentViewed` 및 `bookmarkedReports`를 활용하여 다음과 같은 전용 워크플로우 페이지를 신규 구축했습니다.
  - **최근 본 종목 히스토리 (`/workflows/recent`)**: 이전에 조회한 종목들의 최신 AI 요약과 감성(Bullish/Bearish) 점수를 대시보드 형태로 리마인드합니다.
  - **북마크 리포트 읽기 (`/workflows/bookmarks`)**: 관심 있는 리포트를 별도 모아두어 나중에(read-it-later) 심층 분석할 수 있는 보드를 제공합니다.

### F. 내부 품질 모니터링 강화 (Ops Visibility)
- `/api/ops/metrics/route.ts` 엔드포인트에 `sector_research_snapshots`의 총 스냅샷 수를 추가하여, 내부적으로 데이터베이스 재사용 현황을 명확히 추적할 수 있도록 보완했습니다.

## 3. 결론
이번 Phase 24를 통해 Stockker는 단순 AI 요약기 수준을 벗어나, 데이터 검증이 동반되고, 응답성이 보장되며(Stale-while-revalidate), 사용자의 흐름이 연속적인(Recent/Bookmarks/Watchlist) 종합 리서치 워크스페이스로 성장했습니다.
모든 구현은 "명시적 저장 전용(Explicit save-only)", "AI/원본 분리" 등 핵심 비기능적 가드레일을 철저히 지키며 안전하게 통합되었습니다.
