"use client";

import { useEffect, useState } from "react";
import type { StockReportSummary } from "@/types/research";
import { FreshnessLabel } from "./freshness-label";
import { formatNumber, formatChange } from "@/lib/utils";
import { useLiveMarket } from "@/components/dashboard/live-market-provider";
import { getStockName } from "@/lib/stocks/metadata";
import { getCanonicalSectorForSymbol } from "@/lib/stocks/sector-utils";
import { LocalStorageAdapter } from "@/lib/user-storage/local-adapter";
import {
  Anchor,
  Anvil,
  Atom,
  BatteryCharging,
  Bookmark,
  BookmarkCheck,
  Bot,
  Car,
  Clapperboard,
  Cpu,
  Dna,
  FlaskConical,
  Fuel,
  Gamepad2,
  HardHat,
  Landmark,
  Layers,
  LayoutGrid,
  LineChart,
  Mountain,
  Music,
  Plane,
  Shield,
  ShieldCheck,
  Ship,
  ShoppingBag,
  Signal,
  Sparkles,
  Utensils,
  Zap,
} from "lucide-react";

const SECTOR_ICON_MAP = {
  cpu: Cpu,
  battery: BatteryCharging,
  flask: FlaskConical,
  layout: LayoutGrid,
  landmark: Landmark,
  music: Music,
  car: Car,
  shield: Shield,
  zap: Zap,
  dna: Dna,
  bot: Bot,
  layers: Layers,
  "line-chart": LineChart,
  "shield-check": ShieldCheck,
  ship: Ship,
  anvil: Anvil,
  "hard-hat": HardHat,
  anchor: Anchor,
  atom: Atom,
  fuel: Fuel,
  "shopping-bag": ShoppingBag,
  clapperboard: Clapperboard,
  utensils: Utensils,
  sparkles: Sparkles,
  "gamepad-2": Gamepad2,
  signal: Signal,
  mountain: Mountain,
  plane: Plane,
};

export function StockReportHeader({ symbol }: { symbol: string }) {
  const [data, setData] = useState<StockReportSummary | null>(null);
  const { marketStore, setSelectedSymbol, selectedSymbol } = useLiveMarket();
  const [isBookmarked, setIsBookmarked] = useState(false);

  // metadata-first: 종목명/티커는 즉시 표시 (search master에서 동기 조회)
  const immediateStockName = getStockName(symbol) || symbol;
  const canonicalSector = getCanonicalSectorForSymbol(symbol);

  useEffect(() => {
    // Hydration for bookmark state
    const savedBookmarks = LocalStorageAdapter.getAll().bookmarkedReports;
    setIsBookmarked(savedBookmarks.includes(symbol));

    // Save to recent viewed
    LocalStorageAdapter.addRecentViewed(symbol);
  }, [symbol]);

  const toggleBookmark = () => {
    LocalStorageAdapter.toggleBookmark(symbol);
    setIsBookmarked(prev => !prev);
  };

  useEffect(() => {
    // 종목 페이지 마운트 시, 실시간 스트림 포커스를 해당 종목으로 설정
    if (symbol !== selectedSymbol) {
      setSelectedSymbol(symbol);
    }

    // AI 리포트 로드
    fetch(`/api/stocks/${symbol}/report`)
      .then(r => r.json())
      .then(d => {
        if (d.ok) setData(d.report);
      });
  }, [symbol, selectedSymbol, setSelectedSymbol]);

  // ── metadata-first: 종목명/티커/북마크는 data 로딩 전에도 즉시 표시 ──────
  const stockName = data?.name || immediateStockName;
  const reportFreshness = data?.reportFreshness ?? "loading";
  const lastUpdated = data?.lastUpdated ?? new Date().toISOString();

  // 실시간 시세 처리
  const liveState = marketStore[symbol];
  const liveQuote = liveState?.quote;
  const SectorIcon = canonicalSector?.iconKey
    ? SECTOR_ICON_MAP[canonicalSector.iconKey as keyof typeof SECTOR_ICON_MAP] || Layers
    : Layers;
  const currentPrice = liveQuote?.price || data?.currentPrice || 0;
  const change = liveQuote?.change || data?.change || 0;
  const changeRate = liveQuote?.changeRate || data?.changeRate || 0;

  const isUp = change > 0;
  const isDown = change < 0;
  const colorClass = isUp ? "text-red-500 dark:text-red-400" : isDown ? "text-blue-500 dark:text-blue-400" : "text-slate-500";

  const priceFreshnessState = liveState?.source === "live" ? "live" :
                              liveState?.source === "connecting" ? "loading" :
                              liveState?.source === "error" || liveState?.source === "mock-fallback" ? "error" : "stale";



  return (
    <div className="bg-white dark:bg-zinc-900 rounded-[24px] p-6 md:p-8 shadow-sm border border-transparent flex flex-col md:flex-row md:items-start justify-between gap-6">
      <div className="flex-1">
        {/* ── 종목명/티커: 즉시 렌더링 (no skeleton) ── */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl md:text-3xl font-bold text-slate-900 dark:text-zinc-50">{stockName}</h1>
            <span className="text-sm font-medium text-slate-400 bg-slate-100 dark:bg-zinc-800 px-2 py-1 rounded">
              {symbol}
            </span>
            <FreshnessLabel type="report" state={reportFreshness} timestamp={lastUpdated} />
          </div>
          <button
            onClick={toggleBookmark}
            className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors text-slate-400 dark:text-zinc-500 hover:text-indigo-600 dark:hover:text-indigo-400"
            title={isBookmarked ? "북마크 해제" : "북마크 저장"}
          >
            {isBookmarked ? <BookmarkCheck className="w-6 h-6 text-indigo-500" /> : <Bookmark className="w-6 h-6" />}
          </button>
        </div>

        {canonicalSector && (
          <div className="mb-4 flex flex-wrap items-center gap-2 text-xs">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 font-medium text-slate-700 dark:bg-zinc-800 dark:text-zinc-200">
              <SectorIcon className="h-3.5 w-3.5 text-indigo-500" />
              {canonicalSector.name}
            </span>
            {liveQuote?.kisIndustryName && (
              <span className="inline-flex items-center rounded-full bg-slate-50 px-2.5 py-1 text-slate-500 dark:bg-zinc-950 dark:text-zinc-400">
                KIS 업종 {liveQuote.kisIndustryName}
              </span>
            )}
          </div>
        )}

        {/* ── 현재가: 로딩 중이면 skeleton ── */}
        <div className="flex items-end gap-3 mb-6">
          {currentPrice > 0 ? (
            <>
              <span className="text-3xl font-bold text-slate-900 dark:text-zinc-50 tracking-tight">
                {formatNumber(currentPrice)}원
              </span>
              <span className={`text-lg font-medium mb-1 ${colorClass}`}>
                {isUp ? "▲" : isDown ? "▼" : ""} {formatNumber(Math.abs(change))} ({isUp ? "+" : ""}{formatChange(changeRate)}%)
              </span>
            </>
          ) : (
            <div className="flex gap-3 items-end animate-pulse">
              <div className="w-36 h-9 bg-slate-200 dark:bg-zinc-800 rounded" />
              <div className="w-24 h-6 bg-slate-100 dark:bg-zinc-800 rounded mb-1" />
            </div>
          )}
          {liveState && liveState.lastUpdated > 0 && (
            <div className="ml-2 mb-1">
              <FreshnessLabel
                type="price"
                state={priceFreshnessState}
                timestamp={new Date(liveState.lastUpdated).toISOString()}
              />
            </div>
          )}
        </div>

        {/* ── AI Summary: 로딩 중이면 skeleton ── */}
        <div className="bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-100 dark:border-indigo-900 rounded-2xl p-5">
          {data ? (
            <>
              <h2 className="text-indigo-800 dark:text-indigo-300 font-bold mb-2 flex items-center gap-2">
                <span className="bg-indigo-600 text-white text-[10px] uppercase font-bold px-2 py-0.5 rounded-sm">AI Summary</span>
                {data.aiHeadline}
              </h2>
              <p className="text-sm text-slate-700 dark:text-zinc-300 leading-relaxed">
                {data.aiSummary}
              </p>
            </>
          ) : (
            <div className="animate-pulse flex flex-col gap-2">
              <div className="w-3/4 h-5 bg-indigo-100 dark:bg-indigo-900/40 rounded" />
              <div className="w-full h-3 bg-indigo-50 dark:bg-indigo-900/20 rounded" />
              <div className="w-5/6 h-3 bg-indigo-50 dark:bg-indigo-900/20 rounded" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
