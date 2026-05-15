# Stockker Phase 13 Report: 리서치 고도화 및 UI/UX 폴리싱 완료

## 1. 개요
Phase 13의 목표인 종목 확장성 향상, 실제 데이터 소스(뉴스/공시) 연동 검증, AI 이슈와 출처의 구조적 분리, 검색 및 평단가 UI/UX 개선을 성공적으로 완료하였습니다.

## 2. 주요 작업 내용

### 2.1 Corp-Code 매핑 자동화 및 확장성
- **DART XML 파싱 자동화**: 기존 하드코딩된 종목 딕셔너리 의존성을 제거하고, `CORPCODE.xml` 전체를 순회하여 유효한 6자리 `stock_code`를 가진 약 3,900여 개 상장사의 매핑을 추출(`parse_xml.py`).
- **Corp Master 연동**: 생성된 `src/data/dart/corp-master.json` 파일을 `disclosure-provider.ts`에서 활용하여, KOSPI/KOSDAQ 전체 종목에 대한 공시 데이터 조회 지원.

### 2.2 뉴스 및 공시 파이프라인 정규화
- **실제 소스 연결**: KIS API(`getDomesticStockNews`)를 `news-provider.ts`로 캡슐화하여 뉴스 파이프라인 정규화.
- **SourceItem 및 IssueCluster 분리**: `IssueItem` 모델 하나로 묶여있던 데이터를, 원본 데이터 형태인 `SourceItem`과 AI 요약 형태인 `IssueCluster` 두 가지 모델로 명확히 분리.
- **파이프라인 단계 분리**: `collect.ts` -> `normalize.ts` (중복 제거 및 최신순 정렬) -> `rank.ts` (AI 클러스터 변환) 과정을 거쳐 `/api/stocks/[symbol]/issues`가 `clusters`와 `sources` 객체를 각각 반환.
- **UI 연동**: 핵심 이슈 카드(`issue-timeline-card.tsx`)는 `clusters`를, 분석 출처 데이터(`source-list-card.tsx`)는 `sources`를 시각화하여 사용자가 AI 결과의 근거를 직접 확인할 수 있도록 함.

### 2.3 Search UX 고도화
- **최근 검색 포커스 기반 제어**: `SearchHeroCard`에서 검색창이 `Focus` 상태일 때만 최근 검색어가 나타나도록 `isFocused` 상태 제어 로직을 추가.
- 이를 통해 홈 화면 첫 진입 시 불필요하게 드롭다운이 렌더링되어 시야를 가리는 현상 제거.

### 2.4 평단가 대응 가이드 모바일 레이아웃 및 안정성 향상
- **UI 반응형 폴리싱**: 평단가 입력 폼의 레이아웃을 `absolute`에서 Flex 구조의 `%` 및 모바일 분기(`flex-col sm:flex-row`)로 수정하여 좁은 화면에서도 레이아웃 깨짐이 발생하지 않도록 함.
- **단위 재배치**: "원" 표기가 input 박스 안쪽에 자연스럽게 고정되도록 `pr-10`과 `right-4` 속성 활용.
- **순수 함수 분리 및 회귀 테스트**: 평단가와 현재가 간의 수익률 계산 로직을 `buy-plan-utils.ts`의 `calculateProfitLossRate`로 분리.
- **Vitest**: 사용자 요구사항이었던 "현재가 226,750 / 평단가 50,000 -> 353.5% 검증" 케이스를 포함하여 Vitest 회귀 테스트 작성(`buy-price-plan.test.ts`).

### 2.5 Intraday Hidden
- intraday 차트는 오픈되지 않은 Hidden 상태를 지속적으로 유지함(`daily-candlestick-chart-card.tsx`).

## 3. 결론 및 향후 과제
- 리서치 데이터와 UI가 완전한 실시간/실제 데이터 구조로 재편되었으며, 테스트를 통해 계산의 무결성을 확보했습니다.
- 향후 Phase 14에서는 LLM 프롬프팅 최적화와 함께, 모의투자 또는 관심종목 관리(Watchlist) 기능을 강화할 수 있는 기반이 마련되었습니다.
