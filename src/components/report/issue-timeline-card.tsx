"use client";

import { useEffect, useState } from "react";
import type { IssueItem } from "@/types/research";
import { Clock } from "lucide-react";

export function IssueTimelineCard({ symbol }: { symbol: string }) {
  const [issues, setIssues] = useState<IssueItem[]>([]);

  useEffect(() => {
    fetch(`/api/stocks/${symbol}/issues`)
      .then(r => r.json())
      .then(d => {
        if (d.ok) setIssues(d.issues);
      });
  }, [symbol]);

  if (issues.length === 0) {
    return <div className="h-64 bg-white dark:bg-zinc-900 rounded-[24px] border animate-pulse" />;
  }

  return (
    <div className="bg-white dark:bg-zinc-900 rounded-[24px] p-6 shadow-sm border flex flex-col h-full max-h-[400px]">
      <div className="flex items-center justify-between mb-6">
        <h3 className="font-bold text-slate-900 dark:text-zinc-50 flex items-center gap-2">
          최근 핵심 이슈
        </h3>
        <span className="text-xs text-slate-400">AI 요약</span>
      </div>

      <div className="flex-1 overflow-y-auto pr-2 flex flex-col gap-5">
        {issues.map((issue) => (
          <div key={issue.id} className="relative pl-4 border-l-2 border-slate-100 dark:border-zinc-800 pb-2 last:pb-0">
            {/* Timeline dot */}
            <div className={`absolute -left-[5px] top-1.5 w-2 h-2 rounded-full ring-4 ring-white dark:ring-zinc-900 ${
              issue.impact === "positive" ? "bg-red-500" :
              issue.impact === "negative" ? "bg-blue-500" : "bg-slate-400"
            }`} />
            
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 dark:bg-zinc-800 text-slate-500 uppercase">
                {issue.sourceType}
              </span>
              <span className="text-xs text-slate-400 flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {new Date(issue.timestamp).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}
              </span>
            </div>
            
            <h4 className="text-sm font-semibold text-slate-800 dark:text-zinc-200 mb-1 leading-snug">
              {issue.title}
            </h4>
            
            <p className="text-xs text-slate-500 dark:text-zinc-400 leading-relaxed line-clamp-2">
              {issue.summary}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
