# 디자인 기준 (c-2 결정, 2026-11-10)

화면 값이 갈라져 있던 다섯 항목의 기준이다. 집계는 `.work/reports/2026-11-10-1026-mock-refs-migration-sql-design-options.md`(가짜 데이터 코드 4개 파일 삭제 뒤 기준)의 값이다. `docs/design-inventory.md`는 2026-11-02 집계라 일부 수치가 낡았다.

이 문서는 새 코드를 쓸 때 고를 값을 정한다. 여기 없는 값(하위 카드 radius, 카드 padding, 구분선 색, 강조·본문 텍스트 색)은 아직 정하지 않았다.

## 1. 최상위 카드 radius — 1.5rem, `rounded-3xl`

- 표기는 `rounded-3xl` 하나로 쓴다. `rounded-[24px]`는 같은 1.5rem이지만 쓰지 않는다.
- 공용 컴포넌트 `src/components/common/surface-card.tsx`가 이 값을 가진다. 새 최상위 카드는 가능하면 SurfaceCard를 쓴다.
- 결정 당시 분포: `rounded-3xl`(SurfaceCard 29곳), `rounded-[24px]` 14곳 / 8파일, `rounded-2xl` 4곳 / 2파일, shadcn `ui/card.tsx` 기본 `rounded-xl` 1곳.
- 적용: `rounded-[24px]` 14곳 → `rounded-3xl`(렌더 결과 동일), tracking 페이지 `rounded-2xl` 3곳 → `rounded-3xl`, `ui/card.tsx` 기본값 → `rounded-3xl`.
- 예외: `overnight/page.tsx`의 안내 박스(`bg-slate-50` + `border-slate-200`)는 카드가 아니라 안내 영역이라 `rounded-2xl`로 둔다.
- 범위 밖: 하위 카드(리스트 아이템·지표 박스)의 `rounded-xl`·`rounded-2xl`·`rounded-[20px]`·`rounded-lg`는 정하지 않았다.

## 2. 최상위 카드 테두리·그림자 — `border border-transparent shadow-sm`

- 다크 테두리 짝(`dark:border-zinc-800`)도 두지 않는다. SurfaceCard와 같다.
- 결정 당시 분포: 투명 + shadow-sm 33곳, `border-slate-100 dark:border-zinc-800` 8곳 / 4파일(그중 5곳은 그림자 없음), 색 미지정 `border`(`--border` 색) 5곳 / 3파일.
- 적용: slate-100 8곳과 색 미지정 5곳 → 투명 + shadow-sm. 호버 때 테두리 색이 생기는 링크 카드(`hover:border-emerald-200` 등)는 호버 클래스를 그대로 둔다.
- 예외: overnight 안내 박스는 그대로. shadcn `ring-1 ring-foreground/10`(ui/card)과 `border-2 border-slate-200`(orderbook-panel·price-chart)은 화면에 나오는 곳이 없어 건드리지 않았다.

## 3. 텍스트 색 — 보조는 두 단계, 강조·본문은 보류

| 단계 | 라이트 | 용도 |
|---|---|---|
| 보조 | `text-slate-500` (= `text-muted-foreground` 값 `#64748b`) | 설명, 부가 정보, 메타 텍스트 |
| 더 흐림 | `text-slate-400` | 라벨, 빈 상태, 비활성 아이콘, 자리표시(—), 면책 문구 |

- `text-slate-300`은 쓰지 않는다. 결정 당시 라이트 12곳은 모두 "더 흐림" 역할이라 `slate-400`으로 옮겼다.
- `text-muted-foreground`는 값이 `slate-500`과 같아 "보조" 단계로 본다. 9곳 중 7곳이 shadcn `ui/` 내부이고, 토큰을 slate로 되돌리지 않는다.
- 다크 짝은 이번에 정하지 않았다. 지금 쓰이는 짝: slate-500 → zinc-400 / zinc-500, slate-400 → zinc-500 / zinc-600.
- 결정 당시 분포: slate-400 140 / 30파일, slate-500 95 / 26파일, slate-300 11 / 7파일, muted-foreground 9 / 7파일.

**보류 — 강조(slate-900 51 / slate-800 19 / foreground 28)와 본문(slate-600 35 / slate-700 24).**
- `text-foreground`를 slate로 되돌리는 방향은 c-3 결정(전면 시맨틱화는 권장하지 않음)과 부딪힌다. 반대로 slate를 토큰으로 옮기는 것도 같은 결정에 걸린다.
- slate 값을 하나로 줄이면 다크 짝을 지점마다 붙여야 해서 범위가 이번 항목들보다 크다.

## 4. 등락 색 — 상승 `red-500`, 하락 `blue-500`

- 국내 관례(상승 빨강, 하락 파랑)다. 보합은 회색(`text-slate-500`)이다.
- 차트 hex `#ef4444` / `#3b82f6`은 red-500 / blue-500과 같은 색이라 그대로 둔다.
- 다크 변형이 붙은 곳(`dark:text-red-400` / `dark:text-blue-400`, stock-report-header)은 그대로 둔다.
- 적용: overnight 추적 페이지의 `rose-500` → `red-500`, analyst-opinion-card의 `red-400`/`blue-400` → `red-500`/`blue-500`.
- 등락이 아닌 같은 계열 색은 이 기준의 대상이 아니다: 감성 점(issue-timeline-card), 장 상태 배지(market-utils), 탈락 사유·경고의 rose/red.

## 5. 작은 글자 — 두 단계, `text-xs`(12px)와 `text-[10px]`(10px)

- 12px 미만은 `text-[10px]` 하나만 쓴다. `text-[11px]`, `text-[9px]`, `text-[8px]`는 쓰지 않는다.
- 결정 당시 분포: text-xs 136 / 38파일, `[10px]` 83 / 29파일, `[11px]` 19 / 4파일, `[9px]` 17 / 9파일, `[8px]` 1 / 1파일.
- 적용: `[11px]` 19곳 → `text-xs`, `[9px]` 17곳과 `[8px]` 1곳 → `text-[10px]`.
- 예외: `ui/button.tsx`의 `text-[0.8rem]`은 shadcn 내부라 그대로.
