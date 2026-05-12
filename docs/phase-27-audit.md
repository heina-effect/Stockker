# Phase 27 감사 보고서 — 현실 수정, 테마 시스템, 섹터 라우팅, 인텔리전스 명확성

**날짜:** 2026-05-12  
**감사자:** Claude (Phase 27 구현 패스)  
**범위:** 섹터 404, 테마 토글 미작동, 날짜 의미론, 섹터 UX, 연관 종목, 인텔리전스 명확성

---

## 1. 왜 일부 섹터가 홈에서 404를 반환하는가?

**경로:**  
`/api/home/intelligence` → `getHomeIntelligence()` → `aiGenerateHomeIntelligence()` → AI가 sectors 배열 생성 → `TrendSectorsCard`가 `sector.id`로 링크 생성 → `/sectors/${sector.id}` → `SECTOR_UNIVERSE[sectorId]` 미존재 → `notFound()`

**근본 원인:**  
`aiGenerateHomeIntelligence`의 Stage 2 프롬프트에서 섹터 ID를 AI가 자유롭게 생성한다. 프롬프트 예시에 `"sec-semiconductor"`가 있지만, **SECTOR_UNIVERSE에 있는 유효 ID만 사용해야 한다는 명시적 제약이 없다**.

현재 SECTOR_UNIVERSE에 존재하는 유효 ID:
- `sec-semiconductor`, `sec-battery`, `sec-biotech`, `sec-platform`, `sec-finance`, `sec-entertainment`, `sec-auto`

AI가 생성할 수 있는 잘못된 ID 예:
- `"sec-defense"` (방산) → 404
- `"sec-shipbuilding"` (조선) → 404  
- `"sec-gaming"` (게임) → 404

`TrendSectorsCard`는 `SECTOR_UNIVERSE[sector.id]`로 iconKey를 조회하는데, 잘못된 ID면 "layers" 기본 아이콘을 사용하므로 렌더링 자체는 되지만, 클릭하면 `/sectors/sec-defense`로 이동 → 404.

**수정 방향:**
1. 프롬프트에 SECTOR_UNIVERSE의 유효 ID 목록을 명시적으로 포함
2. `refreshCache()`에서 AI 반환값의 sectors를 SECTOR_UNIVERSE 키로 필터링

---

## 2. 섹터 정체성의 진실의 원천(Source of Truth)은 무엇인가?

**현재 상태:**
- **정적 분류체계:** `src/data/sectors/taxonomy.ts`의 `SECTOR_UNIVERSE` — 7개 섹터, 각 섹터마다 `sectorId`, `memberSymbols`, `representativeSymbols`
- **DB 스냅샷:** `sector_research_snapshots` 테이블 — `sector_id`로 식별
- **홈 AI 출력:** `aiGenerateHomeIntelligence`가 자체 판단으로 섹터 ID 생성 → 비일관성 발생

진실의 원천은 **SECTOR_UNIVERSE**이어야 하며, AI 출력은 그 서브셋으로 제한되어야 한다.

---

## 3. 섹터 라우팅이 정규 ID 기반인가, 표시 이름 기반인가?

**현재 상태:** 혼합 — 정규 ID를 사용하려 하지만 AI가 임의 ID를 생성할 수 있음.

- 홈 섹터 카드: `sector.id` (AI 생성, 검증 없음)
- 섹터 상세 라우트: `SECTOR_UNIVERSE[sectorId]` (정규 ID 검증 있음)
- DB 스냅샷: `sector_id` 필드 (정규 ID 사용 ✅)

**문제:** 홈 레이어와 라우팅 레이어 사이의 ID 검증 간격.

---

## 4. 다크 모드/테마 토글이 작동하지 않는 정확한 원인은?

**근본 원인: Tailwind v4와 next-themes의 방식 불일치**

`package.json`:
```json
"tailwindcss": "^4"
```

`globals.css`:
```css
@import "tailwindcss";
```

Tailwind v4는 `dark:` 유틸리티 클래스를 기본적으로 **`@media (prefers-color-scheme: dark)` 미디어 쿼리**에 바인딩한다.

`next-themes`(ThemeProvider)는 사용자 선택 시 `<html>` 요소에 **`.dark` 클래스**를 추가/제거한다.

**결과:** ThemeProvider가 `.dark` 클래스를 올바르게 토글해도, Tailwind v4의 `dark:` 스타일은 미디어 쿼리만 감지하므로 클래스 변경에 반응하지 않는다.

`layout.tsx`에서 `ThemeProvider`가 올바르게 설정되어 있고 (`attribute="class"`, `enableSystem`, `suppressHydrationWarning`), `dashboard-header.tsx`의 `cycleTheme`도 올바르게 구현되어 있다. 테마 **상태는 변경**되지만 **Tailwind 스타일이 반응하지 않는** 것이다.

**수정:** `globals.css`에 다음을 추가:
```css
@custom-variant dark (&:where(.dark, .dark *));
```
이 한 줄이 Tailwind v4에 `.dark` 클래스 기반 dark: 유틸리티를 활성화한다.

---

## 5. 테마 상태가 변경되지 않는가, 변경되지만 적용되지 않는가?

**테마 상태는 정상적으로 변경된다.** `next-themes`의 `localStorage` 저장, `<html>` 클래스 변경이 모두 작동한다. 아이콘도 Sun → Moon → Monitor로 올바르게 순환한다.

**Tailwind `dark:` 스타일이 반응하지 않는다.** `.dark` 클래스가 `<html>`에 있어도 Tailwind v4 기본 설정에서는 미디어 쿼리만 확인하기 때문이다.

---

## 6. 공시/소스 카드에 현재 표시되는 날짜 필드는?

**`source-list-card.tsx` 분석:**

카드 헤더의 "수집:" 표시:
```typescript
setGeneratedAt(new Date().toISOString()); // fetch 완료 시점의 현재 시각!
```
→ 실제 소스 날짜가 아닌 **컴포넌트 마운트 시의 현재 시각**이다. 신뢰 문제 발생.

개별 소스 항목의 날짜:
```typescript
src.generatedAt 
  ? new Date(src.generatedAt).toLocaleString(...)
  : new Date(src.collectedAt).toLocaleDateString(...)
```
→ `generatedAt`이 있으면 그 값을 사용. 공시의 경우 `generatedAt = rcept_dt`(접수일)이므로 실제 공시일이 표시됨 ✅

**`SourceItem` 타입:**
- `collectedAt`: Stockker가 API 호출한 시각 (항상 현재 시각)
- `generatedAt`: 원본 소스 날짜 (뉴스 발행일 또는 공시 접수일 `rcept_dt`)
- `publishedAt`, `filedAt`: 타입에 정의되어 있지 않음

**날짜 혼란의 실제 원인:** 
1. 카드 헤더가 컴포넌트 마운트 시각을 "수집:" 레이블로 표시
2. "수집:", "공시일", "발행일"이 혼용되지 않고 제네릭하게 처리됨
3. `generatedAt` 필드명이 "AI 생성 시각"처럼 들리지만 실제로는 "원본 발행/공시 날짜"

---

## 7. 표시된 날짜가 실제 DART 페이지와 왜 다른가?

`disclosure-provider.ts` 확인:
```typescript
const dateStr = item.rcept_dt; // YYYYMMDD (공시 접수일)
const timestamp = dateStr 
  ? new Date(`${dateStr.substring(0,4)}-${dateStr.substring(4,6)}-${dateStr.substring(6,8)}T00:00:00+09:00`).toISOString()
  : new Date().toISOString(); // rcept_dt 없으면 현재 시각!

return {
  collectedAt: new Date().toISOString(), // 항상 현재 시각
  generatedAt: timestamp,                // rcept_dt 또는 현재 시각
}
```

DART `rcept_dt`가 없거나 파싱 실패 시 `generatedAt`이 현재 시각으로 설정된다. 이 경우 카드에 "오늘" 날짜가 표시되지만 실제 공시는 며칠/몇 주 전의 것일 수 있다.

또한 `collectedAt`이 항상 현재 시각이므로, 카드 헤더의 "수집: HH:MM"은 의미 없는 현재 시각이다.

---

## 8. RelatedStocksCard의 현재 선정 및 렌더링 방식은?

**Phase 26에서 구현됨** (`src/server/research/pipeline/related-stocks.ts`):

- Stage 1: `SECTOR_UNIVERSE[sectorId].memberSymbols`로 섹터 동종 기업 (결정론적, API 없음)
- Stage 2: DB 캐시된 `IssueCluster.relatedSymbols`로 이슈 공동 언급 (비블로킹, try/catch)
- 각 결과에 `relationType`, `relationReason`, `quoteMode: "live-sync"` 포함

**렌더링** (`src/components/report/related-stocks-card.tsx`):
- 관계 유형 배지 (동종 섹터/이슈 연관/공급망)
- `relationReason` 텍스트
- 가격은 공유 `useLiveMarket()` SSE에서 (팬아웃 없음) ✅

**현재 Phase 27에서 남은 문제:**
- `basisSourceCount`가 UI에서 충분히 강조되지 않음
- 이슈 공동 언급 결과가 거의 없음 (DB에 충분한 클러스터가 없는 경우)
- "왜 이 종목이 연관됐는가"가 더 명확하게 설명될 필요 있음

---

## 9. 결정론적 vs AI 생성 부분은 무엇인가?

| 기능 | 결정론적 | AI 생성 |
|------|---------|---------|
| 연관 종목 선정 | ✅ (섹터 동종: SECTOR_UNIVERSE) | ❌ (이슈 co-mention: DB 클러스터) |
| 연관 종목 이유 설명 | ✅ (templateized) | - |
| 섹터 주도주/소외주 | ❌ | ✅ (Gemini Flash) |
| 홈 섹터 선정 | ❌ | ✅ (Gemini Flash-Lite/Flash) |
| 홈 이슈 선정 | ❌ | ✅ (Gemini Flash) |
| 섹터 요약 | ❌ | ✅ (Gemini Flash) |
| 감성 분석 | ❌ | ✅ (2-stage Gemini) |

---

## 10. 어떤 화면이 "원시 데이터 표시"처럼 느껴지는가?

| 화면 | 상태 | 문제 |
|------|------|------|
| 홈 이슈 카드 | ⚠️ | 제목 나열만, "왜 중요한가" 컨텍스트 부족 |
| 홈 섹터 카드 | ⚠️ | description이 너무 짧고 제네릭 |
| 섹터 상세 | ⚠️ | "대표 종목" vs "주도주" 중복, 스크롤 과다 |
| 종목 상세 AI 요약 | ✅ | Phase 23-25 개선으로 양호 |
| 소스 목록 | ⚠️ | 날짜 레이블 혼란, "AI 분석 출처 데이터" 제목이 의미 불명확 |
| 연관 종목 | ⚠️ | 이유 텍스트는 있지만 여전히 박스 나열처럼 느껴짐 |

---

## 근본 원인 요약표

| 문제 | 파일 | 근본 원인 | 수정 방향 |
|------|------|-----------|-----------|
| 섹터 404 | `home-cache.ts`, `orchestrator.ts` | AI가 SECTOR_UNIVERSE 외 ID 생성 | 유효 ID 목록을 프롬프트에 포함, 결과 필터링 |
| 테마 미작동 | `globals.css` | Tailwind v4의 dark: = 미디어 쿼리, next-themes = .dark 클래스 | `@custom-variant dark (&:where(.dark, .dark *));` 추가 |
| 날짜 혼란 | `source-list-card.tsx`, `disclosure-provider.ts` | 헤더가 fetch 시점 현재 시각 표시; `generatedAt` 필드명 혼란 | 헤더에서 실제 소스 최신 날짜 표시; 공시는 "공시일" 레이블 사용 |
| 섹터 UX 중복 | `sectors/[sectorId]/page.tsx`, `sector-ai-section.tsx` | "대표 종목"(정적)과 "주도주"(AI) 개념 중복 | 섹터 페이지 정보 계층 단순화, 주도주 중심으로 병합 |
| 연관 종목 불명확 | `related-stocks-card.tsx` | 관계 이유 텍스트가 있지만 컨텍스트 부족 | 소스 수 강조, 이슈 제목 더 명시적 표시 |
| 인텔리전스 밋밋 | 홈/섹터/종목 카드 다수 | "무엇이 일어나는가"만 보여주고 "왜 중요한가"가 부족 | AI 프롬프트에 "왜" 관점 강화 |
