# Stockker Phase 14 Audit: AI 인텔리전스 확장성 및 현황 진단

## 1. 개요
Phase 14 작업(업종/섹터 탐색, 홈 인텔리전스 서피스, 추천 레이어 도입)을 위한 현재 시스템(Phase 13 완료 시점)의 코드베이스 진단 결과입니다.

## 2. 진단 항목 확인 결과

### 2.1 Full KRX Symbol Search 수준
- **현재 상태**: `corp-master.json`을 통해 약 3,900여 개 종목의 DART 매핑은 완료되었으나, 실제 검색과 기본 정보 조회를 담당하는 `STOCK_UNIVERSE` (`src/lib/stocks/metadata.ts`)는 여전히 27개 하드코딩 종목에 머물러 있습니다.
- **개선 방향**: `metadata.ts`에서 `corp-master.json` 기반 전체 종목 또는 별도의 전체 종목 DB(Full Universe)를 활용하도록 개선해야 합니다.

### 2.2 Sector / Theme Taxonomy 존재 여부
- **현재 상태**: 관련된 데이터 구조나 분류 체계(`src/data/sectors/*`)가 전혀 존재하지 않습니다.
- **개선 방향**: 종목과 1:N으로 연결되는 1급 엔터티로서의 섹터/테마 구조 정의 및 데이터 파일 생성이 필요합니다.

### 2.3 KIS News / Open DART Source Collect
- **현재 상태**: `src/server/research/pipeline/collect.ts`에서 각 Provider(`news-provider.ts`, `disclosure-provider.ts`)를 호출하여 원문 데이터를 잘 수집하고 있습니다. KIS News는 실제 API로 연동되어 있습니다.

### 2.4 IssueCluster / SourceItem 분리 구현도
- **현재 상태**: Phase 13에서 `types/research.ts`에 분리 정의되었으며, `/api/stocks/[symbol]/issues` 라우트에서 `{ clusters, sources }` 형태로 반환하고 UI(`issue-timeline-card`, `source-list-card`)도 완벽히 분리 처리하고 있습니다.

### 2.5 SearchHeroCard의 Focus 기반 Recent-Search 유지 여부
- **현재 상태**: Phase 13에서 `isFocused` 상태 기반으로 드롭다운이 열리도록 조치되었습니다.
- **개선 방향**: 앞으로 이 로직이 깨지지 않도록 회귀 방지 테스트(Regression Test) 작성이 요구됩니다.

### 2.6 AI Sentiment Score UI/API 한계
- **현재 상태**: `SentimentScoreCard` UI와 `SentimentInsight` 타입이 존재하나, "어떤 원문 출처(근거)를 기반으로 점수를 매겼는지"에 대한 연결(Source Traceability)이 없습니다.
- **개선 방향**: AI 요약과 원문 팩트를 분리한다는 원칙에 맞추어 Sentiment 모델도 근거 항목(근거 Source)을 반환하고 표시하도록 확장해야 합니다.

### 2.7 Home Intelligence Surfaces
- **현재 상태**: `page.tsx`에 `CategoryPreviewCard`로 정적인 UI 스텁(Stub)만 배치되어 있습니다. 실시간 핵심 이슈나 주목받는 종목을 보여주는 실제 로직이나 컴포넌트가 없습니다.
- **개선 방향**: 백엔드 라우트(`GET /api/home/...`) 신설 및 라이브 데이터 렌더링 컴포넌트로 교체해야 합니다.

### 2.8 Recommendation Layer
- **현재 상태**: 코드베이스에 관련 엔드포인트(`api/recommendations/*`), 데이터 모델(`RecommendationCandidate` 등), UI 컴포넌트가 전무합니다.
- **개선 방향**: 비보장/자기책임/설명가능성 원칙을 준수하는 "관찰 후보 리스트" 형태의 추천 레이어 신설이 필요합니다.

## 3. 요약 및 추진 방향
현재 Stockker는 단일 종목 리서치 파이프라인(이슈, 출처 분리, 평단가 등)은 안정적이나, **섹터/테마 탐색**, **홈 화면 큐레이션**, **추천 시스템**이라는 확장 레이어가 전혀 없는 상태입니다. Phase 14에서는 모델 라우팅을 체계화하고(Gemini/OpenAI 역할 분담), 전체 시장 단위의 인텔리전스 뷰를 제공하는 데 주력해야 합니다.
