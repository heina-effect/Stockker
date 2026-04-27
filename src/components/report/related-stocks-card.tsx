"use client";

import { useEffect, useState } from "react";
import type { RelatedStock } from "@/types/research";
import Link from "next/link";
import { formatNumber } from "@/lib/utils";
import { useLiveMarket } from "@/components/dashboard/live-market-provider";

export function RelatedStocksCard({ symbol }: { symbol: string }) {
  const [stocks, setStocks] = useState<RelatedStock[]>([]);
  const { marketStore } = useLiveMarket();
  const [localLiveQuotes, setLocalLiveQuotes] = useState<Record<string, { price: number; changeRate: number; source: string }>>({});

  useEffect(() => {
    let isMounted = true;
    fetch(`/api/stocks/${symbol}/related`)
      .then(r => r.json())
      .then(d => {
        if (!isMounted) return;
        if (d.ok) {
          const fetchedStocks = d.related;
          setStocks(fetchedStocks);
          // Removed eager live data fetches for related stocks to avoid KIS Rate Limit (EGW00201)
        }
      });
      return () => { isMounted = false; };
  }, [symbol]);

  if (stocks.length === 0) {
    return <div className="h-40 bg-white dark:bg-zinc-900 rounded-[24px] border animate-pulse" />;
  }

  return (
    <div className="bg-white dark:bg-zinc-900 rounded-[24px] p-6 shadow-sm border">
      <h3 className="font-bold text-slate-900 dark:text-zinc-50 mb-4 flex items-center justify-between">
        AI 포착 연관 종목
        <span className="text-[10px] font-normal text-slate-400 bg-slate-100 dark:bg-zinc-800 px-2 py-1 rounded">Live Sync</span>
      </h3>
      
      <div className="flex flex-col gap-3">
        {stocks.map((stock) => {
          // 전역 MarketStore(사용자 시청 시) 또는 로컬 스냅샷 상태 중 최신 우선 확인 (fallback to mock)
          const liveState = marketStore[stock.symbol];
          const localQuote = localLiveQuotes[stock.symbol];
          
          const currentPrice = liveState?.quote?.price || localQuote?.price || stock.price || 0;
          const currentChangeRate = liveState?.quote?.changeRate || localQuote?.changeRate || stock.changeRate || 0;
          const isLive = liveState?.source === 'live' || localQuote?.source === 'live';
          
          const isUp = currentChangeRate > 0;
          const isDown = currentChangeRate < 0;
          
          return (
            <Link 
              key={stock.symbol} 
              href={`/stocks/${stock.symbol}`}
              className="flex items-center justify-between p-3 rounded-2xl bg-slate-50 dark:bg-zinc-950 hover:bg-slate-100 dark:hover:bg-zinc-900 transition-colors group"
            >
              <div className="flex flex-col">
                <span className="font-semibold text-sm text-slate-900 dark:text-zinc-100 group-hover:text-indigo-600 transition-colors">
                  {stock.name}
                </span>
                <span className="text-[10px] text-slate-500 mt-0.5 max-w-[180px] truncate">
                  {stock.reason}
                </span>
              </div>
              
              <div className="flex flex-col items-end">
                <span className="text-sm font-bold text-slate-900 dark:text-zinc-100 flex items-center gap-1.5">
                  {isLive && (
                    <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" title="Live"></span>
                  )}
                  {currentPrice ? `${formatNumber(currentPrice)}원` : "-"}
                </span>
                <span className={`text-[10px] font-bold ${isUp ? "text-red-500" : isDown ? "text-blue-500" : "text-slate-500"}`}>
                  {isUp ? "+" : ""}{currentChangeRate}% 
                </span>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
