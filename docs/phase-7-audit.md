# Phase 7 Reality Audit & Drift Analysis

## 1. 현재 검색 UX 실제 동작 수준
- **상태**: `SearchHeroCard`에서 검색 쿼리를 `/api/stocks/search`로 보내고, 서버에서는 `mock-data.ts`의 정적 배열에서 매칭되는 결과를 필터링하여 반환 중.
- **Drift/문제점**: 
  - 검색 소스가 `mock-data.ts`에 하드코딩 되어 있어 확장이 어려움.
  - 자동완성 UI는 있으나 키보드 네비게이션이 없고 엔터 입력 시 처리 로직이 미흡.
- **대응**: `src/lib/stocks/metadata.ts`의 Universe를 기반으로 하도록 단일화.

## 2. 종목 상세 차트 흐름
- **상태**: Phase 6A에서 도입된 `IntradayPriceBarChartCard`는 1분 버킷 데이터를 이용해 `recharts`의 Bar 컴포넌트로 그리고 있음.
- **Drift/문제점**: 
  - 단순 막대형(Bar) 차트라 시가/고가/저가/종가(OHLC)를 한눈에 식별하기 어려움.
  - Hover 툴팁에 세부 정보가 부족하고, 정수 포맷 미적용 소지가 있음. 이동평균선(MA5, MA20)이 없음.
- **대응**: OHLC 형식을 지원하는 커스텀 형태나 `ComposedChart`를 기반으로 한 캔들스틱 형태 구현 및 MA 라인 오버레이.

## 3. 실시간 연결 (Live Update)와 관련 종목(Related Stocks)
- **상태**: `LiveMarketProvider`는 `selectedSymbol`과 초기 로드 시 `watchlistSymbols` 대상으로만 SSE/Bootstrap을 진행함. AI 연관 종목 카드의 종목들은 여기 포함되지 않음.
- **Drift/문제점**: 
  - 상세페이지 진입 시 추천받은 관련 종목 카드들은 실시간 갱신되지 않고 초기 렌더링된 가격표시.
- **대응**: 관련 종목 목록을 동적으로 `LiveMarketProvider`에 구독 추가하도록 구조 보완. 본 종목과 함께 가격 업데이트 적용.

## 4. AI 모델 및 리서치 파이프라인
- **상태**: 현재 `model-router.ts`는 직접 `mock-data.ts` 응답을 넘기고 있음. 파이프라인 구조(수집 -> 분석 -> 요약)가 없음.
- **대응**: 파이프라인 형태로 구조화하고, 결정론적 Mock을 기반으로 구현하더라도 각 Source 별로 구조를 나눔 (`news-provider`, `sentiment-pipeline` 등).

## 5. Freshness 적용 상태
- **상태**: `FreshnessLabel`이 구성되어 있으나, 리포트 자체의 Freshness는 단순히 `mock-data.ts`에서 넘겨준 값에 고정되어 있음.
- **대응**: 각 데이터의 생성 시점을 반영하여 실시간으로 확장.

본 감사를 토대로 Phase 7의 Search Upgrade, Candlestick 도입, Live Related Stocks 연동을 진행함.
