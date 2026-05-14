"use client";
import { Activity } from "lucide-react";
import Link from "next/link";

import { useHomeIntelligence } from "./home-intelligence-provider";

function StocksSkeleton() {
  return (
    <div className="flex flex-col gap-3 animate-pulse">
      {[1, 2, 3, 4].map(i => (
        <div key={i} className="bg-slate-50 dark:bg-zinc-950 p-3 rounded-xl">
          <div className="flex justify-between mb-2">
            <div className="w-24 h-4 bg-slate-100 dark:bg-zinc-800 rounded" />
            <div className="w-12 h-4 bg-slate-100 dark:bg-zinc-800 rounded" />
          </div>
          <div className="w-full h-3 bg-slate-50 dark:bg-zinc-800/60 rounded" />
        </div>
      ))}
    </div>
  );
}

export function TrendStocksCard() {
  const { data, isLoading, error } = useHomeIntelligence();
  const trending: any[] = data?.stocks || [];

  return (
    <div className="bg-white dark:bg-zinc-900 rounded-[24px] p-6 border border-transparent shadow-sm flex flex-col h-full">
      <h3 className="font-bold text-lg text-slate-900 dark:text-zinc-50 mb-4 flex items-center gap-2">
        <Activity className="w-5 h-5 text-rose-500" />
        지금 주목받는 종목
      </h3>
      <div className="flex flex-col gap-3 flex-1">
        {isLoading ? (
          <StocksSkeleton />
        ) : error ? (
          <div className="text-sm text-slate-400 italic">데이터를 불러오지 못했습니다.</div>
        ) : trending.length === 0 ? (
          <div className="text-sm text-slate-400 italic">현재 주목받는 종목이 없습니다.</div>
        ) : (
          trending.map(stock => (
            <Link
              key={stock.symbol}
              href={`/stocks/${stock.symbol}`}
              aria-label={`${stock.name} 리포트 보기`}
              className="flex flex-col bg-slate-50 dark:bg-zinc-950 p-3 rounded-xl border border-transparent hover:border-slate-200 dark:hover:border-zinc-800 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              <div className="flex items-center justify-between mb-1">
                <span className="font-bold text-sm text-slate-800 dark:text-zinc-200">
                  {stock.name}
                </span>
                {stock.sourceCount ? (
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-300">
                    근거 {stock.sourceCount}건
                  </span>
                ) : null}
              </div>
              <span className="text-xs text-slate-600 dark:text-zinc-400 leading-relaxed mb-1">{stock.reason}</span>
              {stock.sourceCount && (
                <span className="text-[10px] text-slate-400 mt-1">관련 출처 {stock.sourceCount}건 기반</span>
              )}
            </Link>
          ))
        )}
      </div>
      <div className="mt-4 pt-3 border-t border-slate-100 dark:border-zinc-800 text-[10px] text-slate-400 text-center">
        기준: 출처 근거 수와 최근 이슈 밀도 중심. 투자 참고용입니다.
      </div>
    </div>
  );
}
