"use client";
import { useEffect, useState } from "react";
import { LocalStorageAdapter } from "@/lib/user-storage/local-adapter";
import { getStockName } from "@/lib/stocks/metadata";
import Link from "next/link";
import { Clock, TrendingUp, TrendingDown, Minus } from "lucide-react";

export function RecentResearchBoard() {
  const [recentSymbols, setRecentSymbols] = useState<string[]>([]);
  const [data, setData] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const list = LocalStorageAdapter.getAll().recentViewed || [];
    setRecentSymbols(list);

    if (list.length === 0) {
      setLoading(false);
      return;
    }

    async function fetchAll() {
      const results: Record<string, any> = {};
      for (const symbol of list) {
        try {
          const res = await fetch(`/api/stocks/${symbol}/sentiment`);
          if (res.ok) {
            results[symbol] = await res.json();
          }
        } catch (e) {
          console.error(e);
        }
      }
      setData(results);
      setLoading(false);
    }

    fetchAll();
  }, []);

  if (loading) {
    return <div className="text-center py-20 text-slate-500">데이터를 불러오는 중입니다...</div>;
  }

  if (recentSymbols.length === 0) {
    return (
      <div className="text-center py-20 bg-white dark:bg-zinc-900 rounded-[24px] border shadow-sm px-8">
        <Clock className="w-12 h-12 text-slate-300 mx-auto mb-4" />
        <p className="text-slate-700 dark:text-zinc-300 font-semibold mb-2">최근 본 종목이 없습니다.</p>
        <p className="text-sm text-slate-400 dark:text-zinc-500">
          홈 화면 검색창에서 종목을 검색하고 상세 페이지를 방문하면<br />
          자동으로 이 목록에 추가됩니다.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {recentSymbols.map((sym: string) => {
        const item = data[sym];
        return (
          <Link href={`/stocks/${sym}`} key={sym} className="block bg-white dark:bg-zinc-900 rounded-[24px] p-6 border shadow-sm hover:border-amber-200 transition-colors">
            <div className="flex justify-between items-start mb-4">
              <div>
                <h3 className="font-bold text-lg text-slate-900 dark:text-zinc-50">{getStockName(sym)}</h3>
                <span className="text-xs text-slate-500 font-mono">{sym}</span>
              </div>
              {item && (
                <div className={`px-2 py-1 rounded text-xs font-bold flex items-center gap-1 ${
                  item.trend === "bullish" ? "bg-red-50 text-red-600" :
                  item.trend === "bearish" ? "bg-blue-50 text-blue-600" :
                  "bg-slate-50 text-slate-600"
                }`}>
                  {item.trend === "bullish" ? <TrendingUp className="w-3 h-3"/> :
                   item.trend === "bearish" ? <TrendingDown className="w-3 h-3"/> :
                   <Minus className="w-3 h-3"/>}
                  {item.score}점
                </div>
              )}
            </div>
            {item ? (
              <div className="text-sm text-slate-600 dark:text-zinc-400 line-clamp-3 leading-relaxed">
                {item.positiveFactors[0] || item.negativeFactors[0] || "요약 정보가 없습니다."}
              </div>
            ) : (
              <div className="text-sm text-slate-400">데이터 없음</div>
            )}
          </Link>
        );
      })}
    </div>
  );
}
