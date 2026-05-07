"use client";
import { useEffect, useState } from "react";
import { Activity, Target } from "lucide-react";
import Link from "next/link";

import { useHomeIntelligence } from "./home-intelligence-provider";

export function TrendStocksCard() {
  const { data, isLoading } = useHomeIntelligence();
  const trending: any[] = data?.stocks || [];

  return (
    <div className="bg-white dark:bg-zinc-900 rounded-[24px] p-6 border shadow-sm flex flex-col h-full">
      <h3 className="font-bold text-lg text-slate-900 dark:text-zinc-50 mb-4 flex items-center gap-2">
        <Activity className="w-5 h-5 text-rose-500" />
        지금 주목받는 종목
      </h3>
      <div className="flex flex-col gap-3">
        {trending.map(stock => (
          <div key={stock.symbol} className="flex items-center justify-between bg-slate-50 dark:bg-zinc-950 p-3 rounded-xl border border-transparent hover:border-slate-200 transition-colors">
            <div className="flex flex-col">
              <Link href={`/stocks/${stock.symbol}`} className="font-bold text-sm text-slate-800 dark:text-zinc-200 hover:underline">
                {stock.name}
              </Link>
              <span className="text-[10px] text-slate-500 line-clamp-1 mt-0.5">{stock.reason}</span>
            </div>
            <div className="text-right flex flex-col items-end min-w-[60px]">
              <span className={`text-xs font-bold ${stock.changeRate > 0 ? "text-red-500" : stock.changeRate < 0 ? "text-blue-500" : "text-slate-500"}`}>
                {stock.changeRate > 0 ? "+" : ""}{stock.changeRate}%
              </span>
            </div>
          </div>
        ))}
        {trending.length === 0 && <div className="text-sm text-slate-400">불러오는 중...</div>}
      </div>
    </div>
  );
}
