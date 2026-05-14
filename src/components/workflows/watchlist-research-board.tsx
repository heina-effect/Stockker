"use client";

import { useEffect, useState } from "react";
import { LocalStorageAdapter } from "@/lib/user-storage/local-adapter";
import { USER_STORAGE_EVENT } from "@/lib/user-storage/events";
import Link from "next/link";
import { getStockName } from "@/lib/stocks/metadata";
import { formatChange, formatNumber } from "@/lib/utils";

type WatchlistSummary = {
  symbol: string;
  name: string;
  sector?: { name: string } | null;
  quote?: { price: number; change: number; changeRate: number } | null;
  aiHeadline?: string | null;
  aiSummary?: string | null;
  reportFreshness?: string;
  sentiment?: { score: number; label: string; trend: "up" | "down" | "flat" } | null;
  issues?: Array<{ id: string; title: string; summary: string; sourceCount: number }>;
  counts?: { issueCount: number; sourceCount: number; disclosureCount: number; newsCount: number };
  opinion?: { avgTargetPrice: number; recentOpinionCount: number; latestOpinion?: string | null; latestFirmName?: string | null } | null;
  whyNow?: string;
};

export function WatchlistResearchBoard() {
  const [watchlist, setWatchlist] = useState<string[]>([]);
  const [mounted, setMounted] = useState(false);
  const [summaries, setSummaries] = useState<Record<string, WatchlistSummary>>({});
  const [loading, setLoading] = useState(true);

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
    if (!mounted) return;
    if (watchlist.length === 0) {
      setSummaries({});
      setLoading(false);
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
        const item = summaries[sym];
        const quote = item?.quote;
        const isUp = (quote?.change ?? 0) > 0;
        const isDown = (quote?.change ?? 0) < 0;
        return (
          <div key={sym} className="bg-white dark:bg-zinc-900 rounded-[24px] p-6 shadow-sm border border-transparent flex flex-col gap-5">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-xl font-bold text-slate-900 dark:text-zinc-50">{item?.name || getStockName(sym)}</h2>
                  <span className="text-xs text-slate-400 font-mono">{sym}</span>
                  {item?.sector?.name && (
                    <span className="rounded-full bg-teal-50 dark:bg-teal-900/20 px-2 py-0.5 text-[10px] font-medium text-teal-700 dark:text-teal-300">
                      {item.sector.name}
                    </span>
                  )}
                </div>
                <p className="mt-1 text-xs text-slate-400">
                  {item?.reportFreshness === "loading" ? "리포트 준비 중" : "관심종목 리서치 요약"}
                </p>
              </div>

              <div className="flex flex-col items-start md:items-end">
                <span className="text-lg font-bold text-slate-900 dark:text-zinc-50">
                  {quote ? `${formatNumber(quote.price)}원` : "최신가 없음"}
                </span>
                {quote ? (
                  <span className={`text-sm font-semibold ${
                    isUp ? "text-red-500" : isDown ? "text-blue-500" : "text-slate-500"
                  }`}>
                    {isUp ? "+" : ""}{formatNumber(quote.change)} ({isUp ? "+" : ""}{formatChange(quote.changeRate)}%)
                  </span>
                ) : (
                  <span className="text-xs text-slate-400">시세 대기</span>
                )}
              </div>
            </div>

            {loading && !item ? (
              <div className="animate-pulse flex flex-col gap-2">
                <div className="h-4 bg-slate-200 dark:bg-zinc-800 rounded w-3/4" />
                <div className="h-4 bg-slate-200 dark:bg-zinc-800 rounded w-full" />
                <div className="h-4 bg-slate-100 dark:bg-zinc-800 rounded w-2/3" />
              </div>
            ) : item ? (
              <>
                <div className="rounded-2xl bg-slate-50 dark:bg-zinc-950 p-4">
                  <h3 className="font-semibold text-slate-800 dark:text-zinc-200">{item.aiHeadline || "리포트 준비 중입니다"}</h3>
                  <p className="mt-1 text-sm text-slate-600 dark:text-zinc-400 leading-relaxed line-clamp-2">
                    {item.aiSummary || "아직 충분한 근거가 쌓이지 않았습니다. 최신 뉴스와 공시가 확인되면 요약이 갱신됩니다."}
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                  <div className="rounded-xl bg-indigo-50 dark:bg-indigo-900/20 p-3 text-indigo-700 dark:text-indigo-300">
                    <div className="text-[10px] opacity-70 mb-1">감성</div>
                    <div className="font-bold">{item.sentiment ? `${item.sentiment.label} ${item.sentiment.score}` : "근거 부족"}</div>
                  </div>
                  <div className="rounded-xl bg-rose-50 dark:bg-rose-900/20 p-3 text-rose-700 dark:text-rose-300">
                    <div className="text-[10px] opacity-70 mb-1">이슈/소스</div>
                    <div className="font-bold">{item.counts?.issueCount ?? 0}개 / {item.counts?.sourceCount ?? 0}건</div>
                  </div>
                  <div className="rounded-xl bg-emerald-50 dark:bg-emerald-900/20 p-3 text-emerald-700 dark:text-emerald-300">
                    <div className="text-[10px] opacity-70 mb-1">투자의견</div>
                    <div className="font-bold">
                      {item.opinion?.recentOpinionCount ? `${item.opinion.latestOpinion || "의견"} · ${item.opinion.recentOpinionCount}건` : "데이터 없음"}
                    </div>
                  </div>
                </div>

                {item.issues && item.issues.length > 0 && (
                  <div className="flex flex-col gap-2">
                    {item.issues.map(issue => (
                      <div key={issue.id} className="border-l-2 border-indigo-100 dark:border-indigo-900 pl-3">
                        <div className="text-sm font-semibold text-slate-800 dark:text-zinc-200 line-clamp-1">{issue.title}</div>
                        <div className="text-xs text-slate-500 dark:text-zinc-400 line-clamp-1">{issue.summary}</div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <p className="text-sm text-slate-500 italic">리포트 준비 중입니다. 상세 화면 진입 후 데이터가 갱신될 수 있습니다.</p>
            )}

            <div className="flex justify-end">
              <Link href={`/stocks/${sym}`} className="text-xs font-medium text-indigo-600 hover:text-indigo-800 transition-colors">
                상세 리포트 보기 &rarr;
              </Link>
            </div>
          </div>
        );
      })}
    </div>
  );
}
