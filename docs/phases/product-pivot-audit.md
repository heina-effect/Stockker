# Product Pivot Reality Audit

## 1. Environment & Tech Stack
- **Framework:** Next.js 16.1.6 (App Router)
- **Package Manager:** npm (`package-lock.json` utilized)
- **Scripts Available:** `dev`, `build`, `start`, `lint`, `typecheck`
- **Styling:** Tailwind CSS v4 (`@tailwindcss/postcss` v4), shadcn/ui (`clsx`, `tailwind-merge`, `class-variance-authority`)
- **State/Data:** Recharts, Zod, React 19.2.3

## 2. Main IA Elements to Remove or Repurpose
- **Current `src/app/page.tsx` Structure:**
  - `DashboardHeader`: Needs simplification.
  - `MarketOverviewCard`: Repurpose to a subtle header or small card.
  - `WatchlistPanel`: Keep but repurpose as a simplified right-aside card.
  - `PriceChart`: Keep but simplify (line chart, remove candle/complex indicators).
  - `OrderbookPanel`: **Remove from Main IA.** Move to `/labs/realtime` or deprecate.
- **Design:** Move from "Dense Dashboard" to "Simple & Clean Search-First Research Tool". 

## 3. Discrepancies between Docs and Reality
- **`architecture.md` (Phase 1):** Mentions Next.js 15, but `package.json` specifies 16.1.6. States the main purpose is a "Korean Stock Real-time Dashboard." This will be heavily revised to represent a "Search-First Stock Research & Report Service."

## 4. Reusable Assets
- `LiveMarketProvider` & SSE/KIS API Infrastructure: Keep to supply "price freshness" and simple chart data.
- KIS Token Management / Cache: Unchanged.

## 5. Next Steps
- Overhaul `src/app/page.tsx`.
- Create `src/app/stocks/[symbol]/page.tsx` (Report View).
- Create Research Data Contracts & API Stubs.
- Integrate AI Model Router.
