# Phase 27 리포트 — 현실 수정, 테마 수리, 섹터 라우팅, 인텔리전스 명확성

**날짜:** 2026-05-12  
**브랜치:** main  
**상태:** 완료

---

## 요약

Phase 27은 "문서상 완료"와 "런타임 실제 동작" 사이의 간극을 제거했습니다.

1. **섹터 404 제거** — AI가 SECTOR_UNIVERSE 외의 섹터 ID를 생성해 발생하던 404 차단
2. **테마 토글 실제 작동** — Tailwind v4 + next-themes 방식 불일치 해결 (`@custom-variant dark`)
3. **공시/소스 날짜 의미론 교정** — "수집 시각" vs "공시일/발행일" 혼용 제거
4. **섹터 UX 단순화** — "대표 종목"/"주도주" 중복 제거, 정보 계층 개선
5. **인텔리전스 명확성** — "왜 중요한가" 관점 강화

---

## 작업 A — 섹터 라우팅 정합성

### 문제
`aiGenerateHomeIntelligence`가 섹터 ID를 자유롭게 생성했다. AI가 "방산" 섹터를 `"sec-defense"` ID로 생성하면 SECTOR_UNIVERSE에 없으므로 → 404.

### 변경 사항

**`src/server/ai/home-cache.ts`**
- `VALID_SECTOR_IDS = new Set(Object.keys(SECTOR_UNIVERSE))` 로 유효 ID 집합 구성
- AI 결과의 sectors 배열을 반환 전에 필터링: `fresh.sectors = fresh.sectors.filter(s => VALID_SECTOR_IDS.has(s.id))`

**`src/server/ai/orchestrator.ts`**
- Stage 2 프롬프트의 sectors 항목에 유효 ID 목록 명시:
  ```
  "id": "<MUST be one of: sec-semiconductor(반도체), sec-battery(2차전지), ...>"
  ```
- `VALID_SECTOR_IDS_FOR_PROMPT` 상수로 SECTOR_UNIVERSE에서 동적 생성 — 섹터 추가 시 자동 반영

### 보장
- SECTOR_UNIVERSE에 존재하지 않는 섹터는 홈 카드에 절대 표시되지 않음
- 클릭 시 404 발생 불가

---

## 작업 B — 섹터 UX 재설계

### 문제
- 섹터 상세 페이지가 "대표 종목"(정적, SECTOR_UNIVERSE 기반)과 "주도주"(AI 기반) 두 섹션을 분리 표시 → 개념 중복, 스크롤 과다
- 섹터 요약에 "왜 이 섹터인가" 관점 부재

### 변경 사항

**`src/app/sectors/[sectorId]/page.tsx`**
- 메인 컬럼: 대표 종목 섹션 제거 → `SectorAISection`이 주도주+이슈+관찰후보 전담
- 사이드바: "구성 종목" 링크 목록으로 간소화 (스크롤 없이 한눈에 확인)
- `SectorAISection`에 `sector` prop 전달 → 주도주 이름을 심볼 링크로 표시 가능

**`src/components/sectors/sector-ai-section.tsx`** — 전면 재작성
- 정보 계층 순서: `지금 이 섹터가 주목받는 이유` → `주도주/소외주` → `주요 근거 이슈` → `관찰 후보`
- `TrendStrengthBar` 컴포넌트로 모멘텀 강도를 시각적 바로 표시
- 주도주 이름과 `sector.memberSymbols`를 매칭해 클릭 가능한 종목 링크로 변환
- 이슈에 `sentiment` 배지 (긍정/부정/중립) 추가
- `AlertCircle` 아이콘 포함 오류 상태 개선

### 개선 결과

| 이전 | 이후 |
|------|------|
| 대표 종목 8열 그리드 + 주도주/소외주 별도 섹션 | 구성 종목 사이드바 + 주도주 통합 AI 섹션 |
| "왜 이 섹터인가" 문구 없음 | "지금 이 섹터가 주목받는 이유" 명시 |
| 주도주 이름만 나열 | 주도주 이름 + 심볼 + 종목 상세 링크 |
| 이슈 감성 표시 없음 | 이슈별 긍정/부정/중립 배지 |

---

## 작업 C — 테마 시스템 수리

### 문제
ThemeProvider가 `layout.tsx`에 올바르게 추가되어 있고 `dashboard-header.tsx`의 cycleTheme도 정상 구현되어 있었다. 그러나 Tailwind v4의 `dark:` 유틸리티가 미디어 쿼리(`prefers-color-scheme`)만 감지하고, next-themes가 추가하는 `.dark` 클래스를 감지하지 못했다.

### 변경 사항

**`src/app/globals.css`** — 한 줄 추가
```css
@custom-variant dark (&:where(.dark, .dark *));
```

이 한 줄이 Tailwind v4에 `.dark` 클래스 기반 dark: 유틸리티를 활성화한다. next-themes가 `<html class="dark">`를 설정하면 모든 `dark:` 스타일이 즉시 반응한다.

### 확인 사항
- light / dark / system 3-way 순환 작동
- 테마 localStorage 유지 (next-themes 기본 동작) ✅
- Sun → Moon → Monitor 아이콘 순환 ✅
- 홈/종목 상세/섹터 상세/워크플로우 모든 dark: 스타일 반응 ✅

---

## 작업 D — 날짜 의미론 교정

### 문제
`source-list-card.tsx` 헤더가 `new Date().toISOString()`(컴포넌트 fetch 시점 현재 시각)을 "수집: HH:MM"으로 표시했다. 실제 소스 발행/공시 날짜와 무관한 현재 시각이 표시되어 신뢰 손상.

### 변경 사항

**`src/components/report/source-list-card.tsx`** — 전면 재작성

**날짜 모델:**
| 필드 | 의미 | 표시 여부 |
|------|------|-----------|
| `generatedAt` | 원본 날짜 (공시 접수일 `rcept_dt`, 뉴스 발행일) | ✅ 기본 표시 |
| `collectedAt` | Stockker 수집 시각 (항상 현재에 가까움) | ❌ UI 표시 안 함 |

**레이블 구분:**
- 공시 소스: "공시일 MM/DD" (이전: 미구분)
- 뉴스 소스: "발행일 MM/DD" (이전: 미구분)

**기타 개선:**
- 카드 헤더: 잘못된 현재 시각 제거 → 뉴스 건수 / 공시 건수 요약 배지로 대체
- 날짜 포맷: 오늘이면 HH:MM, 7일 이내면 MM/DD, 이전이면 YYYY/MM/DD
- 소스 타입별 dark: 색상 완전 지원 추가

---

## 작업 E — 연관 종목 명확성

Phase 26에서 결정론적 로직(섹터 동종 + 이슈 공동 언급)이 구현되어 있었다. Phase 27에서는 추가 수정 없이 유지. 연관 종목 카드의 구조와 `basisSourceCount` 표시가 이미 적절했다.

---

## 작업 F — 인텔리전스 명확성

### 변경 사항

**`src/components/home/trend-issues-card.tsx`**
- 제목: "실시간 핵심 이슈" → "지금 중요한 이슈"
- 첫 번째 이슈에 "주목" 배지 (Zap 아이콘)
- `trendStrength` 미니 바 추가 — 이슈 강도를 시각적으로 표시
- dark: 색상 완전 지원

**`src/components/sectors/sector-ai-section.tsx`** (작업 B와 통합)
- AI 요약 섹션 제목: "지금 이 섹터가 주목받는 이유"
- 이슈 섹션 제목: "주요 근거 이슈" (출처 근거임을 명시)
- 관찰 후보 섹션: Eye 아이콘 + amber 색조로 시각 차별화

---

## 작업 G — 뉴스 관련성 필터 강화 및 날짜 체인 완성

### 문제 1: 해외 무관 뉴스 유입 (HLB 등)
- `normalize.ts`의 `isRelevantToCompany` 가드가 실제 프로바이더에 대해 적용되지 않았음 → 아랍어·힌디어 기사 및 말레이시아 HLB Bank 기사가 HLB(028300) 페이지에 노출
- 근본 원인: 짧은 영문 티커("HLB")가 해외 동명 기업 기사 제목에도 매칭

### 변경 사항

**`src/server/research/pipeline/normalize.ts`**
- `isAcceptableTitle()` 함수 추가 — 2단계 스크립트 필터:
  1. 아랍어(`[؀-ۿ]`) / 힌디·벵골어(`[ऀ-৿]`) 포함 제목 즉시 제거
  2. 2-6자 순수 영문 회사명(예: HLB, SK)일 때 제목에 한글 없으면 해외 동명 기업 기사로 간주해 제거

**`src/server/research/providers/gnews-provider.ts`**
**`src/server/research/providers/newsapi-provider.ts`**
- ID 생성 방식을 `Date.now()` 기반 → **djb2 해시 기반 stable ID**로 변경
  - 기존: `newsapi-${symbol}-${Date.now()}-${idx}` → 수집마다 신규 ID 생성, upsert 중복 제거 무효
  - 변경: `stableId("newsapi", symbol, title)` → 동일 기사는 항상 동일 ID → upsert가 실제 중복 제거

---

### 문제 2: 이슈 타임라인 날짜 항상 HH:MM 표시
- `issue-timeline-card.tsx`가 `toLocaleTimeString()`만 호출 → 오래된 기사도 항상 시간만 표시

**`src/components/report/issue-timeline-card.tsx`**
- `formatClusterDate()` 추가 — `source-list-card.tsx`와 동일한 로직:
  - 오늘: HH:MM / 7일 이내: MM/DD / 이전: YYYY/MM/DD

---

### 문제 3: DB 소스 경로에서 generatedAt 누락
- `model-router.ts` DB 캐시 경로에서 `EmbeddedSource[]`를 그대로 반환, `generatedAt` 필드 없음 → `collectedAt`(수집 현재 시각)으로 폴백
- 공시가 오늘 수집됐을 때 공시일이 아닌 수집 시각이 표시되는 원인

**`src/server/research/model-router.ts`**
```typescript
// EmbeddedSource.publishedAt → SourceItem.generatedAt 브릿지
const sources = recentSources.map(s => ({ ...s, generatedAt: s.publishedAt })) as any[];
```

---

## 작업 H — DB 정리 및 스키마 개선

### 문제
- `source_embeddings` 190건, `news_sources` 219건 중복 데이터 (timestamp 기반 ID로 인해 수집마다 신규 레코드 생성)
- `stock_research_snapshots`, `sector_research_snapshots` migration 이력 미등록 (기능 동작은 했으나 관리 불가 상태)
- `source_embeddings(symbol, collected_at)` 복합 인덱스 누락 → `getRecentCuratedSources` 쿼리 풀스캔
- `issue_clusters` 테이블: 코드 미사용, 0건

### 변경 사항

**DB 중복 삭제**
- `source_embeddings`: 328건 → 138건 (190건 삭제, quality_score 기준 최선 유지)
- `news_sources`: 375건 → 156건 (219건 삭제, collected_at 최신 기준 유지)
- 검증: 중복 그룹 0개, published_at NULL 0건

**`supabase/migrations/004_schema_fixes.sql`** 작성 및 적용
- `source_embeddings(symbol, collected_at DESC)` 복합 인덱스 추가
- `source_embeddings(symbol, quality_label, collected_at DESC)` 인덱스 추가 (is_mock=FALSE 조건)
- `news_sources(symbol, collected_at DESC)` 인덱스 추가
- `issue_clusters` 테이블 제거 (0건, 코드 미사용)
- snapshot 테이블 `IF NOT EXISTS` 보장

**마이그레이션 이력 관리 체계 수립**
```bash
npx supabase link --project-ref <ref>
npx supabase db push
```
- `supabase migration repair --status applied` 로 기존 수동 적용분 이력 등록 완료

---

## 유지된 가드레일

| 가드레일 | 상태 |
|---------|------|
| 당일 분봉 차트 숨김 | ✅ 미변경 |
| 홈 단일 fetch 아키텍처 | ✅ 미변경 |
| 명시적 저장 전용 정책 | ✅ 미변경 |
| 상세 진입 레이트 리밋 보호 | ✅ 미변경 |
| 소스 페이지네이션 | ✅ 미변경 |
| 추천 면책 조항 필수 노출 | ✅ 미변경 |
| 지시적 매수/매도 언어 금지 | ✅ 미변경 |
| KIS 팬아웃 없음 | ✅ 미변경 |

---

## 검증

- [x] typecheck: PASS
- [x] build: PASS (24개 라우트)
- [x] 섹터 클릭 → 유효 섹터 ID만 표시, 404 불가
- [x] 테마 토글: dark: 스타일 실제 반응
- [x] 공시/뉴스 날짜 레이블 구분
- [x] 섹터 상세 스크롤 단축
- [x] 이슈 타임라인 날짜 포맷 — 날짜 기반 표시 (HH:MM / MM/DD / YYYY/MM/DD)
- [x] DB 소스 경로 generatedAt 브릿지 — 공시일 정확 표시
- [x] 아랍어·힌디 뉴스 필터링 — normalize.ts 스크립트 가드
- [x] 짧은 영문 티커 해외 동명 기업 차단 — HLB 등 한글 필수 조건
- [x] GNews/NewsAPI stable ID — 재수집 시 중복 생성 방지
- [x] DB 중복 제거 — source_embeddings 190건, news_sources 219건 삭제, 중복 그룹 0개
- [x] migration 004 적용 — 복합 인덱스, issue_clusters 제거
- [x] supabase db push 워크플로우 수립 (PAT 기반)

---

## 변경 파일 목록

| 파일 | 변경 내용 |
|------|----------|
| `src/app/globals.css` | `@custom-variant dark` 추가 — 테마 수리 핵심 |
| `src/server/ai/home-cache.ts` | AI 생성 섹터 ID SECTOR_UNIVERSE 필터링 |
| `src/server/ai/orchestrator.ts` | 섹터 ID 유효 목록 프롬프트에 명시 |
| `src/app/sectors/[sectorId]/page.tsx` | 대표 종목 섹션 제거, 섹터 주요 종목 사이드바로 이동 |
| `src/components/sectors/sector-ai-section.tsx` | 전면 재작성: 정보 계층 개선, sector prop 추가 |
| `src/components/report/source-list-card.tsx` | 날짜 의미론 교정, 공시일/발행일 레이블 구분 |
| `src/components/home/trend-issues-card.tsx` | "지금 중요한 이슈" 프레이밍, trendStrength 바 |
| `src/components/report/issue-timeline-card.tsx` | 날짜 포맷 수정 — 항상 HH:MM → 날짜 기반 포맷 |
| `src/server/research/pipeline/normalize.ts` | 스크립트 필터 추가, 짧은 영문명 한글 필수 조건 |
| `src/server/research/providers/gnews-provider.ts` | stable ID 생성 (djb2 해시) |
| `src/server/research/providers/newsapi-provider.ts` | stable ID 생성 (djb2 해시) |
| `src/server/research/model-router.ts` | DB 캐시 경로 generatedAt 브릿지 추가 |
| `supabase/migrations/004_schema_fixes.sql` | 복합 인덱스, issue_clusters 제거, snapshot 보장 |
| `README.md` | 마이그레이션 단계 추가 (npx supabase link/db push) |
| `docs/core/setup.md` | 섹션 4 — PAT 발급, link, repair 절차 구체화 |
| `docs/phases/phase-27-audit.md` | 감사 문서 |
| `docs/phases/phase-27-report.md` | 본 문서 |
