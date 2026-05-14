"use client";

import { useEffect, useState } from "react";
import { LocalStorageAdapter } from "@/lib/user-storage/local-adapter";
import Link from "next/link";
import { getStockName } from "@/lib/stocks/metadata";

export function WatchlistResearchBoard() {
  const [watchlist, setWatchlist] = useState<string[]>([]);
  const [mounted, setMounted] = useState(false);
  const [reports, setReports] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const list = LocalStorageAdapter.getAll().watchlist;
    setWatchlist(list);
    setMounted(true);
    
    if (list.length > 0) {
      // Fetch summaries for each
      Promise.all(list.map(sym => 
        fetch(`/api/stocks/${sym}/summary`).then(r => r.json()).catch(() => null)
      )).then(results => {
        const newReports: Record<string, any> = {};
        results.forEach((res, i) => {
          if (res?.ok && res.summary) {
            newReports[list[i]] = res.summary;
          }
        });
        setReports(newReports);
        setLoading(false);
      });
    } else {
      setLoading(false);
    }
  }, []);

  if (!mounted) return null;

  if (watchlist.length === 0) {
    return (
      <div className="bg-white dark:bg-zinc-900 rounded-[24px] p-12 border text-center shadow-sm">
        <p className="text-slate-500 mb-4">저장된 관심 종목이 없습니다.</p>
        <Link href="/" className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors">
          검색으로 돌아가기
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {watchlist.map(sym => {
        const rep = reports[sym];
        return (
          <div key={sym} className="bg-white dark:bg-zinc-900 rounded-[24px] p-6 shadow-sm border flex flex-col md:flex-row gap-6">
            <div className="md:w-1/4 flex flex-col justify-center">
              <h2 className="text-xl font-bold text-slate-900 dark:text-zinc-50">{getStockName(sym)}</h2>
              <p className="text-sm text-slate-500 font-mono mb-2">{sym}</p>
              <Link href={`/stocks/${sym}`} className="text-xs font-medium text-indigo-600 hover:text-indigo-800 transition-colors inline-block mt-2">
                상세 리포트 보기 &rarr;
              </Link>
            </div>
            
            <div className="md:w-3/4 flex flex-col gap-3">
              {loading && !rep ? (
                <div className="animate-pulse flex flex-col gap-2">
                  <div className="h-4 bg-slate-200 dark:bg-zinc-800 rounded w-3/4" />
                  <div className="h-4 bg-slate-200 dark:bg-zinc-800 rounded w-full" />
                </div>
              ) : rep ? (
                <>
                  <h3 className="font-semibold text-slate-800 dark:text-zinc-200">{rep.aiHeadline}</h3>
                  <p className="text-sm text-slate-600 dark:text-zinc-400 leading-relaxed">{rep.aiSummary}</p>
                </>
              ) : (
                <p className="text-sm text-slate-500 italic">요약 정보를 불러오지 못했습니다.</p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
