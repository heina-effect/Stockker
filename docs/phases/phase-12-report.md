# Phase 12 Report: 실데이터 기반 AI 파이프라인 및 영속성 레이어 완성

## 1. 개요
Stockker의 AI 리서치 신뢰도를 극대화하기 위해 실제 KIS 뉴스와 Open DART 공시 데이터를 하나의 파이프라인으로 통합했으며, 사용자 경험 향상을 위한 로컬 우선(Local-First) 영속성 기반을 완성했습니다.

## 2. 주요 구현 내용

### 2.1. Open DART API 실연동
- `corp-code-map.json` 정적 매핑을 통해 티커별 DART 고유번호를 식별합니다.
- `disclosure-provider.ts`에서 실제 `opendart.fss.or.kr` API를 호출하며, API 에러나 제한 시 안전하게 결정론적 Fallback으로 대체됩니다.

### 2.2. 리서치 파이프라인 모듈화
- `model-router.ts`의 역할을 분산하여 `pipeline` 디렉토리에 `collect.ts`, `normalize.ts`, `rank.ts`를 신설했습니다.
- 뉴스(KIS)와 공시(DART)가 하나의 `IssueItem` 배열로 정규화 및 병합(Merge)되며, 최신순 정렬(Rank)을 통해 상위 이슈가 리포트로 노출됩니다.

### 2.3. 정보 출처/관련 종목 카드 고도화
- `SourceListCard`: 수집 시각, 출처 구분(뉴스/공시), 원문 링크를 상세히 노출합니다.
- `RelatedStocksCard`: 연관 사유, 실시간 가격 동기화 여부 및 데이터의 신선도(Freshness)를 보여줍니다.

### 2.4. 사용자 로컬 스토리지 (User Persistence)
- `local-adapter.ts` 스키마를 확장하여 관심종목, 최근 검색어, 최근 본 종목, 북마크, 평균 매수단가, 테마를 종합 관리합니다.
- 홈 화면의 `WatchlistAsideCard` 및 `SearchHeroCard`가 실제 저장된 관심종목/검색어에 기반하여 동작하도록 개선했습니다.
- 저장은 사용자의 명시적 액션(ex: "가이드 받기" 후 "이 평단가 저장")에만 의존합니다.

## 3. 안정성 유지 (Regression Guard)
- Phase 11에서 적용된 Rate Limit (EGW00201) 방지 캐싱을 그대로 보존했습니다.
- 당일 차트(`intraday`)는 여전히 Hidden 상태로 유지되며, 렌더링 부하를 일으키지 않습니다.
