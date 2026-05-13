"use client";
import { Clock, TrendingUp, Zap } from "lucide-react";

import { useHomeIntelligence } from "./home-intelligence-provider";

function IssuesSkeleton() {
  return (
    <div className="flex flex-col gap-4 animate-pulse">
      {[1, 2, 3].map(i => (
        <div key={i} className="border-l-2 border-slate-100 dark:border-zinc-800 pl-4 py-1">
          <div className="w-4/5 h-4 bg-slate-100 dark:bg-zinc-800 rounded mb-2" />
          <div className="w-full h-3 bg-slate-50 dark:bg-zinc-800/60 rounded mb-1" />
          <div className="w-2/3 h-3 bg-slate-50 dark:bg-zinc-800/60 rounded" />
        </div>
      ))}
    </div>
  );
}

function TrendBar({ strength }: { strength: number }) {
  const pct = Math.max(0, Math.min(100, strength));
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-10 h-1 bg-slate-100 dark:bg-zinc-800 rounded-full overflow-hidden">
        <div className="h-full bg-indigo-400 dark:bg-indigo-500 rounded-full" style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[9px] text-slate-400 dark:text-zinc-500 tabular-nums">{pct}</span>
    </div>
  );
}

export function TrendIssuesCard() {
  const { data, isLoading, error } = useHomeIntelligence();
  const issues: any[] = data?.issues || [];

  return (
    <div className="bg-white dark:bg-zinc-900 rounded-[24px] p-6 border border-transparent shadow-sm flex flex-col h-full">
      <h3 className="font-bold text-lg text-slate-900 dark:text-zinc-50 mb-4 flex items-center gap-2">
        <TrendingUp className="w-5 h-5 text-indigo-500" />
        지금 중요한 이슈
      </h3>
      <div className="flex flex-col gap-4 flex-1">
        {isLoading ? (
          <IssuesSkeleton />
        ) : error ? (
          <div className="text-sm text-slate-400 dark:text-zinc-500 italic">이슈 데이터를 불러오지 못했습니다.</div>
        ) : issues.length === 0 ? (
          <div className="text-sm text-slate-400 dark:text-zinc-500 italic">현재 집계된 핵심 이슈가 없습니다.</div>
        ) : (
          issues.map((issue, idx) => (
            <div
              key={issue.id}
              className="border-l-2 border-indigo-200 dark:border-indigo-800 pl-4 py-1"
            >
              <div className="flex items-start justify-between gap-2 mb-1">
                <h4 className="font-semibold text-sm text-slate-800 dark:text-zinc-200 leading-tight flex-1">
                  {issue.title}
                </h4>
                {idx === 0 && (
                  <span className="flex-shrink-0 flex items-center gap-0.5 text-[9px] text-indigo-500 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/20 px-1.5 py-0.5 rounded-full font-bold">
                    <Zap className="w-2.5 h-2.5" />주목
                  </span>
                )}
              </div>
              {/* 왜 중요한가 — AI가 작성한 description */}
              <p className="text-xs text-slate-500 dark:text-zinc-400 line-clamp-2 mb-2 leading-relaxed">
                {issue.description}
              </p>
              <div className="flex items-center justify-between">
                <div className="flex items-center text-[10px] text-slate-400 dark:text-zinc-500 gap-1">
                  <Clock className="w-3 h-3" />
                  {new Date(issue.timestamp).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}
                </div>
                {issue.trendStrength && <TrendBar strength={issue.trendStrength} />}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
