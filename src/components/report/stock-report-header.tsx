"use client";

import { useEffect, useState } from "react";
import type { StockReportSummary } from "@/types/research";
import { FreshnessLabel } from "./freshness-label";
import { formatNumber, formatChange } from "@/lib/utils";
import { useLiveMarket } from "@/components/dashboard/live-market-provider";
import { getStockName } from "@/lib/stocks/metadata";
import { LocalStorageAdapter } from "@/lib/user-storage/local-adapter";
import { Bookmark, BookmarkCheck } from "lucide-react";

export function StockReportHeader({ symbol }: { symbol: string }) {
  const [data, setData] = useState<StockReportSummary | null>(null);
  const { marketStore, setSelectedSymbol, selectedSymbol } = useLiveMarket();
  const [isBookmarked, setIsBookmarked] = useState(false);

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

    // AI 리포트 Mock 데이터 로드
    fetch(`/api/stocks/${symbol}/report`)
      .then(r => r.json())
      .then(d => {
        if (d.ok) setData(d.report);
      });
  }, [symbol, selectedSymbol, setSelectedSymbol]);

  if (!data) {
    return (
      <div className="bg-white dark:bg-zinc-900 rounded-[24px] p-6 md:p-8 shadow-sm border animate-pulse">
        <div className="w-1/3 h-8 bg-slate-200 dark:bg-zinc-800 rounded mb-4" />
        <div className="w-full h-16 bg-slate-100 dark:bg-zinc-800 rounded" />
      </div>
    );
  }

  // 실시간 시세 처리
  const liveState = marketStore[symbol];
  const liveQuote = liveState?.quote;

  const currentPrice = liveQuote?.price || data.currentPrice;
  const change = liveQuote?.change || data.change;
  const changeRate = liveQuote?.changeRate || data.changeRate;
  
  const isUp = change > 0;
  const isDown = change < 0;
  const colorClass = isUp ? "text-red-500 dark:text-red-400" : isDown ? "text-blue-500 dark:text-blue-400" : "text-slate-500";

  // Price Freshness는 실시간 연결 상태에서 우선
  const priceFreshnessState = liveState?.source === "live" ? "live" : 
                              liveState?.source === "connecting" ? "loading" :
                              liveState?.source === "error" || liveState?.source === "mock-fallback" ? "error" : "stale";

  return (
    <div className="bg-white dark:bg-zinc-900 rounded-[24px] p-6 md:p-8 shadow-sm border flex flex-col md:flex-row md:items-start justify-between gap-6">
      <div className="flex-1">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl md:text-3xl font-bold text-slate-900 dark:text-zinc-50">{data.name || getStockName(symbol)}</h1>
            <span className="text-sm font-medium text-slate-400 bg-slate-100 dark:bg-zinc-800 px-2 py-1 rounded">
              {symbol}
            </span>
            <FreshnessLabel type="report" state={data.reportFreshness} timestamp={data.lastUpdated} />
          </div>
          <button 
            onClick={toggleBookmark}
            className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors text-slate-400 dark:text-zinc-500 hover:text-indigo-600 dark:hover:text-indigo-400"
            title={isBookmarked ? "북마크 해제" : "북마크 저장"}
          >
            {isBookmarked ? <BookmarkCheck className="w-6 h-6 text-indigo-500" /> : <Bookmark className="w-6 h-6" />}
          </button>
        </div>
        
        <div className="flex items-end gap-3 mb-6">
          <span className="text-3xl font-bold text-slate-900 dark:text-zinc-50 tracking-tight">
            {formatNumber(currentPrice)}원
          </span>
          <span className={`text-lg font-medium mb-1 ${colorClass}`}>
            {isUp ? "▲" : isDown ? "▼" : ""} {formatNumber(Math.abs(change))} ({isUp ? "+" : ""}{formatChange(changeRate)}%)
          </span>
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

        <div className="bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-100 dark:border-indigo-900 rounded-2xl p-5">
          <h2 className="text-indigo-800 dark:text-indigo-300 font-bold mb-2 flex items-center gap-2">
            <span className="bg-indigo-600 text-white text-[10px] uppercase font-bold px-2 py-0.5 rounded-sm">AI Summary</span>
            {data.aiHeadline}
          </h2>
          <p className="text-sm text-slate-700 dark:text-zinc-300 leading-relaxed">
            {data.aiSummary}
          </p>
        </div>
      </div>
    </div>
  );
}
