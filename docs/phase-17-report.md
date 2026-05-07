# Stockker Phase 17 Report — Source-Grounded AI Hardening

## 1. 개요
Phase 17은 "AI 품질 개선"이 아닌 **"소스 그라운딩(Source-Grounding) 하드닝"**에 집중한 작업입니다.
AI 호출 자체를 줄이고, 근거 없는 요약을 차단하며, Mock 데이터 누수를 원천 제거했습니다.

---

## 2. 핵심 수정 내역

### 2.1 Mock 데이터 누수 제거 (P0 완료)

**문제**: `mockReportSummary()`와 `mockSentiment()`가 반도체 특화 고정 텍스트를 모든 종목에 반환했음.
현대차(005380) 조회 시 "반도체 수급 개선 및 HBM3..." 문장이 그대로 노출되는 결정적 버그.

**수정 (`mock-data.ts`)**:
- `mockReportSummary(symbol)` → 종목명(`getServerStockName`) 기반 "분석 근거 부족" 안내로 교체
- `mockSentiment(symbol)` → 종목명 기반 중립 점수(50) + `_isFallback: true` 플래그 추가
- Fallback임을 명시적으로 식별할 수 있도록 설계

### 2.2 뉴스/공시 Provider Mock 반환 차단 (P0 완료)

**문제**: KIS API 실패 시 `getDeterministicFallback()`이 Mock News를 반환 → 전체 파이프라인 오염.

**수정 (`news-provider.ts`, `disclosure-provider.ts`)**:
- API 실패 시 빈 배열(`[]`) 반환으로 변경
- Mock 생성 함수를 `getMockNewsForTesting()` / `getMockDisclosuresForTesting()`으로 이름 변경
- `@internal` 주석으로 프로덕션 사용 금지 명시
- 모든 Mock 소스에 `_isMock: true` 플래그 부착

### 2.3 소스 정규화 파이프라인 강화 (P1 완료)

**수정 (`normalize.ts`)**:
- Mock 소스(`_isMock: true`) 자동 필터링 추가
- 30일 신선도 필터 적용 (30일 이전 소스 제거)
- `companyName` 파라미터 추가로 관련성 필터링 지원
- "제목 없음" 소스 필터링
- `model-router.ts`에서 `normalizeSources(rawNews, disclosures, { companyName: name })` 호출로 연결

### 2.4 IssueCluster 타입 확장 (P0 완료)

**수정 (`types/research.ts`)**:
- `basisSourceIds?: string[]` 필드 추가 → 클러스터와 원본 소스의 1:1 트레이싱 가능

**수정 (`rank.ts`)**:
- 각 클러스터에 `basisSourceIds: [s.id]` 적용
- 요약 텍스트를 `"${provider} 발 소식: ${title}"` 형태로 개선 (AI 요약 대신 출처 명시)

### 2.5 소스 페이지네이션 API 신설 (P1 완료)

**신규 엔드포인트**: `GET /api/stocks/[symbol]/sources?page=1&limit=10`

응답 구조:
```json
{
  "ok": true,
  "items": [...],
  "page": 1,
  "limit": 10,
  "total": 23,
  "nextPage": 2,
  "freshness": "live"
}
```

### 2.6 IssueTimelineCard UX 개선 (P2 완료)

- 로딩 중 → 제목 고정 + Skeleton 3개 표시 (레이아웃 점프 방지)
- 빈 데이터 → `Newspaper` 아이콘 + "수집된 이슈가 없습니다" 안내
- 출처 유형 배지 추가: **뉴스(파란색) / 공시(초록색)** 구분 렌더링

### 2.7 SentimentScoreCard Fallback 상태 명시 (P2 완료)

- `_isFallback: true` 데이터 수신 시 → 출처 목록 대신 황색 경고 박스 표시
- 사용자: "충분한 실시간 데이터를 수집하지 못했습니다" 안내
- 개발자: Dev Meta 배지는 그대로 유지

---

## 3. Fallback 빈도 감소 기대 효과

| 이전 | 이후 |
|---|---|
| KIS 실패 → Mock News → Gemini 호출 후 Fallback | KIS 실패 → 빈 배열 → Mock Fallback 즉시 (Gemini 호출 없음) |
| DART 실패 → Mock 공시 → 파이프라인 오염 | DART 실패 → 빈 배열 → 순수 Mock 상태 명시 |
| Mock이 Real로 오인되어 AI가 6740ms 소모 | Mock 즉시 탐지 후 0ms Fallback 전환 |

---

## 4. 남은 과제 (Phase 18+)
- 소스 페이지네이션 프론트엔드 "더 보기" UI 구현
- KIS 뉴스 API 응답 구조 (`hts_kor_isnm`) 추가 검증
- 종목별 섹터 데이터 기반 Sentiment 프롬프트 맥락화
- Home Intelligence 데이터 품질 개선 (실 뉴스 연동)
