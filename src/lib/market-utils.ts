
import { MarketState } from "@/types/stock";

export interface MarketStateToken {
  text: string;
  className: string;      // 배경 및 테두리 포함 전체 스타일
  dotClassName: string;   // 알림 점 스타일
  textClass: string;      // 텍스트 강조 색상
  animateClass: string;   // 아이콘 애니메이션 (pulse, spin 등)
}

export const MARKET_STATE_TOKENS: Record<MarketState, MarketStateToken> = {
  [MarketState.LIVE]: {
    text: "LIVE",
    className: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 border-green-200 dark:border-green-800",
    dotClassName: "bg-green-500",
    textClass: "text-green-600 dark:text-green-400",
    animateClass: "text-green-500 animate-pulse",
  },
  [MarketState.CONNECTING]: {
    text: "CONNECTING",
    className: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 border-blue-200 dark:border-blue-800",
    dotClassName: "bg-blue-500 animate-pulse",
    textClass: "text-blue-600 dark:text-blue-400",
    animateClass: "text-blue-500 animate-spin",
  },
  [MarketState.RECONNECTING]: {
    text: "RETRYING",
    className: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border-amber-200 dark:border-amber-800",
    dotClassName: "bg-amber-500 animate-bounce",
    textClass: "text-amber-600 dark:text-amber-400",
    animateClass: "text-amber-500 animate-bounce",
  },
  [MarketState.MOCK_FALLBACK]: {
    text: "MOCK (Fallback)",
    className: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-slate-300 dark:border-slate-700",
    dotClassName: "bg-slate-500",
    textClass: "text-slate-600 dark:text-slate-400",
    animateClass: "text-slate-400",
  },
  [MarketState.STALE]: {
    text: "STALE",
    className: "bg-yellow-50 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-500 border-yellow-200 dark:border-yellow-900/50",
    dotClassName: "bg-yellow-500 animate-pulse",
    textClass: "text-yellow-600 dark:text-yellow-500",
    animateClass: "text-yellow-500 animate-pulse",
  },
  [MarketState.ERROR]: {
    text: "ERROR",
    className: "bg-rose-100 text-rose-800 dark:bg-rose-950/50 dark:text-rose-400 border-rose-300 dark:border-rose-800",
    dotClassName: "bg-rose-600 animate-pulse",
    textClass: "text-rose-700 dark:text-rose-400",
    animateClass: "text-rose-600 animate-pulse",
  },
};
