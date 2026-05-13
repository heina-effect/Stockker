# Phase 30 감사 보고서 — 투자의견 카드 노출, 소스 UX, 종목 오염 차단

**날짜:** 2026-05-13  
**범위:** Phase 29 Fix — 투자의견 카드 미노출, 소스 로딩 UX 부재, 소스 날짜 오정렬, 종목 오염 차단 미비

---

## 1. 증권사 투자의견 카드가 왜 항상 안 보이는가?

`src/components/report/analyst-opinion-card.tsx` 77번 줄에 다음 조건이 있었다.

```typescript
if (!loading && !error && !hasData) return null;
```

KIS `FHKST66430300`이 빈 `items` 배열을 반환하면 (`rt_cd === "0"` 이지만 데이터 없음, 또는 미지원 종목), API route는 항상 `{ ok: true, data: { items: [], ... } }` 형태로 응답한다. 이 경우 `error` 상태가 아니면서 `hasData = false`가 되어 카드 전체가 `null`로 사라졌다.

결과적으로:
- KIS 미지원 종목 → 카드 없음
- 데이터 없음 → 카드 없음
- 로딩 중 → 카드 없음 (초기 `data = null`)
- 정상 데이터 → 카드 있음

사용자 입장에서는 카드가 있는지 없는지도 알 수 없는 상태였다.

## 2. AI 분석 근거 소스 카드가 왜 로딩 중에 사라지는가?

`src/components/report/source-list-card.tsx` 90번 줄:

```typescript
if (sources.length === 0) return null;
```

컴포넌트 마운트 직후 `sources = []` (초기값)이므로 데이터를 받기 전까지 카드 전체가 렌더링되지 않았다. 로딩 상태(`loading`) 자체가 없어 skeleton도 없고, 에러 상태도 없었다.

또한:
- 데이터가 없을 때 사용자에게 명시적 상태 없이 카드가 그냥 사라짐
- 제목("AI 분석 근거 소스")을 로딩 전에 보여줄 수 없음

## 3. AI 분석 근거 소스 날짜 정렬이 왜 최신순이 아닌가?

`/api/stocks/[symbol]/sources` route의 DB 경로가 `quality_score` 내림차순으로만 정렬하고 있었다.

```typescript
.order("quality_score", { ascending: false })
```

`publishedAt` 기준 정렬이 없어 최신 공시나 뉴스가 품질 점수가 낮으면 뒤로 밀렸다. "더 보기"로 불러온 소스들이 날짜 역순이 아닌 품질 역순으로 노출되는 문제.

또한 `/api/stocks/[symbol]/issues` 경로(초기 소스 로드)는 DB 캐시 경로에서 `quality_score` 순 반환 → `source-list-card.tsx`가 별도 정렬 없이 그대로 표시했다.

## 4. LIG디펜스앤에어로스페이스처럼 영문+한글 혼합 이름에서 오염이 왜 차단되지 않는가?

`src/server/research/pipeline/normalize.ts`의 prefix 매칭 로직:

```typescript
if (HANGUL_RE.test(nameLower)) {
  const prefixLen = nameLower.length >= 4 ? 3 : 2;
  const prefix = nameLower.slice(0, prefixLen);  // "lig" ← 한글 없음
  if (titleLower.includes(prefix) ...) return true;
}
```

`HANGUL_RE.test("lig디펜스앤에어로스페이스")` → `true` (한글 포함)  
`prefix = "lig"` (앞 3자) — 한글이 전혀 없는 라틴 prefix

"lig"는 "lignite", "ligate" 등 영문 기사에서도 등장하는 문자열로, 관련 없는 기사가 통과하는 경로가 생겼다. Phase 29에서 2→3자 prefix 강화를 했으나 혼합 이름 케이스는 누락됐다.

## 5. DB 캐시 경로에서 관련성 필터가 왜 적용되지 않는가?

`src/server/research/model-router.ts`의 DB-first 경로:

```typescript
if (recentSources && recentSources.length >= 3) {
  const clusters = rankAndCluster(recentSources);
  const sources = recentSources.map(s => ({ ...s, generatedAt: s.publishedAt })) as any[];
  return { clusters, sources };  // normalizeSources 통과 없이 바로 반환
}
```

DB에 캐시된 소스는 `normalizeSources`의 회사명 관련성 필터를 통과하지 않았다. Phase 29 이전에 저장된 오염 소스가 TTL(1시간) 내에 있으면 필터 없이 그대로 반환됐다.

## 6. 어떤 가드레일이 회귀하면 안 되는가?

- intraday 차트 비노출: `NEXT_PUBLIC_ENABLE_INTRADAY_CHART === '1'` 플래그 제어
- 명시적 저장 정책: 사용자 액션 없이 자동 DB 저장 금지
- mock 데이터 실경로 차단: `_isMock: true` 소스는 `normalizeSources`에서 필터
- AI 요약·원문 출처 분리: `basisSourceIds` 없는 AI 텍스트는 `is_fallback` 표시
- source pagination: PAGE_SIZE=5 유지

## Phase 30에서 새로 다뤄도 되는 범위

- `stock_master`에 KIS 업종코드 컬럼 추가 → 섹터 매핑 정확도 개선
- `RelationType` 확장: `supply_chain`, `disclosure_linked` 실데이터 연결
- 클라이언트 컴포넌트 RSC props 전환 (Phase 28 Phase 2 설계)
- `/api/stocks/names?symbols=...` 배치 조회 API (Watchlist/Bookmarks 효율화)

## Phase 30에서 건드리면 안 되는 범위

- intraday 차트 재오픈
- `normalizeSources` MAX_AGE_DAYS 14일 이하로 축소
- `home-cache.ts` TTL 구조 (15분 + 5분 stale window)
- relevance 임계값 대폭 완화
