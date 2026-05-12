# Phase 28 감사 보고서 — 테마 표면, 정규 섹터 라우팅, 홈 카드 런타임 정합성

**날짜:** 2026-05-12  
**범위:** Phase 27 이후에도 문서와 런타임이 어긋나는 테마 적용, 홈 섹터/종목 카드, 홈 인텔리전스 스키마, 보존 가드레일

---

## 1. 왜 다크 모드가 전체 앱 표면이 아니라 일부 스크롤 영역만 바뀌는가?

`next-themes`와 Tailwind v4의 `.dark` variant 연결 자체는 Phase 27에서 추가되어 있다. 그러나 전역 표면은 여전히 완전한 테마 토큰 시스템이 아니다.

- `src/app/globals.css`의 `:root` 토큰은 `--background`, `--foreground`만 정의하고, `@media (prefers-color-scheme: dark)`로 OS 설정에 직접 반응한다.
- `src/app/layout.tsx`의 `body`는 `bg-background text-foreground`를 소비하지 않는다.
- 주요 페이지 루트가 `bg-[#F2F4F6] dark:bg-zinc-950`처럼 개별 색상 유틸리티를 직접 사용한다.
- 카드/드롭다운/스크롤 내부는 각 컴포넌트의 `dark:` 클래스에만 의존한다.

결과적으로 테마 상태는 바뀌지만 앱 전체 표면이 하나의 전역 토큰을 따라 움직이지 않고, 특정 카드나 스크롤 내부처럼 `dark:`가 직접 붙은 영역만 바뀌어 보인다.

## 2. 어떤 루트 컨테이너가 테마 클래스/토큰을 올바르게 소비하지 않는가?

수정 대상 루트는 다음과 같다.

- `html`, `body`: `ThemeProvider`가 `html` 클래스를 제어하지만 `body`가 전역 배경/전경 토큰을 소비하지 않는다.
- 앱 페이지 루트: `src/app/page.tsx`, `src/app/stocks/[symbol]/page.tsx`, `src/app/sectors/[sectorId]/page.tsx`, `src/app/workflows/*/page.tsx`.
- 공통 상단 바: `src/components/home/dashboard-header.tsx`가 개별 white/zinc 배경에 의존한다.
- 카드/섹션/드롭다운/배지/스크롤 컨테이너: 대부분 자체 `bg-white dark:bg-zinc-900` 조합을 쓰며, 전역 토큰 계약이 얕다.

## 3. 섹터 카드는 현재 AI 출력에서 어떻게 만들어지는가?

홈은 `HomeIntelligenceProvider`가 `/api/home/intelligence`를 한 번 호출하고, `TrendSectorsCard`가 `data?.sectors || []`를 렌더링한다.

현재 카드는 AI가 만든 `sector.id`, `sector.name`, `sector.description || sector.reason`, `sector.leaders`를 그대로 사용한다. 아이콘만 `SECTOR_UNIVERSE[sector.id]`에서 조회하고, 링크도 `/sectors/${sector.id}`로 만든다.

## 4. 섹터 ID는 어디서 잘못되거나 얕아지는가?

`src/server/ai/orchestrator.ts`의 홈 인텔리전스 Stage 1은 `trendingThemes`와 `sectorMomentum`을 생성한다. Stage 2는 `sectors` 배열을 생성하지만 정규화 계층 없이 AI 출력 형태를 런타임에 넘긴다.

`src/server/ai/home-cache.ts`는 `fresh.sectors`와 `aiPicks`의 invalid sector ID를 필터링하지만, 이름/alias를 정규 ID로 매핑하지는 않는다. 따라서 AI가 `방산`, `조선`, `sec-defense`처럼 `SECTOR_UNIVERSE` 밖의 값을 만들면 카드가 사라지거나, 정규 ID가 아닌 얕은 값이 UI까지 도달할 수 있다.

## 5. 왜 작은 섹터 집합만 홈에 노출되는가?

- `SECTOR_UNIVERSE` 자체가 현재 7개 섹터로 제한되어 있다.
- 홈 프롬프트 limit이 3 sectors이고 fallback mock은 반도체 1개만 반환한다.
- invalid sector ID는 필터링되어 사라지지만 canonical alias mapping은 없다.
- 최근 소스가 canonical sector member symbols 기준으로 집계되지 않아 `sourceCount`, 대표 종목, 왜 지금 중요한지의 근거가 약하다.
- Stage 1의 `trendingThemes`는 free text라 Stage 2에서 canonical routing 신호로 안정적으로 쓰이지 않는다.

## 6. 트렌딩 종목 카드는 현재 어떻게 네비게이션되는가?

`src/components/home/trend-stocks-card.tsx`에서 카드 전체는 `<div>`이고, 종목명 `<Link href="/stocks/{symbol}">`만 클릭 가능하다. 카드의 reason, metric, 빈 공간은 클릭 대상이 아니며 키보드 포커스도 제목 링크에만 잡힌다.

## 7. 우측 상단 퍼센트는 현재 무엇을 의미하는가?

우측 상단 퍼센트는 `stock.changeRate`이다. 이 값은 홈 AI 프롬프트가 생성한 숫자이며, `useLiveMarket()`의 실시간 등락률도 아니고 특정 출처 수나 근거 강도도 아니다. 홈의 "지금 주목받는 종목" 카드에서는 가격 지표처럼 보이지만 실제로는 소스 기반 의미가 불명확하다.

## 8. 어떤 문서가 완료됐다고 말하지만 런타임이 아직 어긋나는가?

- `docs/phase-26-report.md`: `ThemeProvider` 추가와 3-way 테마 지속성을 완료로 기록했다.
- `docs/phase-27-report.md`: Tailwind v4 `.dark` 연동으로 테마가 실제 작동하고, 섹터 404가 제거됐다고 기록했다.
- `docs/architecture.md`: 테마 시스템이 모든 페이지에 자동 적용되고, 홈 AI 섹터 출력이 유효 ID로 필터링된다고 설명한다.
- `README.md`: Phase 27을 현재 완료 상태로 소개하며 "테마 실제 적용"과 "섹터 404 제거"를 완료 항목으로 표시한다.

런타임 기준으로는 전역 테마 토큰, canonical sector normalization, 홈 카드 클릭 영역, 홈 종목 metric semantics가 아직 부족하다.

## 보존해야 할 가드레일 확인

- 홈 단일 fetch 구조는 `HomeIntelligenceProvider`가 유지한다.
- 인트라데이 차트 버튼은 `NEXT_PUBLIC_ENABLE_INTRADAY_CHART === '1'`일 때만 노출된다.
- 소스 페이지네이션은 `SourceListCard`의 `/api/stocks/[symbol]/sources?page&limit` 경로가 유지한다.
- 상세 진입은 `model-router.ts`의 DB-first snapshot 재사용과 in-flight dedupe가 담당한다.
- 사용자 저장은 `LocalStorageAdapter`의 명시적 액션 중심 모델을 유지한다.
