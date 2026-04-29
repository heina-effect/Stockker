"use client";

import { useLiveMarket } from "@/components/dashboard/live-market-provider";
import Link from "next/link";
import { formatNumber, formatChange } from "@/lib/utils";
import { getStockName } from "@/lib/stocks/metadata";
import { LocalStorageAdapter } from "@/lib/user-storage/local-adapter";
import { useEffect, useState } from "react";

export function WatchlistAsideCard() {
  const { marketStore } = useLiveMarket();
  const [watchlist, setWatchlist] = useState<string[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setWatchlist(LocalStorageAdapter.getAll().watchlist);
    setMounted(true);
  }, []);

  if (!mounted) {
    return <div className="bg-white dark:bg-zinc-900 rounded-[24px] p-6 border shadow-sm h-full flex flex-col animate-pulse" />;
  }

  return (
    <div className="bg-white dark:bg-zinc-900 rounded-[24px] p-6 border shadow-sm h-full flex flex-col">
      <div className="mb-6 flex items-center justify-between">
        <h2 className="font-bold text-lg text-slate-900 dark:text-zinc-50 flex items-center gap-2">
          나의 관심 종목
        </h2>
        <span className="text-xs text-slate-400">실시간 연동됨</span>
      </div>

      <div className="flex flex-col gap-3 flex-1 overflow-y-auto pr-2">
        {watchlist.map((symbol) => {
          const itemState = marketStore[symbol];
          const isLoading = !itemState || itemState.source === "connecting";
          const quote = itemState?.quote;

          if (isLoading) {
            return (
              <div key={symbol} className="flex items-center justify-between p-3 rounded-2xl bg-slate-50 dark:bg-zinc-950 animate-pulse">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-slate-200 dark:bg-zinc-800 rounded-full" />
                  <div className="flex flex-col gap-2">
                    <div className="w-16 h-4 bg-slate-200 dark:bg-zinc-800 rounded" />
                    <div className="w-10 h-3 bg-slate-200 dark:bg-zinc-800 rounded" />
                  </div>
                </div>
              </div>
            );
          }

          if (!quote) return null;

          const isUp = quote.change > 0;
          const isDown = quote.change < 0;

          return (
            <Link 
              key={symbol} 
              href={`/stocks/${symbol}`}
              className="flex items-center justify-between p-3 rounded-2xl hover:bg-slate-50 dark:hover:bg-zinc-950 transition-colors border border-transparent hover:border-slate-100 dark:hover:border-zinc-800 group"
            >
              <div className="flex flex-col">
                <span className="font-semibold text-slate-900 dark:text-zinc-100 group-hover:text-indigo-600 transition-colors">
                  {getStockName(symbol)}
                </span>
                <span className="text-xs text-slate-500">{symbol}</span>
              </div>

              <div className="flex flex-col items-end">
                 <span className="font-bold text-slate-900 dark:text-zinc-100">
                    {formatNumber(quote.price)}원
                 </span>
                 <span className={`text-xs font-semibold ${
                    isUp ? "text-red-500" : isDown ? "text-blue-500" : "text-slate-500"
                 }`}>
                    {isUp ? "+" : ""}{formatNumber(quote.change)} ({isUp ? "+" : ""}{formatChange(quote.changeRate)}%)
                 </span>
              </div>
            </Link>
          );
        })}
        {watchlist.length === 0 && (
          <div className="flex items-center justify-center h-24 text-slate-400 text-sm">
            저장된 관심 종목이 없습니다.
          </div>
        )}
      </div>

      <div className="mt-6 pt-4 border-t border-slate-100 dark:border-zinc-800 flex justify-center">
        <Link href="/" className="text-xs font-medium text-slate-500 hover:text-indigo-600 transition-colors">
          검색하여 종목 추가 &raquo;
        </Link>
      </div>
    </div>
  );
}
