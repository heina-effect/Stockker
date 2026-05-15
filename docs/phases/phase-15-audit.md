# Stockker Phase 15 Audit

## 현재 상태 분석 (Audit)

### 1. 검색 메타데이터 및 `SearchHeroCard`
- **현상**: `SearchHeroCard`에서 API `/api/stocks/search`를 호출하여 검색을 처리하고 있습니다. 이 API는 `src/server/research/model-router.ts`의 `generateSearch`를 호출합니다.
- **generateSearch의 구조**: 
  - 1순위: `SECTOR_UNIVERSE` 검색
  - 2순위: `corp-master.json` 검색 (여기서 `fs.readFileSync`를 직접 사용하여 매번 파일을 읽고 있거나 메모리에 캐싱하고 있습니다)
  - 3순위: `STOCK_UNIVERSE` fallback
- **문제점**: 
  - `corp-master.json`에는 공식 법인명만 존재하고, Alias(예: 현대중공업 -> HD현대중공업)나 Legacy Name 매핑이 불가능합니다.
  - 검색 결과의 Source of Truth가 `STOCK_UNIVERSE`와 `corp-master.json`으로 나뉘어 있고 일원화되어 있지 않습니다.
  - `getStockName` 함수가 `STOCK_UNIVERSE`만 참조하므로, `corp-master.json`에서 찾은 종목(3,900여 개)의 이름을 상세 페이지, 추천 카드, 최근 검색에서 제대로 표시하지 못하고 티커(symbol)를 그대로 노출합니다.

### 2. AI Model Orchestration
- **현상**: `model-router.ts`의 `generateIssues`, `generateSentiment`, `generateBuyPlan`, `generateRelatedStocks` 등 주요 AI 서피스 기능들이 아직 `mock-data.ts`의 더미 데이터를 반환하고 있습니다. (단, `generateIssues`는 pipeline을 통해 `rankAndCluster`까지는 실행하나, 실제 LLM 요약을 붙이지는 않은 상태로 보임).
- **문제점**: 
  - OpenAI 및 Gemini 키를 연동한 실제 프롬프트 처리가 없습니다.
  - 감성 점수 카드, 홈 화면의 핵심 이슈, 주목 종목, AI 포착 후보 등이 모두 Mock 데이터 기반입니다.
  - AI 서피스와 원문 출처(DART/뉴스) 연결이 Mock으로 되어 있습니다.

### 3. 추천 레이어의 안전망
- **현상**: 비보장/자기책임 고지가 Mock Data 수준에서만 구현되어 있습니다.

### 4. SearchHeroCard 회귀
- **현상**: `search-hero-card.test.tsx`가 Phase 14에서 도입되어 포커스 로직을 검증 중이지만, 새 검색 구조(전종목/Alias) 도입 시 깨질 수 있는지 확인이 필요합니다.

### 5. Intraday Chart Hidden
- **현상**: 당일 차트는 hidden 상태입니다.

---

## Phase 15 해결 과제

1. **검색 Source of Truth 일원화 및 Alias 지원**:
   - `search-master.json` 혹은 메모리 상의 `StockMaster` 인덱스를 구축하여 `corp-master.json` + `STOCK_UNIVERSE` + `Alias Table`(예: "현대중공업" -> "HD현대중공업", "329180" -> "HD현대중공업") 통합.
   - `getStockName`을 이 통합 인덱스 기반으로 동작하게 하여, 앱 전역에서 3,900여 개 상장사 이름이 정확히 렌더링되게 개선.

2. **AI 프로덕션 연동**:
   - Gemini/OpenAI API 호출 유틸리티 작성 (`src/server/ai/` 등).
   - `summarize.ts`, `sentiment.ts`, `home-intelligence.ts` 등에서 실제 LLM을 호출하여 JSON 형태의 리포트/스코어 반환 로직 구현.
   - 실패 시 Fallback 전략 적용.

3. **기존 UX 룰 유지**:
   - AI 요약과 Source(원문) 분리 (설명 가능성 확보).
   - 추천 후보 명칭 유지 및 법적/리스크 고지 명시.
   - `SearchHeroCard`의 UX Focus 룰 유지.
