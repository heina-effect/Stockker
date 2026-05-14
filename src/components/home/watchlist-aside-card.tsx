"use client";

import Link from "next/link";
import { formatNumber, formatChange } from "@/lib/utils";
import { getStockName } from "@/lib/stocks/metadata";
import { getCanonicalSectorForSymbol } from "@/lib/stocks/sector-utils";
import { LocalStorageAdapter } from "@/lib/user-storage/local-adapter";
import { USER_STORAGE_EVENT } from "@/lib/user-storage/events";
import { useEffect, useState } from "react";

type WatchlistSummary = {
  symbol: string;
  name: string;
  sector?: { name: string } | null;
  quote?: { price: number; change: number; changeRate: number } | null;
  sentiment?: { label: string; score: number; trend: "up" | "down" | "flat" } | null;
  counts?: { issueCount: number; disclosureCount: number; sourceCount: number };
  whyNow?: string;
};

export function WatchlistAsideCard() {
  const [watchlist, setWatchlist] = useState<string[]>([]);
  const [summaries, setSummaries] = useState<Record<string, WatchlistSummary>>({});
  const [loading, setLoading] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const sync = () => setWatchlist(LocalStorageAdapter.getAll().watchlist);
    sync();
    window.addEventListener(USER_STORAGE_EVENT, sync);
    window.addEventListener("storage", sync);
    setMounted(true);
    return () => {
      window.removeEventListener(USER_STORAGE_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  useEffect(() => {
    if (!mounted || watchlist.length === 0) {
      setSummaries({});
      return;
    }

    let active = true;
    setLoading(true);
    fetch(`/api/watchlist/summary?symbols=${watchlist.join(",")}`)
      .then(r => r.json())
      .then(data => {
        if (!active) return;
        const next: Record<string, WatchlistSummary> = {};
        if (data.ok && Array.isArray(data.items)) {
          for (const item of data.items) next[item.symbol] = item;
        }
        setSummaries(next);
      })
      .catch(() => {
        if (active) setSummaries({});
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => { active = false; };
  }, [mounted, watchlist]);

  if (!mounted) {
    return <div className="bg-white dark:bg-zinc-900 rounded-[24px] p-6 border border-transparent shadow-sm h-full flex flex-col animate-pulse" />;
  }

  return (
    <div className="bg-white dark:bg-zinc-900 rounded-[24px] p-6 border border-transparent shadow-sm h-full flex flex-col">
      <div className="mb-6 flex items-center justify-between">
        <h2 className="font-bold text-lg text-slate-900 dark:text-zinc-50 flex items-center gap-2">
          나의 관심 종목
        </h2>
        <div className="flex items-center gap-2">
          <Link href="/workflows/watchlist" className="text-xs text-indigo-500 hover:text-indigo-700 font-medium">모아보기 &raquo;</Link>
        </div>
      </div>

      <div className="flex flex-col gap-3 flex-1 overflow-y-auto pr-2">
        {watchlist.map((symbol) => {
          const summary = summaries[symbol];
          const quote = summary?.quote;
          const sector = summary?.sector?.name || getCanonicalSectorForSymbol(symbol)?.name;
          const issueCount = summary?.counts?.issueCount ?? 0;
          const disclosureCount = summary?.counts?.disclosureCount ?? 0;
          const sentiment = summary?.sentiment;
          const isLoading = loading && !summary;

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

          const isUp = (quote?.change ?? 0) > 0;
          const isDown = (quote?.change ?? 0) < 0;
          const whyNow = summary?.whyNow || "리서치 준비 중입니다.";

          return (
            <Link 
              key={symbol} 
              href={`/stocks/${symbol}`}
              className="flex flex-col gap-2 p-3 rounded-2xl bg-slate-50/70 dark:bg-zinc-950/70 hover:bg-slate-50 dark:hover:bg-zinc-950 transition-colors border border-transparent hover:border-slate-100 dark:hover:border-zinc-800 group"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-slate-900 dark:text-zinc-100 group-hover:text-indigo-600 transition-colors truncate">
                      {summary?.name || getStockName(symbol)}
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono">{symbol}</span>
                  </div>
                  {sector && (
                    <span className="mt-1 inline-flex rounded-full bg-teal-50 dark:bg-teal-900/20 px-1.5 py-0.5 text-[10px] font-medium text-teal-700 dark:text-teal-300">
                      {sector}
                    </span>
                  )}
                </div>

                <div className="flex flex-col items-end shrink-0">
                  <span className="font-bold text-slate-900 dark:text-zinc-100">
                    {quote ? `${formatNumber(quote.price)}원` : "최신가 없음"}
                  </span>
                  {quote ? (
                    <span className={`text-xs font-semibold ${
                      isUp ? "text-red-500" : isDown ? "text-blue-500" : "text-slate-500"
                    }`}>
                      {isUp ? "+" : ""}{formatNumber(quote.change)} ({isUp ? "+" : ""}{formatChange(quote.changeRate)}%)
                    </span>
                  ) : (
                    <span className="text-xs text-slate-400">시세 대기</span>
                  )}
                </div>
              </div>

              <p className="line-clamp-2 text-xs leading-relaxed text-slate-500 dark:text-zinc-400">
                {whyNow}
              </p>

              <div className="flex flex-wrap items-center gap-1.5">
                {sentiment && (
                  <span className="rounded-full bg-indigo-50 dark:bg-indigo-900/20 px-1.5 py-0.5 text-[10px] font-medium text-indigo-600 dark:text-indigo-300">
                    감성 {sentiment.label} {sentiment.score}
                  </span>
                )}
                {issueCount > 0 && (
                  <span className="rounded-full bg-rose-50 dark:bg-rose-900/20 px-1.5 py-0.5 text-[10px] font-medium text-rose-600 dark:text-rose-300">
                    새 이슈 {issueCount}건
                  </span>
                )}
                {disclosureCount > 0 && (
                  <span className="rounded-full bg-teal-50 dark:bg-teal-900/20 px-1.5 py-0.5 text-[10px] font-medium text-teal-700 dark:text-teal-300">
                    공시 {disclosureCount}건
                  </span>
                )}
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
