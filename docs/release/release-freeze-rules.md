# Release Freeze Rules — Stockker Beta RC

Phase 32 Beta RC부터 베타 기간 동안 다음 규칙이 적용됩니다.

---

## 1. 동결 항목 (절대 변경 금지)

아래 항목은 베타 기간 중 어떠한 이유로도 변경하지 않습니다.

### 1-1. 인트라데이(Intraday) 숨김 정책

- 당일 분봉 차트 및 실시간 호가 데이터를 AI 분석 화면에 노출하는 코드 추가 금지
- `UserPreferences.chartMode` 기본값을 `"daily"` 이외로 변경 금지
- `intraday-reopen-checklist.md`의 모든 조건이 충족되지 않는 한 재도입 금지

### 1-2. 홈 화면 단일 Fetch 아키텍처

- `HomeIntelligenceProvider` 외부에서 홈 카드(`TrendIssuesCard`, `TrendStocksCard`, `TrendSectorsCard`, `AIPicksCard`)가 독자적으로 데이터를 fetch하는 코드 추가 금지
- `/api/home/intelligence` 엔드포인트를 카드 컴포넌트 내부에서 직접 호출하는 것은 `HomeIntelligenceProvider`가 하는 것이므로 이를 bypassing하는 추가 호출 금지

### 1-3. 명시적 저장 전용(Explicit Save-Only) 정책

- `LocalStorageAdapter.addRecentViewed()` 이외의 저장 함수(`addToWatchlist`, `toggleBookmark`, `setBuyPrice`)를 사용자 액션 없이 자동 호출하는 코드 금지
- 서버-측 DB에 사용자 개인화 데이터를 무단으로 저장하는 코드 금지

### 1-4. 종목 상세 진입 속도 제한 보호

- `/stocks/[symbol]` 페이지 접속 시 KIS, DART, GNews, NewsAPI를 즉시/동기적으로 직접 호출하는 코드 금지
- 상세 페이지 내 컴포넌트는 반드시 `/api/stocks/[symbol]/*` 엔드포인트를 통해 접근하고, 해당 엔드포인트는 `getOrGenerateSnapshot`의 DB-first 로직을 사용해야 함

### 1-5. 소스 페이지네이션

- `SourceListCard`의 페이지네이션 로직 제거 금지
- 전체 소스 목록을 한 번에 렌더링하는 방식으로의 변경 금지
- 초기 로드도 `/api/stocks/[symbol]/sources?page=1&limit=...` 경로를 사용해야 함
- `collectedAt`을 발행일/공시일처럼 사용자에게 표시하는 변경 금지

### 1-6. AI/원본 분리

- AI 요약(`aiSummary`, `aiHeadline`)과 원본 소스(뉴스 링크, 공시 원문)를 동일 섹션에 혼합하는 렌더링 금지
- AI 생성 텍스트를 뉴스 소스인 것처럼 포장하는 UI 금지

### 1-7. 추천 Disclaimer 필수

- `AIPicksCard`, `TrendStocksCard`, `TrendSectorsCard`, 섹터 상세 페이지에서 면책 조항 제거 금지
- AI 생성 추천 텍스트에서 면책 조항을 생략하는 프롬프트 변경 금지

### 1-8. 지시적 투자 언어 차단

- "매수 추천", "강력 매수", "반드시 사야", "팔아라" 등 단정적/지시적 표현을 생성하도록 프롬프트를 변경하는 것 금지
- `evaluator.ts`의 `IMPERATIVE_PHRASES` 목록 축소 금지

### 1-9. Canonical master guard

- 홈/섹터 라우팅은 canonical `sectorId`만 사용
- unsupported symbol guard를 우회해 상장폐지/지원 외 시장 종목을 검색/상세에 노출하는 변경 금지
- `stock_master`, `sector_master` pagination/validation 제거 금지

---

## 2. 승인 필요 항목 (변경 전 리뷰 필요)

아래 항목은 변경 전 팀 리뷰가 필요합니다.

- AI 모델 변경 (Gemini 2.5 Flash 계열 외 다른 제공자로 전환)
- 스냅샷 TTL 변경 (1시간 기준)
- 새로운 외부 데이터 소스 추가
- `LocalStorageAdapter` 스키마 변경 (마이그레이션 필요)
- `evaluator.ts` 평가 기준 완화

---

## 3. 허용 항목 (베타 중 자유롭게 변경 가능)

- 버그 수정 (동결 항목의 동작을 바꾸지 않는 범위)
- 문서 업데이트
- UI 텍스트 수정 (정책 문구는 제외)
- 스켈레톤/로딩 상태 개선
- 성능 최적화 (외부 API 추가 호출 없는 범위)
- 테스트 추가

---

## 4. 릴리즈 동결 해제 조건

베타 종료 후 다음 조건 충족 시 동결 해제를 검토합니다:

- [ ] 베타 테스터 피드백 수렴 완료
- [ ] `docs/release/known-issues.md`의 P0/P1 이슈 전부 해결
- [ ] `npm run validate:full` 지속적 통과
- [ ] 인트라데이 재도입의 경우: `docs/release/intraday-reopen-checklist.md` 모든 항목 통과
