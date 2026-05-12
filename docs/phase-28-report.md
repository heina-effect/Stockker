# Phase 28 리포트 — 테마 전역화, 정규 섹터 라우팅, 홈 카드 정합성

**날짜:** 2026-05-12  
**상태:** 완료

---

## 요약

Phase 28은 Phase 27 문서가 완료로 표시했지만 런타임에서 여전히 어긋나던 영역을 좁게 수리했다.

1. 전역 theme token contract를 추가해 light / dark / system이 앱 표면 전체에 적용되도록 수정
2. 홈 섹터 데이터를 canonical `SECTOR_UNIVERSE` 기준으로 정규화
3. 홈 트렌딩 종목 카드를 전체 클릭 가능한 링크로 변경
4. 의미가 불명확한 AI 생성 percent를 `sourceCount` 근거 metric으로 교체
5. 홈 섹터 schema를 `trendingSectors` 중심으로 강화
6. production fallback에서 mock market claims가 노출되지 않도록 차단

## 주요 변경

### Theme System

- `globals.css`에 light/dark token set을 정의하고 Tailwind inline colors로 매핑했다.
- `body`와 모든 주요 page root가 `bg-background text-foreground`를 소비한다.
- 헤더 theme control은 light / dark / system 3개 버튼으로 분리해 현재 동작을 명확히 했다.
- `@media (prefers-color-scheme: dark)` 토큰 override를 제거해 `next-themes` class가 단일 제어점이 되게 했다.

### Canonical Sector Routing

- `src/data/sectors/taxonomy.ts`에 `SectorId`, `isSectorId`, `resolveSectorId`, `getSectorById`를 추가했다.
- `home-intelligence-normalizer.ts`가 AI output의 `sectorId/id/name/alias`를 canonical ID로 매핑하고, 매핑 불가 섹터를 렌더링 전에 제거한다.
- 홈 섹터 카드는 `sector.sectorId`만 route slug로 사용한다.
- `trendingSectors`와 legacy `sectors`를 같은 normalized 배열로 반환해 기존 UI 호환성을 유지했다.

### Home Card UX

- `TrendStocksCard`는 카드 전체가 `/stocks/[symbol]` 링크다.
- 우측 상단 metric은 `changeRate`가 아니라 `근거 N건`이다.
- `TrendSectorsCard`는 `whyNow`, `sourceCount`, `representativeSymbols`를 표시하고 “대표 종목”/“주도주” 중복 표현을 하나의 “주도주” 영역으로 정리했다.

### Intelligence Clarity

- 홈 AI prompt는 `trendingSectors` schema를 요구한다: `sectorId`, `name`, `whyNow`, `representativeSymbols`, `sourceCount`, `trendStrength`, `basisSourceIds`.
- 섹터 상세 AI prompt는 canonical member list 안에서만 leaders/laggards/watch candidates를 고르도록 강화했다.
- production에서 홈 인텔리전스 생성 실패 시 mock 종목/섹터 claims를 반환하지 않고 빈 배열 + fallback meta를 반환한다.

## 보존된 가드레일

- 홈 single-fetch 구조 유지: 카드별 AI/fetch 호출 없음
- 인트라데이 hidden 유지: `NEXT_PUBLIC_ENABLE_INTRADAY_CHART === '1'`일 때만 당일 버튼 노출
- detail-entry DB-first snapshot / in-flight dedupe 유지
- source pagination 유지
- explicit save-only 정책 유지
- AI summary와 raw source list 분리 유지

## 검증

- `npm run typecheck` PASS
- Focused Vitest PASS:
  - theme contract
  - theme control
  - canonical sector helpers
  - home intelligence normalizer
  - full-card trending stock click
  - invalid sector link filtering
  - recent-search focus regression
  - source pagination
  - intraday hidden
  - detail-entry guard

최종 검증으로 `npm install`, `npm run lint`, `npm run typecheck`, `npm run build`, `npm run validate`, `npm run test:contracts`, `npm run test:workflows`, focused Vitest suite, and `npm run dev`를 실행한다.

## 변경 파일 요약

- Theme: `src/app/globals.css`, `src/app/layout.tsx`, page roots, `dashboard-header.tsx`
- Sector routing: `src/data/sectors/taxonomy.ts`, `src/server/ai/home-intelligence-normalizer.ts`, `src/server/ai/home-cache.ts`, `src/server/ai/orchestrator.ts`
- Home cards: `trend-stocks-card.tsx`, `trend-sectors-card.tsx`
- Tests: focused regression coverage across theme, sectors, home cards, source pagination, intraday, and detail-entry guards
