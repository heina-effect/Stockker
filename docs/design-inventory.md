# 디자인 현황 인벤토리

> 2026-11-02 기준 집계이며 이후 삭제·수정으로 일부 수치가 낡음. 최신 집계는 .work/reports/2026-11-10-1026 참조.

> 작성일 2026-11-02 · 읽기 전용 집계 · 코드 수정 없음
> 이 문서는 "지금 실제로 쓰이는 것"만 기록한다. 규칙 제안이나 어느 값이 맞는지에 대한 판단은 담지 않는다.

## 0. 집계 방법

- 대상: `src/` 아래 `.ts`/`.tsx` 151개 파일(테스트 파일 제외). className 을 가진 `.tsx` 파일은 54개.
- 방식: 소스의 문자열 리터럴(`"…"`, `'…'`, 템플릿 리터럴)을 공백으로 쪼개 Tailwind 유틸리티 형태인 토큰만 셌다. `cn()`·조건부 클래스·`lib/market-utils.ts` 같은 헬퍼가 반환하는 문자열도 포함된다.
- `dark:`, `hover:`, `md:` 같은 변형 접두는 떼어내고 기본 유틸리티로 합산했다. 예를 들어 `dark:bg-zinc-900` 은 `bg-zinc-900` 1회로 잡힌다. 다크 전용 사용량은 6절에 따로 적었다.
- 한계: 정적 분석이라 렌더 횟수가 아니라 "코드에 적힌 횟수"다. 단독 `border`·`rounded` 처럼 일반 단어와 겹치는 토큰은 극소수의 오탐이 섞였을 수 있다.

---

## 1. 설정 파일에서 선언된 것

### 1-1. Tailwind 설정 파일

- `tailwind.config.*` 는 **존재하지 않는다.** Tailwind v4(`tailwindcss@^4.3.3`, `@tailwindcss/postcss`)를 쓰며, 테마 확장은 전부 `src/app/globals.css` 의 `@theme inline` 블록에서 이뤄진다.
- `components.json`(shadcn): style `base-nova`, baseColor `neutral`, cssVariables 사용, 아이콘 `lucide`.
- 커스텀 간격·radius·shadow 선언은 **없다.** 모두 Tailwind 기본 스케일을 쓴다. (`components/ui/*` 일부가 `var(--radius-md)` 를 참조하는데, 이는 Tailwind 기본 테마 변수다.)

### 1-2. globals.css CSS 변수

`@custom-variant dark (&:where(.dark, .dark *))` 로 next-themes 의 `.dark` 클래스에 `dark:` 가 반응하게 되어 있다.

| 변수 | 라이트 (`:root, .light`) | 다크 (`.dark`) |
|---|---|---|
| `--background` | `#f2f4f6` | `#09090b` |
| `--foreground` | `#0f172a` | `#f4f4f5` |
| `--card` | `#ffffff` | `#18181b` |
| `--card-foreground` | `#0f172a` | `#f4f4f5` |
| `--popover` | `#ffffff` | `#18181b` |
| `--popover-foreground` | `#0f172a` | `#f4f4f5` |
| `--muted` | `#f1f5f9` | `#27272a` |
| `--muted-foreground` | `#64748b` | `#a1a1aa` |
| `--border` | `#e2e8f0` | `#27272a` |
| `--input` | `#e2e8f0` | `#3f3f46` |
| `--ring` | `#6366f1` | `#818cf8` |
| `--primary` | `#4f46e5` | `#6366f1` |
| `--primary-foreground` | `#ffffff` | `#ffffff` |
| `--secondary` | `#f1f5f9` | `#27272a` |
| `--secondary-foreground` | `#0f172a` | `#f4f4f5` |
| `--destructive` | `#dc2626` | `#f87171` |

라이트 값은 slate 계열 hex(`#0f172a`=slate-900, `#64748b`=slate-500, `#e2e8f0`=slate-200 등), 다크 값은 zinc 계열 hex(`#18181b`=zinc-900, `#27272a`=zinc-800, `#a1a1aa`=zinc-400 등)와 일치한다.

폰트: `--font-sans`(시스템 산세리프 + Noto Sans KR), `--font-mono`(SFMono 계열). `body` 규칙에는 `font-family: Arial, Helvetica, sans-serif` 가 별도로 적혀 있으나, `layout.tsx` 의 `<body>` 에 `font-sans` 클래스가 붙어 있어 실제로는 클래스 쪽이 적용된다.

그 외 커스텀 클래스: `.no-scrollbar` 1개.

### 1-3. 선언 대비 실제 사용 — 시맨틱 토큰 사용 횟수

`text-*/bg-*/border-*/ring-*` 등으로 토큰 이름을 직접 쓴 횟수. `components/ui/`(shadcn 원본) 안과 밖을 나눴다.

| 토큰 | ui/ 밖 | ui/ 안 | 비고 |
|---|---|---|---|
| background | 18 | 4 | |
| foreground | 16 | 18 | |
| muted | 7 | 14 | |
| border | 2 | 4 | |
| card | 1 | 1 | |
| muted-foreground | 1 | 8 | |
| destructive | 0 | 25 | **ui/ 밖 사용 없음** |
| ring | 0 | 10 | **ui/ 밖 사용 없음** |
| input | 0 | 9 | **ui/ 밖 사용 없음** |
| primary | 0 | 6 | **ui/ 밖 사용 없음** |
| secondary | 0 | 5 | **ui/ 밖 사용 없음** |
| secondary-foreground | 0 | 3 | **ui/ 밖 사용 없음** |
| primary-foreground | 0 | 2 | **ui/ 밖 사용 없음** |
| card-foreground | 0 | 1 | **ui/ 밖 사용 없음** (ui/card.tsx 1회) |
| popover | 0 | 0 | **어디서도 안 쓰임** |
| popover-foreground | 0 | 0 | **어디서도 안 쓰임** |

shadcn `ui/` 컴포넌트 자체도 앱에서 쓰이는 것은 소수다: `button`(4곳), `card`(4곳), `badge`·`table`·`tooltip`(각 2곳), `sonner`(1곳). `input`, `tabs`, `sheet`, `scroll-area`, `separator`, `skeleton` 은 ui/ 밖 import 가 없다.

앱 화면 대부분은 시맨틱 토큰 대신 `slate-*`(라이트)/`zinc-*`(다크) 원색 팔레트를 직접 쓴다(2절 참고).

---

## 2. 실제 사용 빈도

각 카테고리: **고유값 개수 / 총 사용 횟수**, 그리고 상위 값.

### 2-1. 색 — 텍스트 (`text-{color}`)

**고유값 90 / 총 964**

| 순위 | 값 | 횟수 |
|---|---|---|
| 1 | text-slate-400 | 140 |
| 2 | text-slate-500 | 81 |
| 3 | text-zinc-500 | 72 |
| 4 | text-zinc-400 | 60 |
| 5 | text-slate-900 | 48 |
| 6 | text-zinc-50 | 41 |
| 7 | text-indigo-600 | 35 |
| 8 | text-slate-600 | 31 |
| 9 | text-indigo-400 | 31 |
| 10 | text-zinc-300 | 31 |

계열별 묶음:

| 계열 | 고유값 | 총 횟수 | 주 용도 |
|---|---|---|---|
| slate | 9 (100~900) | 379 | 라이트 모드 텍스트 |
| zinc | 9 (50~700) | 247 | 다크 모드 텍스트(거의 전부 `dark:`) |
| indigo | 9 | 129 | 강조·링크·아이콘 |
| amber | 8 | 51 | 경고·주의 |
| rose / red | 6 / 6 | 43 / 19 | 하락·위험 (두 계열 병존) |
| blue | 7 | 36 | 상승(국내 관례 색) 등 |
| emerald / green / teal | 8 / 4 / 6 | 25 / 9 / 22 | 긍정·섹터 신호 (세 계열 병존) |
| 시맨틱 토큰 | 9 | 47 | foreground 27, muted-foreground 9 등 |
| 기타 (yellow, purple, violet, sky, orange, cyan, white, transparent) | — | 약 40 | |

`gray-*`, `neutral-*` 계열은 **0회**.

### 2-2. 색 — 배경 (`bg-*`)

**고유값 154 / 총 691** (색 외 `bg-clip-*`, `bg-gradient-*` 4종 포함)

| 순위 | 값 | 횟수 |
|---|---|---|
| 1 | bg-zinc-800 | 72 |
| 2 | bg-white | 59 |
| 3 | bg-zinc-900 | 57 |
| 4 | bg-slate-100 | 56 |
| 5 | bg-slate-50 | 52 |
| 6 | bg-zinc-950 | 37 |
| 7 | bg-background | 17 |
| 8 | bg-slate-200 | 16 |
| 9 | bg-indigo-50 | 14 |
| 10 | bg-muted | 10 |

고유값이 많은 이유는 투명도 변형이다. 예: indigo 배경만 `bg-indigo-50`, `/30`, `/50`, `/60`, `bg-indigo-100`, `/60`, `bg-indigo-900/10`, `/20`, `/30`, `/40`, `bg-indigo-950/20`, `/30` … 식으로 갈라진다. 1회만 쓰인 배경값이 약 70개다.

참고: `bg-zinc-850`(issue-timeline-card.tsx:56)은 Tailwind 기본 팔레트에 없는 값이다.

### 2-3. 색 — 테두리 (`border-{color}`)

**고유값 60 / 총 276**

| 순위 | 값 | 횟수 |
|---|---|---|
| 1 | border-zinc-800 | 55 |
| 2 | border-transparent | 43 |
| 3 | border-slate-100 | 42 |
| 4 | border-slate-200 | 21 |
| 5 | border-slate-300 | 6 |
| 6 | border-indigo-100 | 6 |
| 7 | border-amber-200 | 5 |
| 8 | border-zinc-800/80 | 5 |
| 9 | border-indigo-500 | 5 |
| 10 | border-zinc-700 | 4 |

`border-border`(시맨틱)는 4회.

### 2-4. 타이포 — 크기

**고유값 13 / 총 428**

| 값 | 횟수 |
|---|---|
| text-sm | 130 |
| text-xs | 126 |
| text-[10px] | 86 |
| text-lg | 21 |
| text-[9px] | 17 |
| text-[11px] | 14 |
| text-3xl | 9 |
| text-2xl | 8 |
| text-4xl | 5 |
| text-base | 5 |
| text-xl | 5 |
| text-[0.8rem] | 1 |
| text-[8px] | 1 |

임의값(`text-[Npx]`)이 5종 119회로, 전체 크기 지정의 약 28%다. 12px(`text-xs`) 미만 크기가 `[11px]`·`[10px]`·`[9px]`·`[8px]` 네 단계로 존재한다.

### 2-5. 타이포 — 굵기

**고유값 6 / 총 254**

| 값 | 횟수 |
|---|---|
| font-bold | 123 |
| font-semibold | 64 |
| font-medium | 53 |
| font-normal | 8 |
| font-extrabold | 5 |
| font-black | 1 |

그 외 `font-mono` 43회(숫자·티커 표시), `leading-relaxed` 27, `tracking-tight` 8, `leading-tight` 5.

### 2-6. 간격

| 카테고리 | 고유값 | 총 횟수 | 상위 10 |
|---|---|---|---|
| padding (p/px/py/pt/pb/pl/pr) | 58 | 507 | px-2 57, py-0.5 47, py-1.5 38, p-6 37, px-4 26, px-1.5 26, p-3 23, p-4 22, py-1 20, py-2 19 |
| gap | 10 | 259 | gap-2 86, gap-1 43, gap-3 38, gap-1.5 34, gap-4 28, gap-6 12, gap-0.5 11, gap-5 4, gap-8 2, gap-12 1 |
| margin (m/mx/my/mt/mb/ml/mr) | 29 | 296 | mb-2 43, mb-1 35, mb-4 33, mt-1 29, mt-0.5 21, mb-3 18, mx-auto 17, mb-6 14, mt-4 14, mt-2 13 |
| space-y / space-x | 7 | 11 | space-y-3 3, space-y-1.5 3, 나머지 1회씩 |

수직 리듬은 `space-y-*` 보다 `flex flex-col gap-*` 과 `mb-*` 로 주로 잡혀 있다. 임의값 padding 은 `p-[3px]` 1회뿐이다.

### 2-7. 모서리

**고유값 19 / 총 307**

| 순위 | 값 | 횟수 |
|---|---|---|
| 1 | rounded (=0.25rem) | 88 |
| 2 | rounded-full | 57 |
| 3 | rounded-[24px] | 43 |
| 4 | rounded-xl | 35 |
| 5 | rounded-2xl | 29 |
| 6 | rounded-lg | 27 |
| 7 | rounded-md | 6 |
| 8 | rounded-b-xl | 4 |
| 9 | rounded-[20px] | 3 |
| 10 | rounded-3xl / rounded-t-xl / rounded-sm / rounded-[min(…10px)] / rounded-[min(…12px)] | 각 2 |

나머지 1회: rounded-none, rounded-[inherit], rounded-[2px], rounded-4xl, rounded-bl-full.
`rounded-[24px]`(=1.5rem)는 기본 스케일 `rounded-3xl` 과 같은 값인데 두 표기가 공존한다.

### 2-8. 테두리 두께·그림자

| 카테고리 | 고유값 | 총 횟수 | 값 |
|---|---|---|---|
| border 두께/방향 | 14 | 177 | border 107, border-t 25, border-b 15, border-2 9, border-l-2 5, border-b-2 3, border-0 3, border-b-0 3, border-l 2, border-t-0 1, border-t-4 1, border-r 1, border-y-2 1, border-l-4 1 |
| border 스타일 | 2 | 8 | border-dashed 5, border-collapse 3 |
| shadow | 6 | 67 | shadow-sm 52, shadow-lg 8, shadow-md 3, shadow-none 2, shadow-blue-200 1, shadow-blue-900/20 1 |
| ring | 33 | 58 | ring-ring/50 5, ring-destructive/20 5, ring-destructive/40 5, ring-1 4, ring-3 4, ring-[3px] 3, … (대부분 ui/ 와 배지형 칩) |
| divide | 3 | 3 | divide-y 1, divide-slate-100 1, divide-zinc-800 1 |

`hover:shadow-md` 가 카드 호버 효과로 쓰인다(overnight 계열).

### 2-9. 하드코딩 색 (hex)

className 이 아닌 차트 라이브러리 옵션 등에 hex 8종 19회: `#ef4444` 5, `#3b82f6` 5, `#888888` 2, `#eab308` 2, `#a855f7` 2, `#e2e8f0` 1, `#e11d48` 1, `#2563eb` 1. 전부 차트 컴포넌트 5개(intraday-candlestick-chart, price-chart, daily-candlestick-chart-card, simple-line-chart-card, intraday-price-bar-chart) 안에 있다. 인라인 `style={{…}}` 은 3곳.

---

## 3. 다크모드

- `dark:` 접두 클래스 **총 789회, 고유값 153**. className 을 가진 tsx 54개 중 **43개 파일**에서 쓰인다.
- `dark:` 가 없는 파일: `layout.tsx`, `ui/` 의 card·tooltip·sonner·scroll-area·sheet·table·separator·skeleton(이들은 CSS 변수로 다크 대응), `home-intelligence-provider.tsx`(개발용 오버레이), `dashboard/watchlist-panel.tsx`, `dashboard/connection-status.tsx`.
- 사용량 상위 파일: `overnight/tracking/page.tsx` 111, `overnight/page.tsx` 80, `sector-ai-section.tsx` 55, `analyst-opinion-card.tsx` 51, `source-list-card.tsx` 43, `overnight-screening-card.tsx` 34, `sentiment-score-card.tsx` 34.
- 방식: 대부분 "라이트는 slate 원색 + `dark:` 로 zinc 원색" 쌍이다. 시맨틱 변수에 맡기는 방식은 `ui/` 와 헤더류에 한정된다.
- 라이트↔다크 텍스트 짝 (같은 className 안):

| 라이트 | 다크 | 횟수 |
|---|---|---|
| text-slate-400 | dark:text-zinc-500 | 69 |
| text-slate-500 | dark:text-zinc-400 | 45 |
| text-slate-900 | dark:text-zinc-50 | 41 |
| text-slate-600 | dark:text-zinc-400 | 16 |
| text-slate-700 | dark:text-zinc-300 | 16 |
| text-slate-600 | dark:text-zinc-300 | 13 |
| text-slate-800 | dark:text-zinc-200 | 10 |
| text-slate-800 | dark:text-zinc-100 | 6 |
| text-slate-400 | dark:text-zinc-600 | 5 |
| text-slate-900 | dark:text-zinc-100 | 5 |
| (dark 짝이 slate 인 경우) | dark:text-slate-100/300/400/500 | 6 |

- 다크 짝이 **없는** 회색 텍스트: text-slate-400 65회, text-slate-500 37회, text-slate-300 7회, text-slate-600 1회.
  - (정정, c-1 단계) 최초 집계는 "slate-400 64 / slate-500 38 / slate-300 7 / slate-900 2 / slate-600 1"이었으나, 다크 짝을 회색 계열(`dark:text-zinc-*` 등)로만 인정하고 템플릿 리터럴 안 따옴표를 토큰에 붙인 채 셌던 오류가 있었다. `dark:text-white` 등 모든 `dark:text-{색}` 을 짝으로 인정하고 다시 센 값이 위 숫자다. slate-900 2회는 `dark:text-white` 짝이 있었고(daily-candlestick-chart-card 토글 버튼), 위치 목록은 부록 B-4 참고.

---

## 4. 카드 래퍼 비교

각 컴포넌트의 정상 상태(로딩·빈 상태 제외) 최상위 래퍼 className 원문. 대부분의 카드 컴포넌트는 각각 한 화면에서만 import 되므로(1곳), "많이 쓰이는 것"보다는 화면별 대표 카드를 골랐다.

```
overnight-screening-card.tsx:85    bg-white dark:bg-zinc-900 rounded-[24px] p-6 border border-transparent shadow-sm flex flex-col gap-4 relative overflow-hidden transition-all hover:shadow-md
trend-stocks-card.tsx:28           bg-white dark:bg-zinc-900 rounded-[24px] p-6 border border-transparent shadow-sm flex flex-col h-full
ai-picks-card.tsx:39               bg-gradient-to-br from-indigo-50 to-white dark:from-indigo-950/20 dark:to-zinc-900 rounded-[24px] p-6 border border-transparent shadow-sm flex flex-col h-full
watchlist-aside-card.tsx:72        bg-white dark:bg-zinc-900 rounded-[24px] p-6 border border-transparent shadow-sm h-full flex flex-col
buy-price-plan-card.tsx:93         bg-white dark:bg-zinc-900 rounded-[24px] p-6 shadow-sm border border-transparent relative overflow-hidden
sentiment-score-card.tsx:23        bg-white dark:bg-zinc-900 rounded-[24px] p-6 shadow-sm border border-transparent h-[340px] flex flex-col
analyst-opinion-card.tsx:70        bg-white dark:bg-zinc-900 rounded-[24px] p-6 shadow-sm border border-transparent
stock-report-header.tsx:138        bg-white dark:bg-zinc-900 rounded-[24px] p-6 md:p-8 shadow-sm border border-transparent flex flex-col md:flex-row md:items-start justify-between gap-6
sector-market-signal-card.tsx:67   bg-white dark:bg-zinc-900 rounded-[24px] p-5 shadow-sm border border-slate-100 dark:border-zinc-800
sector-ai-section.tsx:37           bg-white dark:bg-zinc-900 rounded-[24px] p-8 border border-slate-100 dark:border-zinc-800 flex flex-col items-center gap-4
```

추가 — 같은 역할을 하는 다른 래퍼들:

```
overnight/page.tsx:307              bg-white dark:bg-zinc-900 rounded-[24px] p-6 border border-transparent shadow-sm flex flex-col justify-between transition-all hover:shadow-md
overnight/tracking/page.tsx:378     bg-white dark:bg-zinc-900 rounded-2xl p-4 border border-transparent shadow-sm
overnight/tracking/page.tsx:508     h-full flex flex-col bg-white dark:bg-zinc-900 rounded-2xl p-4 border border-transparent shadow-sm
overnight/tracking/page.tsx:742     mt-3 bg-white dark:bg-zinc-900 border border-slate-100 dark:border-zinc-800 rounded-2xl p-4 space-y-3 text-sm
overnight/page.tsx:232              bg-slate-50 dark:bg-zinc-900/50 border border-slate-200 dark:border-zinc-800 p-5 rounded-2xl flex items-start gap-4
sectors/[sectorId]/page.tsx:55      bg-slate-50 dark:bg-zinc-900 rounded-[24px] p-5 border border-slate-100 dark:border-zinc-800 text-xs text-slate-500 dark:text-zinc-500 text-center leading-relaxed
watchlist-research-board.tsx:77     bg-white dark:bg-zinc-900 rounded-[24px] p-12 border text-center shadow-sm
bookmarks-research-board.tsx:47     text-center py-20 bg-white dark:bg-zinc-900 rounded-[24px] border shadow-sm px-8
orderbook-panel.tsx:23  <Card>      shadow-sm border-2 border-slate-200 dark:border-zinc-800
price-chart.tsx:23      <Card>      shadow-sm border-2 border-slate-200 dark:border-zinc-800
watchlist-panel.tsx:21  <Card>      h-full shadow-sm
ui/card.tsx (Card 기본)             group/card flex flex-col gap-4 overflow-hidden rounded-xl bg-card py-4 text-sm text-card-foreground ring-1 ring-foreground/10 …
```

카드 내부의 하위 카드(리스트 아이템·지표 박스):

```
ai-picks-card.tsx:63                bg-white dark:bg-zinc-950 p-4 rounded-xl border border-indigo-50 dark:border-indigo-900/20 shadow-sm
source-list-card.tsx:175            flex flex-col gap-1 p-3 rounded-xl bg-slate-50 dark:bg-zinc-950 border border-slate-100 dark:border-zinc-800
overnight/page.tsx:357              grid grid-cols-4 gap-2 bg-slate-50 dark:bg-zinc-950 p-3 rounded-xl mb-4 text-center
analyst-opinion-card.tsx:193        grid grid-cols-3 gap-2 rounded-2xl bg-slate-50 p-3 text-center dark:bg-zinc-950
sector-ai-section.tsx:66            bg-emerald-50 dark:bg-emerald-950/20 rounded-[20px] p-5 border border-emerald-100 dark:border-emerald-900/30
```

---

## 5. 불일치 목록

같은 역할에 서로 다른 값이 쓰이는 지점. 값과 빈도만 적는다.

### 5-1. 카드 padding

`rounded-[24px]` 를 쓰는 최상위 카드 43개 기준 (반응형 변형 제외):

| 값 | 횟수 |
|---|---|
| p-6 | 33 |
| p-5 | 2 |
| p-8 | 2 |
| py-16 | 2 |
| py-20 px-8 | 2 |
| p-6 py-8 | 1 |
| p-12 | 1 |

`rounded-2xl` 최상위 카드(tracking 페이지): p-4. shadcn `<Card>`: py-4 + 내부 px-4.
범위를 넓혀 "둥근 모서리 + 흰/연회색 배경 + padding" 을 가진 박스 82개 전체로 보면: p-6 33, p-3 16, p-4 13, p-5 3, 그 외 12종 각 1~2회.

### 5-2. 카드 radius

최상위 카드: `rounded-[24px]` 43, `rounded-2xl` 4(tracking 페이지·overnight 안내 박스), shadcn `<Card>` 기본 `rounded-xl`.
하위 카드: `rounded-xl` 17, `rounded-2xl` 13 내외, `rounded-[20px]` 3, `rounded-lg` 5.
(`rounded-[24px]` 와 `rounded-3xl` 은 같은 1.5rem 이지만 표기가 다르다.)

### 5-3. 카드 border 색

`rounded-[24px]` 최상위 카드 43개 기준:

| 값 | 횟수 |
|---|---|
| border border-transparent (+ shadow-sm) | 31 |
| border border-slate-100 dark:border-zinc-800 | 7 |
| border (색 미지정 → `--border` 기본색) | 5 |

shadcn `<Card>` 사용처: border 대신 `ring-1 ring-foreground/10`(기본) / `border-2 border-slate-200 dark:border-zinc-800`(orderbook-panel, price-chart) / 지정 없음(watchlist-panel).
그림자도 갈린다: `rounded-[24px]` 카드 중 shadow-sm 있음/없음이 혼재(sector-ai-section 은 없음, sector-market-signal-card 는 있음).

### 5-4. 본문 텍스트 색 / 보조(흐린) 텍스트 색

강한 텍스트(제목·주요 값):

| 값 | 횟수 |
|---|---|
| text-slate-900 | 48 |
| text-foreground | 27 |
| text-slate-800 | 16 |
| text-zinc-700 (라이트 측) | 1 |

일반 본문:

| 값 | 횟수 |
|---|---|
| text-slate-600 | 31 |
| text-slate-700 | 19 |

보조·흐린 텍스트:

| 값 | 횟수 |
|---|---|
| text-slate-400 | 140 |
| text-slate-500 | 81 |
| text-slate-300 | 11 |
| text-muted-foreground | 9 |

다크 쪽 짝도 하나로 고정되지 않는다: slate-600 → zinc-400(16) / zinc-300(13), slate-800 → zinc-200(10) / zinc-100(6), slate-900 → zinc-50(41) / zinc-100(5) / slate-100(2), slate-400 → zinc-500(69) / zinc-600(5). 다크 짝 자체가 없는 경우는 3절 끝 참고.

### 5-5. 구분선 색

`border-t`/`border-b`/`border-l`/`border-r`/`divide-y` 를 쓰는 요소(둥근 박스 제외) 기준:

| 값 | 횟수 |
|---|---|
| border-slate-100 | 19 |
| 색 미지정 (`--border` 기본색 = slate-200 상당) | 9 |
| border-slate-200 | 5 |
| border-slate-50 | 2 |
| border-slate-700 | 1 (개발용 오버레이) |
| border-border | 1 |
| divide-slate-100 | 1 |

다크 쪽은 `dark:border-zinc-800` 이 대부분이고 `zinc-800/80`, `zinc-800/60`, `zinc-700` 이 섞여 있다.

### 5-6. 그 밖에 눈에 띈 같은 역할·다른 값

- 섹션 제목(`h3`): `font-bold text-lg`(trend-* 카드) / `font-bold`(크기 미지정, report 카드) / `font-bold text-sm`(sector-market-signal-card).
- 작은 라벨 텍스트: `text-xs` 126 / `text-[11px]` 14 / `text-[10px]` 86 / `text-[9px]` 17.
- 하락·위험 색: `rose-*` 계열과 `red-*` 계열 병존. 긍정 색: `emerald-*` / `green-*` / `teal-*` 병존.
- 헤더 컴포넌트가 두 개: `home/dashboard-header.tsx`(`border-b border-border bg-card/85 h-16`, 8곳에서 import)와 `dashboard/dashboard-header.tsx`(`border-b bg-background/95 h-14`, 현재 import 0곳).
- 페이지 배경 위 "회색 박스": `bg-slate-50` / `bg-slate-100/50` / `bg-slate-50/30` / `bg-muted` / `bg-muted/50` 등이 혼재.

---

## 6. 전반적 인상

최상위 카드의 골격(`bg-white dark:bg-zinc-900 rounded-[24px] p-6 border border-transparent shadow-sm`)은 홈·리포트 화면에서 꽤 일관되게 복제돼 있어, "카드 하나의 모양"에 대한 암묵적 합의는 존재한다. 다만 그 합의가 토큰이나 공용 컴포넌트가 아니라 복사된 문자열로만 유지되고 있어서, 섹터·overnight 추적·dashboard 화면으로 갈수록 radius(`[24px]`/`2xl`/`xl`), 테두리 처리(투명/slate-100/기본색/ring), padding(p-4~p-12)이 화면 단위로 갈라진다. 색은 slate(라이트)·zinc(다크) 원색을 직접 쓰는 방식이 지배적이고, globals.css 의 시맨틱 변수는 shadcn `ui/` 안에서만 주로 쓰여 실질적으로 두 체계가 병행한다. 회색 텍스트 단계·작은 글자 크기·투명도 변형 배경에서 고유값이 많아, 전체적으로는 "뼈대는 일관되나 세부 값은 산발적인 편"이라는 인상이다.

---

## 부록 B. c-1 결과와 c-2 인계 목록 (2026-11-02)

### B-1. SurfaceCard 로 옮긴 카드 (29곳)

`src/components/common/surface-card.tsx` — 고정 `bg-white dark:bg-zinc-900 rounded-3xl border border-transparent shadow-sm`, `padding` sm/md/lg = p-4/p-6/p-8, `background="none"` 이면 기본 배경 생략(ai-picks-card 그라데이션용). 전후 className 은 tailwind-merge 를 실제로 돌려 집합 비교했고 29곳 모두 동일(`rounded-[24px]`→`rounded-3xl` 만 차이).

overnight/page.tsx(1), watchlist-aside-card(2), overnight-screening-card(3), trend-stocks/issues/sectors-card(각 1), category-preview-card(1), ai-picks-card(1), watchlist-research-board(1), analyst-opinion-card(1), search-hero-card(1), sentiment-score-card(2), daily-candlestick-chart-card(2), simple-line-chart-card(2), intraday-candlestick-chart(2), intraday-price-bar-chart(2), source-list-card(1), issue-timeline-card(1), stock-report-header(1), buy-price-plan-card(1), related-stocks-card(1).

### B-2. 옮기지 않은 `rounded-[24px]` 카드 (14곳) — 사유

| 위치 | 사유 |
|---|---|
| `sector-ai-section.tsx` 13, 37, 94, 164, 230 | 테두리가 `border-slate-100 dark:border-zinc-800` (투명 아님). 13·37·230 은 shadow 도 없음 |
| `sector-market-signal-card.tsx` 67 | 테두리 slate-100 + padding p-5 (prop 스케일에 없음) |
| `sectors/[sectorId]/page.tsx` 55 | 배경 `bg-slate-50`, 테두리 slate-100, p-5 |
| `recent-research-board.tsx` 47, 63 / `bookmarks-research-board.tsx` 47, 63 | 테두리 색 미지정(`border` → `--border` 색). 63 은 `<Link>` 요소이기도 함 |
| `watchlist-research-board.tsx` 78 | 테두리 색 미지정 + p-12 |
| `overnight/page.tsx` 303, `overnight/tracking/page.tsx` 1219 | padding 이 `py-16` 단독(가로 0). 기본 p-6 을 얹으면 가로 패딩이 생겨 시각 변화 발생 |

그 밖에 미이전: tracking 페이지 `rounded-2xl p-4` 카드 3곳(radius·padding 결정 대기), shadcn `<Card>` 사용처(orderbook-panel·price-chart·watchlist-panel — 셋 다 현재 import 0곳), 하위 카드 전부.

### B-3. bg-zinc-850 → `dark:bg-zinc-800/60` 으로 수정 (사용자 결정)

`issue-timeline-card.tsx` 로딩 스켈레톤의 세 번째 막대 `bg-slate-50 dark:bg-zinc-850`. Tailwind 컴파일 결과에 `dark:bg-zinc-850` 규칙이 생성되지 않으므로, 다크에서도 라이트 값 `bg-slate-50`(#f8fafc)이 그대로 남아 zinc-900 카드 위에 밝은 막대로 보인다(투명이 아님). 형제 막대 두 개는 `bg-slate-100 dark:bg-zinc-800`.

### B-4. 다크 짝 없는 회색 텍스트 — c-2 인계 목록

줄 번호는 클래스 문자열(템플릿 리터럴이면 그 시작)이 있는 줄. 총 110회.

| 클래스 | 파일 | 줄 |
|---|---|---|
| `text-slate-400` | `src/app/overnight/tracking/page.tsx` | 214 |
| `text-slate-400` | `src/components/dashboard/market-overview-card.tsx` | 50, 59, 63 |
| `text-slate-400` | `src/components/dashboard/orderbook-panel.tsx` | 54 |
| `text-slate-400` | `src/components/dashboard/price-chart.tsx` | 50, 52 |
| `text-slate-400` | `src/components/home/ai-picks-card.tsx` | 52, 55, 57, 96 |
| `text-slate-400` | `src/components/home/home-intelligence-provider.tsx` | 147 |
| `text-slate-400` | `src/components/home/search-hero-card.tsx` | 107, 212 |
| `text-slate-400` | `src/components/home/trend-sectors-card.tsx` | 52, 54, 105 |
| `text-slate-400` | `src/components/home/trend-stocks-card.tsx` | 38, 40, 61, 67 |
| `text-slate-400` | `src/components/home/watchlist-aside-card.tsx` | 123, 143, 173 |
| `text-slate-400` | `src/components/report/analyst-opinion-card.tsx` | 82, 99, 150, 196, 202, 213, 214, 251 |
| `text-slate-400` | `src/components/report/daily-candlestick-chart-card.tsx` | 236, 278 |
| `text-slate-400` | `src/components/report/intraday-candlestick-chart.tsx` | 22, 57, 92 |
| `text-slate-400` | `src/components/report/intraday-price-bar-chart.tsx` | 21, 60, 91 |
| `text-slate-400` | `src/components/report/issue-timeline-card.tsx` | 44, 64, 70, 84, 88 |
| `text-slate-400` | `src/components/report/related-stocks-card.tsx` | 83, 91, 93, 127 |
| `text-slate-400` | `src/components/report/sentiment-score-card.tsx` | 28, 51, 115, 140 |
| `text-slate-400` | `src/components/report/simple-line-chart-card.tsx` | 20 |
| `text-slate-400` | `src/components/report/source-list-card.tsx` | 252 |
| `text-slate-400` | `src/components/report/stock-report-header.tsx` | 145 |
| `text-slate-400` | `src/components/sectors/sector-market-signal-card.tsx` | 80, 87 |
| `text-slate-400` | `src/components/workflows/bookmarks-research-board.tsx` | 76, 78 |
| `text-slate-400` | `src/components/workflows/recent-research-board.tsx` | 87 |
| `text-slate-400` | `src/components/workflows/watchlist-research-board.tsx` | 100, 107, 123 |
| `text-slate-400` | `src/lib/market-utils.ts` | 39 |
| `text-slate-500` | `src/components/home/ai-picks-card.tsx` | 91 |
| `text-slate-500` | `src/components/home/search-hero-card.tsx` | 137, 161, 164, 202 |
| `text-slate-500` | `src/components/home/watchlist-aside-card.tsx` | 137, 180 |
| `text-slate-500` | `src/components/report/buy-price-plan-card.tsx` | 132, 152, 158, 162, 178 |
| `text-slate-500` | `src/components/report/daily-candlestick-chart-card.tsx` | 237, 279, 280, 281, 284 |
| `text-slate-500` | `src/components/report/freshness-label.tsx` | 37 |
| `text-slate-500` | `src/components/report/intraday-candlestick-chart.tsx` | 93, 94, 95 |
| `text-slate-500` | `src/components/report/related-stocks-card.tsx` | 115, 123, 140 |
| `text-slate-500` | `src/components/report/sentiment-score-card.tsx` | 95, 109, 131, 153 |
| `text-slate-500` | `src/components/report/source-list-card.tsx` | 12 |
| `text-slate-500` | `src/components/report/stock-report-header.tsx` | 130 |
| `text-slate-500` | `src/components/workflows/bookmarks-research-board.tsx` | 42, 67 |
| `text-slate-500` | `src/components/workflows/recent-research-board.tsx` | 42, 67 |
| `text-slate-500` | `src/components/workflows/watchlist-research-board.tsx` | 79, 117, 172 |
| `text-slate-300` | `src/components/report/issue-timeline-card.tsx` | 63, 65, 69, 71 |
| `text-slate-300` | `src/components/report/sentiment-score-card.tsx` | 160 |
| `text-slate-300` | `src/components/workflows/bookmarks-research-board.tsx` | 48 |
| `text-slate-300` | `src/components/workflows/recent-research-board.tsx` | 48 |
| `text-slate-600` | `src/components/workflows/recent-research-board.tsx` | 70 |
