# Stockker Phase 17 Audit — Source-Grounded AI Hardening

## 1. AI 감성 점수 Fallback 빈도가 높은 이유

### 주요 원인 분류

| 원인 | 유형 | 심각도 |
|---|---|---|
| `news-provider.ts`가 KIS API 실패 시 Mock News("Mock News" provider) 반환 | `source_empty` + `provider_error` | 🔴 심각 |
| `disclosure-provider.ts`가 corp_code 없거나 DART_API_KEY 없으면 Mock 반환 | `source_empty` + `key_missing` | 🔴 심각 |
| 두 소스 모두 Mock일 경우 `isMockSources=true`로 조기 Fallback 실행 | `mock_detected` | 🟡 설계된 Fallback, 올바른 동작 |
| `gemini-3.0-flash` → 404 NOT_FOUND (Phase 16 버그, 이미 롤백됨) | `model_not_found` | 🟢 수정됨 |
| KIS 뉴스 API 응답이 `hts_kor_isnm` 없고 빈 배열 반환 | `source_empty` | 🔴 심각 |

### 근본 문제
- `fetchCompanyNews()` 실패 시 `getDeterministicFallback()`이 즉시 반환됨 → 전체 파이프라인에 Mock 오염
- `getDisclosures()` 는 corp_code 없으면 Mock 반환 → `STOCK_UNIVERSE`에 없는 종목은 항상 Mock
- 실제 KIS 뉴스가 있어도 `item.hts_kor_isnm`가 빈 값이면 "제목 없음"으로 필터링되어 품질 저하

## 2. Mock 데이터 누수(Leakage) 현황

| 경로 | 위치 | 누수 여부 |
|---|---|---|
| `summarize.ts` | `mockReportSummary(symbol)` 직접 반환 | ❌ **항상 Mock 반환** |
| `news-provider.ts` | KIS 실패 시 Mock News 반환 | ❌ 파이프라인에 Mock 오염 |
| `disclosure-provider.ts` | corp_code 없으면 Mock 반환 | ❌ 파이프라인에 Mock 오염 |
| `mockReportSummary` 내용 | `"반도체 수급 개선 및 HBM3 수주 기대..."` (반도체 고정 텍스트) | ❌ **현대차 조회 시 반도체 내용 표시** |
| `mockSentiment` | `"HBM 양산 본궤도..."` (반도체 고정) | ❌ **모든 종목에 반도체 감성 표시** |
| `mockIssues` | 클러스터에 `source.id = "issue-1"` (fallback 미포함) | 🟡 탐지 어려움 |

### 가장 심각한 문제
`summarize.ts`가 항상 `mockReportSummary(symbol)`을 반환하므로, 현대차(005380) 보고서에 삼성전자/반도체 내용이 그대로 출력됨.

## 3. 현대차 요약에 반도체 내용이 나오는 이유

```
// mock-data.ts:27
aiHeadline: "반도체 수급 개선 및 HBM3 수주 기대로 단기 모멘텀 유지"
aiSummary:  "최근 글로벌 파운드리 수요 회복과 AI 가속기 탑재 메모리 공급 부족..."
```

이 고정 텍스트가 symbol 상관없이 반환됨. 엔티티 일관성 검증 없음.

## 4. basisSourceIds 실제 동작 여부

- `aiAnalyzeSentiment()` 에서 AI 응답의 `basisSourceIds`로 원본 소스를 필터링하는 로직이 있음 ✅
- 그러나 input이 Mock인 경우 basisSources도 Mock basisSources가 됨 ❌
- `IssueCluster.basisSourceIds` 필드가 **타입 정의에 없음** ❌ → 구조적으로 source-tracing 불가

## 5. 핵심 이슈가 뉴스보다 공시(Disclosure)를 더 많이 보여주는 이유

- `normalizeSources()`는 뉴스+공시를 `generatedAt` 기준으로 정렬함
- KIS 뉴스 실패 시 Mock News 2개, DART 공시 실패 시 Mock Disclosure 2개가 합쳐짐
- 실제 뉴스 API 성공 시에도 limit=10이라 최대 10개, 공시는 최대 5개
- `rankAndCluster()`에서 상위 5개만 취하므로 뉴스가 더 많으면 뉴스가 우선됨 (이는 올바름)
- 문제: KIS 뉴스 빈 배열 반환 → Mock 2개 + 공시 최대 5개 → 공시가 우세

## 6. 소스 페이지네이션 현황

- `/api/stocks/[symbol]/issues` 엔드포인트가 `{ clusters, sources }` 전체 배열을 한 번에 반환 ❌
- `?page`, `?limit`, `?cursor` 파라미터 없음
- 프론트엔드 `IssueTimelineCard`가 전체 클러스터를 스크롤로 렌더링 (긴 목록 시 성능 문제 가능)

## 7. 홈 인텔리전스 단일 엔드포인트 확인

- `/api/home/intelligence` 단일 엔드포인트 사용 중 ✅
- `HomeIntelligenceProvider`가 한 번만 fetch ✅
- 서버단 in-flight dedupe 적용 ✅

## 8. 최근 검색 Focus 정책 확인

- `search-hero-card.tsx`에서 `onFocus`로 열기, `blur/ESC/선택`으로 닫기 구현됨 ✅
- 자동 열림 없음 ✅

## 9. Intraday 차트 Hidden 정책 확인

- `daily-candlestick-chart-card.tsx` 에서 일봉 차트만 표시 ✅
- 분봉 차트 컴포넌트는 파일에 존재하나 렌더링 경로에서 제외됨 ✅

## Phase 17 Action Items (우선순위 순)

1. **[P0] 반도체 하드코딩 Mock 텍스트 제거** — 종목별 실제 이름을 사용하는 구조적 Mock으로 교체
2. **[P0] `summarize.ts` Mock 고착 제거** — `aiSummarizeIssues()` 실제 호출
3. **[P0] `IssueCluster` 타입에 `basisSourceIds` 추가** — Source tracing 확보
4. **[P1] 뉴스/공시 Fallback 마킹 강화** — `_isMock: true` 플래그로 파이프라인 오염 방지
5. **[P1] 소스 페이지네이션 API 구현** — `?page&limit` 방식
6. **[P1] Source 관련성 필터링** — 심볼명/회사명이 title에 없는 소스 제거
7. **[P2] `mockSentiment`를 종목 이름 기반 동적 내용으로 개선** — 엔티티 일관성
8. **[P2] Home intelligence 품질 개선** — 데이터 유효성 검사 추가
