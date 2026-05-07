"use client";
import { useEffect, useState } from "react";
import { Activity, Target } from "lucide-react";
import Link from "next/link";

export function TrendStocksCard() {
  const [stocks, setStocks] = useState<any[]>([]);

  useEffect(() => {
    fetch("/api/home/trending-stocks").then(r => r.json()).then(d => setStocks(d.stocks || []));
  }, []);

  return (
    <div className="bg-white dark:bg-zinc-900 rounded-[24px] p-6 border shadow-sm flex flex-col h-full">
      <h3 className="font-bold text-lg text-slate-900 dark:text-zinc-50 mb-4 flex items-center gap-2">
        <Activity className="w-5 h-5 text-rose-500" />
        지금 주목받는 종목
      </h3>
      <div className="flex flex-col gap-3">
        {stocks.map(stock => (
          <Link key={stock.id} href={`/stocks/${stock.symbol}`} className="block bg-slate-50 dark:bg-zinc-950 p-3 rounded-xl hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors">
            <div className="flex justify-between items-center mb-1">
              <div className="font-semibold text-sm text-slate-800 dark:text-zinc-200">{stock.name}</div>
              <div className="text-xs text-slate-400">{stock.symbol}</div>
            </div>
            <p className="text-xs text-slate-500 dark:text-zinc-400 line-clamp-1">{stock.reason}</p>
          </Link>
        ))}
        {stocks.length === 0 && <div className="text-sm text-slate-400">불러오는 중...</div>}
      </div>
    </div>
  );
}
