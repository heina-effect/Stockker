# Phase 26 리포트 — 베타 이후 UX 수정

**날짜:** 2026-05-12  
**브랜치:** main  
**상태:** 완료

---

## 요약

Phase 26은 Phase 25 베타 하드닝 이후 발견된 세 가지 사용자 가시적 문제를 수정했습니다:

1. **연관 종목이 100% 목업 데이터** — 실제 섹터 동종 기업 + 이슈 공동 언급 로직으로 교체
2. **테마 토글이 작동하지 않음** — `layout.tsx`에 `ThemeProvider` 누락, 추가 완료
3. **섹터 페이지가 SSR을 블로킹** — 첫 방문 시 4-12초 대기; 비블로킹 방식으로 개선

---

## 작업 A — 연관 종목 명확화

### 문제
`pipeline/related-stocks.ts`가 무조건 `mockRelatedStocks(symbol)`을 반환했습니다. 조회 중인 종목과 무관하게 하드코딩된 3개 종목을 반환했고, 카드 제목은 "AI 포착 연관 종목"으로 실시간 AI 분석인 것처럼 보였습니다.

### 변경 사항

**`src/types/research.ts`**
- `RelationType = "sector_peer" | "issue_mention" | "supply_chain" | "ai_inferred"` 추가
- `RelatedStock`에 필드 추가: `relationType`, `relationReason`, `basisSourceCount?`, `quoteMode`

**`src/server/research/pipeline/related-stocks.ts`** — 전체 재작성
- **1단계 (결정론적):** `SECTOR_UNIVERSE`로 섹터 동종 기업 조회 — API 호출 없음, 즉시 처리
- **2단계 (소스 기반):** DB 캐시된 `IssueCluster.relatedSymbols`로 이슈 공동 언급 조회 — DB-first, 외부 호출 없음
- 중복 제거, 조회 종목 제외, 최대 5개 결과
- 각 결과에 명시적 `relationType` + `relationReason` 텍스트 포함

**`src/server/research/mock-data.ts`**
- `mockRelatedStocks` 폴백이 새 `RelatedStock` 타입을 만족하도록 업데이트

**`src/components/report/related-stocks-card.tsx`** — 전체 재설계
- 제목: "AI 포착 연관 종목" → "연관 종목" (소스 기반 안내 문구 추가)
- 종목별 관계 유형 배지 추가: 동종 섹터(청록) / 이슈 연관(인디고) / 공급망(앰버)
- `relationReason`을 명시적 설명 텍스트로 표시
- 이슈 기반 관계에 `basisSourceCount` 표시
- 적절한 로딩 스켈레톤, 오류 상태, 빈 상태 추가 (기존: 메시지 없는 펄스만)
- 사용되지 않는 `localLiveQuotes` 죽은 상태 제거

### 유지된 가드레일
- 종목별 개별 실시간 가격 fetch 없음 (가격은 공유 `useLiveMarket()` SSE 스토어에서)
- KIS API 팬아웃 없음
- 레이트 리밋 쿨다운 미변경

### 테스트
- `src/server/research/pipeline/related-stocks.test.ts` — 6개 새 테스트: 섹터 동종 기업 반환, 조회 종목 제외, 필수 필드 계약, quoteMode 계약, relationType 값, 알 수 없는 종목 안전성

---

## 작업 B — 테마 토글

### 문제
`dashboard-header.tsx`가 `next-themes`의 `useTheme()`를 올바르게 호출하고 Sun/Moon 토글 로직을 구현했지만, `layout.tsx`에서 앱을 `ThemeProvider`로 감싸지 않았습니다. 훅이 no-op이어서 아이콘을 클릭해도 아무 효과가 없었습니다.

### 변경 사항

**`src/app/layout.tsx`**
- `next-themes`의 `ThemeProvider`를 추가하여 모든 프로바이더를 감쌈
- `attribute="class"` — Tailwind `dark:` 전략
- `defaultTheme="system"` — 첫 방문 시 OS 다크 모드 설정 반영
- `enableSystem` — 시스템 환경 설정 허용
- `disableTransitionOnChange` — 테마 전환 시 깜빡임 방지
- `<html>`에 `suppressHydrationWarning` — next-themes SSR 필수 옵션

**`src/components/home/dashboard-header.tsx`**
- 3-way 순환: light → dark → system → light (클릭으로 순환)
- 상태별 아이콘 변경: Sun(라이트) / Moon(다크) / Monitor(시스템)
- 호버 시 현재 모드 이름을 보여주는 `title` 속성
- 접근성을 위한 `aria-label` 업데이트

---

## 작업 C — 섹터 페이지 비블로킹화

### 문제
`sectors/[sectorId]/page.tsx`는 스냅샷이 없을 때 서버 컴포넌트에서 `generateSectorSnapshot(sectorId)`를 동기적으로 호출했습니다. 이 함수는:
1. 대표 종목별 `generateIssues(sym)` await (종목당 1-3초)
2. `aiSummarizeSector(...)` await (1-2초)
3. Supabase 쓰기

**캐시 미스 시 총 블로킹 시간: 4-12초** (어떠한 HTML도 전송되지 않는 SSR 대기)

### 변경 사항

**`src/app/sectors/[sectorId]/page.tsx`** — 리팩터링
- SSR에서 블로킹 `generateSectorSnapshot` 호출 완전 제거
- 서버 컴포넌트는 이제 `getSectorSnapshot`만 호출 (빠른 DB 읽기, ~50ms)
- 쉘(섹터 이름, 설명, 대표 종목)은 항상 즉시 렌더링
- AI 섹션은 `<SectorAISection>` 클라이언트 컴포넌트로 위임

**`src/components/sectors/sector-ai-section.tsx`** — 신규 파일
- 서버가 스냅샷 전달 시: AI 컨텐츠 즉시 렌더링 (클라이언트 fetch 불필요)
- 스냅샷 없음(캐시 미스) 시: 마운트 시 "AI 분석 생성 중" 상태 표시 후 `/api/sectors/[sectorId]` fetch
- 3개 서브 컴포넌트: `SectorAIGenerating`(로딩), `SectorAIContent`(데이터), 오류 폴백
- 새 API 라우트 불필요 — 기존 `/api/sectors/[sectorId]` 엔드포인트 재사용

### UX 개선

| 이전 | 이후 |
|------|------|
| 4-12초 빈 화면 / SSR 블로킹 | 쉘이 ~100ms 안에 렌더링 |
| 대기 중 유용한 정보 없음 | 섹터 이름, 설명, 종목 목록 즉시 표시 |
| 생성 중 로딩 표시 없음 | "생성 중" 애니메이션 + 안내 메시지 |
| 오래된 스냅샷 케이스 이미 비블로킹 ✅ | 유지 ✅ |

---

## 완료 기준 체크리스트

- [x] 연관 종목이 소스 기반이며 결정론적 (AI 단독 추측 없음)
- [x] 각 연관 종목에 명시적 관계 유형 배지 표시
- [x] 각 연관 종목에 인간 친화적 `relationReason` 표시
- [x] 이슈 공동 언급에 `basisSourceCount` 표시
- [x] 팬아웃 가격 fetch 없음 — `useLiveMarket()` SSE 사용
- [x] 헤더 테마 토글 작동 (ThemeProvider 추가)
- [x] light / dark / system 모두 지원
- [x] 테마가 네비게이션 전반에 유지됨 (next-themes localStorage)
- [x] 섹터 페이지가 캐시 미스 시에도 쉘을 즉시 렌더링
- [x] 섹터 페이지가 생성 중 의미 있는 "생성 중" 상태 표시
- [x] 당일 분봉 차트 숨김 유지 ✅
- [x] 홈 단일 fetch 미변경 ✅
- [x] 명시적 저장 전용 정책 미변경 ✅
- [x] 소스 페이지네이션 미변경 ✅
- [x] 추천 면책 조항 미변경 ✅
- [x] typecheck: PASS
- [x] build: PASS (24개 라우트)
- [x] test:unit: 16/16 PASS
- [x] 연관 종목 계약 테스트: 6/6 PASS

---

## 변경 파일 목록

| 파일 | 변경 내용 |
|------|----------|
| `src/app/layout.tsx` | ThemeProvider 추가 |
| `src/components/home/dashboard-header.tsx` | 3-way 테마 순환, Monitor 아이콘 |
| `src/types/research.ts` | RelationType + RelatedStock 확장 |
| `src/server/research/pipeline/related-stocks.ts` | 전체 재작성: 섹터 동종 + 이슈 공동 언급 |
| `src/server/research/mock-data.ts` | mockRelatedStocks 타입 충족 업데이트 |
| `src/components/report/related-stocks-card.tsx` | 관계 배지, 로딩/오류/빈 상태 추가 |
| `src/app/sectors/[sectorId]/page.tsx` | 블로킹 generateSectorSnapshot 제거 |
| `src/components/sectors/sector-ai-section.tsx` | 비동기 AI 섹션 클라이언트 컴포넌트 신규 |
| `src/server/research/pipeline/related-stocks.test.ts` | 계약 테스트 6개 신규 |
| `docs/phases/phase-26-audit.md` | 감사 문서 |
| `docs/phases/phase-26-report.md` | 본 문서 |
