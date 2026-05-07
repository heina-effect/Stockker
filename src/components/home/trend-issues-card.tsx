"use client";
import { useEffect, useState } from "react";
import { Clock, TrendingUp } from "lucide-react";

export function TrendIssuesCard() {
  const [issues, setIssues] = useState<any[]>([]);

  useEffect(() => {
    fetch("/api/home/issues").then(r => r.json()).then(d => setIssues(d.issues || []));
  }, []);

  return (
    <div className="bg-white dark:bg-zinc-900 rounded-[24px] p-6 border shadow-sm flex flex-col h-full">
      <h3 className="font-bold text-lg text-slate-900 dark:text-zinc-50 mb-4 flex items-center gap-2">
        <TrendingUp className="w-5 h-5 text-indigo-500" />
        실시간 핵심 이슈
      </h3>
      <div className="flex flex-col gap-4">
        {issues.map(issue => (
          <div key={issue.id} className="border-l-2 border-indigo-200 dark:border-indigo-900 pl-4 py-1">
            <h4 className="font-semibold text-sm text-slate-800 dark:text-zinc-200 mb-1">{issue.title}</h4>
            <p className="text-xs text-slate-500 dark:text-zinc-400 line-clamp-2 mb-2">{issue.description}</p>
            <div className="flex items-center text-[10px] text-slate-400 gap-1">
              <Clock className="w-3 h-3" />
              {new Date(issue.timestamp).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}
            </div>
          </div>
        ))}
        {issues.length === 0 && <div className="text-sm text-slate-400">불러오는 중...</div>}
      </div>
    </div>
  );
}
