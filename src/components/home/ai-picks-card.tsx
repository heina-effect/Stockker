"use client";
import { useEffect, useState } from "react";
import { Sparkles, AlertTriangle } from "lucide-react";
import Link from "next/link";

export function AIPicksCard() {
  const [picks, setPicks] = useState<any[]>([]);

  useEffect(() => {
    fetch("/api/home/ai-picks").then(r => r.json()).then(d => setPicks(d.picks || []));
  }, []);

  return (
    <div className="bg-gradient-to-br from-indigo-50 to-white dark:from-indigo-950/20 dark:to-zinc-900 rounded-[24px] p-6 border border-indigo-100 dark:border-indigo-900/30 shadow-sm flex flex-col h-full">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-bold text-lg text-indigo-900 dark:text-indigo-100 flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-indigo-500" />
          AI 포착 후보
        </h3>
      </div>
      
      <div className="flex flex-col gap-4 flex-1">
        {picks.map(pick => (
          <div key={pick.id} className="bg-white dark:bg-zinc-950 p-4 rounded-xl border border-indigo-50 dark:border-indigo-900/20 shadow-sm">
            <div className="flex justify-between items-start mb-2">
              <div>
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300 uppercase mr-2">
                  {pick.recommendationType === "close_watch" ? "종가 관찰 후보" : "체크리스트 후보"}
                </span>
                <Link href={`/stocks/${pick.targetId}`} className="font-bold text-sm text-slate-800 dark:text-zinc-200 hover:underline">
                  {pick.name}
                </Link>
              </div>
            </div>
            
            <ul className="mb-3">
              {pick.reasons.map((r: any, idx: number) => (
                <li key={idx} className="text-xs text-slate-600 dark:text-zinc-300 flex items-start gap-1">
                  <span className="text-indigo-400">•</span>
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
        ))}
        {picks.length === 0 && <div className="text-sm text-slate-400">불러오는 중...</div>}
      </div>
    </div>
  );
}
