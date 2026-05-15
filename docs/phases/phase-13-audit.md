# Phase 13 Audit: 종목 확장성 및 리포트/출처 구조 진단

## 1. 개요
Phase 13 작업을 위한 현재 시스템(Phase 12 완료 상태)의 상태 진단입니다. 주요 목적은 corp-code 매핑 자동화, 실제 뉴스 프로바이더의 정상 동작 검증, 핵심 이슈와 출처의 구조적 분리, 검색 UX 검토입니다.

## 2. 진단 결과

### 2.1 Corp-Code 매핑 (DART)
- **현재 상태**: `parse_xml.py`가 하드코딩된 27개 종목(`universe` 딕셔너리)에 대해서만 정규식으로 `corp_code`를 추출하여 `corp-code-map.json`을 생성.
- **문제점**: 27개 이외의 종목을 검색하면 항상 fallback 데이터만 반환됨. 전체 상장사로 확장 필요.

### 2.2 KIS 뉴스 프로바이더
- **현재 상태**: `src/server/research/pipeline/collect.ts`에서 `getDomesticStockNews` (실제 KIS API)를 호출하여 `rawNews`를 가져오고 있음. 반면 `news-provider.ts`는 Mock 데이터 구조로 방치됨.
- **문제점**: `news-provider.ts`의 역할을 명확히 하여, KIS 뉴스 수집 로직을 여기로 이관하고 fallback 전략을 공식화할 필요.

### 2.3 이슈와 출처의 분리
- **현재 상태**: `IssueItem` 단일 모델이 뉴스와 공시 데이터를 정규화. 리포트 UI에서 "핵심 이슈 타임라인"과 "출처 목록"이 동일한 `IssueItem[]` 데이터를 재활용할 가능성이 큼.
- **문제점**: 이슈(클러스터링된 주요 사건)와 출처(단순한 원본 문서 링크)가 동일시되어 있어, 중복 정보 노출 및 AI 요약의 설명력(Explainability) 약화.

### 2.4 검색 UX (SearchHeroCard)
- **현재 상태**: 홈 화면 진입 시 `query`가 비어있고 최근 검색어(`recentSearches`)가 존재하면, 무조건 드롭다운이 자동으로 열림.
- **문제점**: 사용자의 명시적 상호작용 없이 불필요하게 시야를 가림. Focus 상태에만 연동되도록 UX 수정 필요.

### 2.5 평단가 계산식 및 회귀 테스트
- **현재 상태**: `mockBuyPlan` 내부에서 `((current - targetPrice) / targetPrice) * 100` 로직으로 수익률을 계산.
- **문제점**: 관련된 자동화된 회귀 테스트가 없어 로직 변경 시 안전을 담보하기 어려움.

### 2.6 Intraday Hidden
- **현재 상태**: 안정적으로 유지 중.

## 3. 진행 방향
1. **Corp-Code 자동화**: `parse_xml` 로직을 일반화하여 모든 6자리 `stock_code`를 가진 법인의 `corp_code`를 추출, `src/data/dart/corp-master.json` 등으로 관리.
2. **뉴스/이슈 파이프라인 정리**: KIS 뉴스 호출을 `news-provider.ts`로 캡슐화. 데이터 모델을 `IssueCluster`와 `SourceItem`으로 분리.
3. **UI/UX 폴리싱**: SearchHeroCard Focus 시에만 드롭다운 렌더. 평단가 입력 폼 모바일 레이아웃 정리.
4. **테스트 추가**: Vitest를 통한 계산식/데이터 변환 회귀 테스트 고정.
