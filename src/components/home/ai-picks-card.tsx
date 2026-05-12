"use client";
import { Sparkles, AlertTriangle } from "lucide-react";
import Link from "next/link";

import { useHomeIntelligence } from "./home-intelligence-provider";

const CATEGORY_LABEL: Record<string, string> = {
  event_driven: "이벤트 주도",
  momentum: "모멘텀",
  undervalued: "저평가 주목",
};

function PicksSkeleton() {
  return (
    <div className="flex flex-col gap-4 animate-pulse">
      {[1, 2].map(i => (
        <div key={i} className="bg-white dark:bg-zinc-950 p-4 rounded-xl border border-indigo-50 dark:border-indigo-900/20">
          <div className="flex gap-2 mb-3">
            <div className="w-16 h-4 bg-indigo-100 dark:bg-indigo-900/40 rounded" />
            <div className="w-20 h-4 bg-slate-100 dark:bg-zinc-800 rounded" />
          </div>
          <div className="w-full h-3 bg-slate-50 dark:bg-zinc-800/60 rounded mb-1" />
          <div className="w-4/5 h-3 bg-slate-50 dark:bg-zinc-800/60 rounded mb-3" />
          <div className="w-full h-8 bg-slate-50 dark:bg-zinc-800/60 rounded" />
        </div>
      ))}
    </div>
  );
}

export function AIPicksCard() {
  const { data, isLoading, error } = useHomeIntelligence();
  const picks: any[] = data?.aiPicks || [];

  return (
    <div className="bg-gradient-to-br from-indigo-50 to-white dark:from-indigo-950/20 dark:to-zinc-900 rounded-[24px] p-6 border border-indigo-100 dark:border-indigo-900/30 shadow-sm flex flex-col h-full">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-bold text-lg text-indigo-900 dark:text-indigo-100 flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-indigo-500" />
          AI 포착 후보
        </h3>
      </div>

      <div className="flex flex-col gap-4 flex-1">
        {isLoading ? (
          <PicksSkeleton />
        ) : error ? (
          <div className="text-sm text-slate-400 italic">데이터를 불러오지 못했습니다.</div>
        ) : picks.length === 0 ? (
          <div className="text-sm text-slate-400 italic">현재 포착된 후보가 없습니다.</div>
        ) : (
          picks.map(pick => (
            <div key={pick.id} className="bg-white dark:bg-zinc-950 p-4 rounded-xl border border-indigo-50 dark:border-indigo-900/20 shadow-sm">
              <div className="flex flex-wrap items-center gap-1.5 mb-2">
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300 uppercase">
                  {pick.recommendationType === "close_watch" ? "관찰 후보" : "체크리스트"}
                </span>
                {pick.candidateCategory && (
                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
                    {CATEGORY_LABEL[pick.candidateCategory] || pick.candidateCategory}
                  </span>
                )}
                <Link
                  href={pick.type === "sector" ? `/sectors/${pick.targetId}` : `/stocks/${pick.targetId}`}
                  className="font-bold text-sm text-slate-800 dark:text-zinc-200 hover:underline ml-0.5"
                >
                  {pick.name}
                </Link>
              </div>

              <ul className="mb-3">
                {pick.reasons.map((r: any, idx: number) => (
                  <li key={idx} className="text-xs text-slate-600 dark:text-zinc-300 flex items-start gap-1">
                    <span className="text-indigo-400 flex-shrink-0">•</span>
                    {r.summary}
                  </li>
                ))}
              </ul>

              <div className="bg-slate-50 dark:bg-zinc-900 p-2 rounded text-[10px] text-slate-500 flex items-start gap-1">
                <AlertTriangle className="w-3 h-3 text-amber-500 flex-shrink-0 mt-0.5" />
                <span>{pick.riskSummary}</span>
              </div>

              <div className="mt-3 text-[9px] text-slate-400 text-center border-t border-slate-100 dark:border-zinc-800 pt-2">
                {pick.disclaimer}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
