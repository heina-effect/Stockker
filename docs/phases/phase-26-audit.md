# Phase 26 감사 보고서 — 베타 이후 UX 수정

**날짜:** 2026-05-11  
**감사자:** Claude (Phase 26 구현 패스)  
**범위:** 연관 종목 동작, 헤더 테마 컨트롤, 섹터 페이지 로딩, 베타 이후 UX 개선

---

## 1. RelatedStocksCard는 현재 어떻게 데이터를 가져오는가?

**API 경로:** `GET /api/stocks/[symbol]/related` → `model-router.generateRelatedStocks(symbol)` → `pipeline/related-stocks.generateRelatedStocks(symbol)`

**근본 발견:** `pipeline/related-stocks.ts`는 무조건 `mockRelatedStocks(symbol)`을 반환한다. 코드 내 주석은 "In real app, AI will determine related stocks based on the recent issues."라고 되어 있어, 이 코드가 한 번도 실제로 구현되지 않은 플레이스홀더였음을 확인함.

목업은 조회 중인 종목과 무관하게 항상 동일한 3개 종목(SK하이닉스, 한미반도체, 이오테크닉스)을 반환한다.

**UI:** `RelatedStocksCard`는 마운트 시 단일 fetch로 API를 호출한다 (팬아웃 없음). `useLiveMarket()` SSE 스토어에서 실시간 가격을 병합한다. 카드 제목은 "AI 포착 연관 종목"에 "Live Sync" 배지를 달고 있어 실시간 AI 분석처럼 보이지만, 실제 데이터는 완전한 정적 목업이다.

---

## 2. 연관 종목 중 결정론적인 부분과 AI 생성 부분은 무엇인가?

**현재 상태:** 100% 하드코딩 목업. 런타임에서 결정론적이거나 AI가 생성하는 부분은 전혀 없음.

**결정론적으로 구현 가능한 것 (현재 기준):**
- 섹터 동종 기업: `SECTOR_UNIVERSE[sectorId].memberSymbols` — 완전 결정론적, API 호출 없음
- 이슈 공동 언급: DB 캐시된 클러스터의 `IssueCluster.relatedSymbols` — DB에 데이터 있으면 결정론적

**AI 생성 영역 (선택):**
- 관계별 설명 텍스트 (`reason` 필드) — 단, 근거 없이 생성하면 환각 위험 있음

**Phase 26 방향:** 목업을 결정론적 섹터 동종 조회 + DB 클러스터 이슈 공동 언급 조회로 대체. 관계 선정 자체에는 AI 생성 사용하지 않음.

---

## 3. RelatedStocksCard가 마운트 시 비용이 큰 fetch를 수행하는가?

**단일 fetch:** 마운트 시 `/api/stocks/${symbol}/related`로 1회 fetch. 이는 허용 범위.

**팬아웃 없음:** 정상 확인 — 컴포넌트는 종목별 개별 실시간 가격 fetch를 수행하지 않는다. 이미 실행 중인 공유 `useLiveMarket()` SSE 스트림을 사용한다.

**라이브 부트스트랩 루프 없음:** 확인. `localLiveQuotes` 상태는 초기화되지만 어떠한 fetch로도 채워지지 않는 죽은 상태다. 실시간 가격은 오직 `marketStore`(공유 SSE 프로바이더)에서만 온다.

---

## 4. 헤더 태양 아이콘의 정확한 현재 동작은?

`DashboardHeader` 컴포넌트:
- `next-themes`에서 `useTheme`를 임포트
- 클릭 시 `setTheme(theme === "dark" ? "light" : "dark")` 호출
- 마운트 후 조건부 렌더링 (하이드레이션 불일치 방지)
- Sun/Moon 아이콘이 CSS 전환으로 올바르게 애니메이션됨

**비작동 근본 원인:** `layout.tsx`에 `next-themes`의 `ThemeProvider`가 포함되지 않음. 프로바이더가 없으면 `useTheme()`는 undefined 테마 상태를 반환하고 `setTheme()`는 no-op이 된다. 버튼은 렌더링되지만 클릭해도 아무 효과가 없음.

추가로, 토글이 이진 방식(light ↔ dark)으로 "시스템" 옵션이 없음.

---

## 5. 어떤 테마 인프라가 이미 존재하는가?

- **라이브러리:** `next-themes` v0.4.6 (설치됨)
- **훅 사용:** `useTheme()`가 `dashboard-header.tsx`에서 올바르게 사용됨
- **CSS:** Tailwind `dark:` 클래스가 전체에 사용됨 — ThemeProvider에 `class` 전략 필요
- **누락:** `layout.tsx`에 `ThemeProvider` 없음

Tailwind는 `darkMode: "class"`로 구성되어 있음 (next-themes 연동 표준 방식).

---

## 6. 섹터 페이지 첫 방문 시 정확히 무엇이 렌더링을 막는가?

**경로:** `sectors/[sectorId]/page.tsx` (서버 컴포넌트)

```typescript
let snapshot = await getSectorSnapshot(sectorId);   // 빠른 DB 조회 (~50ms)
if (!snapshot) {
  snapshot = await generateSectorSnapshot(sectorId); // 블로킹: 3-10초
}
```

`generateSectorSnapshot`의 처리:
1. `for (const sym of sector.representativeSymbols)` — 종목별 `generateIssues(sym)` await
   - 각 `generateIssues`: 외부 뉴스 API 호출 + 임베딩 큐레이션 (종목당 1-3초)
2. `await aiSummarizeSector(...)` — Gemini API 호출 (1-2초)
3. `await db.from("sector_research_snapshots").upsert(...)` — DB 쓰기

**콜드 스타트 시 총 블로킹 시간: 4-12초** (API 지연에 따라 다름)

**오래된 스냅샷 케이스 (존재하지만 만료된 경우):** `getSectorSnapshot`이 오래된 데이터를 반환하면서 백그라운드 재생성을 시작 — 이 경로는 이미 비블로킹. ✅

**첫 방문 / 캐시 미스:** 완전 블로킹 SSR. ❌

---

## 7. 어떤 페이지에 혼란스러운 로딩/빈 화면/오류 상태가 남아있는가?

| 페이지 | 로딩 | 빈 화면 | 오류 |
|--------|------|---------|------|
| 홈 카드들 | ✅ 스켈레톤 (Phase 25) | ✅ 한국어 안내 | ✅ 오류 메시지 |
| RelatedStocksCard | ⚠️ 펄스 스켈레톤만 (메시지 없음) | ⚠️ 무한 펄스 상태 유지 | ⚠️ 조용히 실패 (오류 상태 없음) |
| 섹터 페이지 | ❌ 생성 중 멈춘 것처럼 보임 | ✅ "준비 중" 텍스트 표시 | ❌ 오류 복구 없음 |
| 워크플로우 페이지 | ✅ Phase 25에서 수정 | ✅ Phase 25에서 수정 | ⚠️ 조용한 API 오류 |
| SentimentScoreCard | 확인 필요 | 확인 필요 | 확인 필요 |

---

## 8. 변경하면 안 되는 릴리즈 동결 가드레일은?

`docs/release/release-freeze-rules.md` 기준:

| 가드레일 | 상태 |
|---------|------|
| 당일 분봉 차트 숨김 | ✅ 미변경 — 이번 Phase에서 변경 없음 |
| 홈 단일 fetch 아키텍처 | ✅ 미변경 — HomeIntelligenceProvider 변경 없음 |
| 명시적 저장 전용 정책 | ✅ 미변경 — 새 자동 저장 도입 없음 |
| 레이트 리밋 보호 (종목당 5분 쿨다운) | ✅ 연관 종목이 DB-first 사용, 새 KIS 라이브 호출 없음 |
| 소스 페이지네이션 | ✅ 미변경 |
| AI/소스 분리 | ✅ 연관 종목이 결정론적 선정과 선택적 설명을 분리함 |
| 추천 면책 조항 필수 노출 | ✅ 섹터 페이지 면책 조항 유지 |
| 지시적 매수/매도 언어 금지 | ✅ 관계 이유는 설명적이며 지시적이지 않음 |

---

## 근본 원인 요약

| 문제 | 근본 원인 | 수정 방향 |
|------|-----------|-----------|
| 연관 종목 = 목업 | `pipeline/related-stocks.ts` 미구현 | 실제 섹터 동종 + 이슈 공동 언급 로직으로 대체 |
| 태양 아이콘 무작동 | `layout.tsx`에 `ThemeProvider` 없음 | `ThemeProvider` 추가, 3-way 지원 (light/dark/system) |
| 섹터 페이지 블로킹 | SSR에서 `generateSectorSnapshot` 동기 호출 | 분리: 서버는 쉘만 렌더링, 클라이언트가 AI 섹션 비동기 로드 |
| RelatedStocksCard 오해 유발 제목 | "AI 포착"이라 하지만 목업 데이터 | 이름 변경 + 관계 유형 배지 추가 |
