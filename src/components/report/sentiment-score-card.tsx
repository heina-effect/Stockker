"use client";

import { useEffect, useState } from "react";
import type { SentimentInsight } from "@/types/research";
import { CheckCircle2, TrendingDown } from "lucide-react";

export function SentimentScoreCard({ symbol }: { symbol: string }) {
  const [data, setData] = useState<SentimentInsight | null>(null);

  useEffect(() => {
    fetch(`/api/stocks/${symbol}/sentiment`)
      .then(r => r.json())
      .then(d => {
        if (d.ok) setData(d.sentiment);
      });
  }, [symbol]);

  if (!data) return <div className="h-48 bg-white dark:bg-zinc-900 rounded-[24px] border animate-pulse" />;

  return (
    <div className="bg-white dark:bg-zinc-900 rounded-[24px] p-6 shadow-sm border">
      <div className="flex items-center justify-between mb-6">
        <h3 className="font-bold text-slate-900 dark:text-zinc-50">AI 감성 점수</h3>
        <div className="bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400 px-3 py-1 text-sm font-bold rounded-full">
          {data.score}점 / 100
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Positive */}
        <div className="bg-red-50/50 dark:bg-red-950/20 border border-red-100 dark:border-red-900/50 rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-3 text-red-700 dark:text-red-400 font-bold text-sm">
            <CheckCircle2 className="w-4 h-4" /> 주요 호재 (Positive)
          </div>
          <ul className="flex flex-col gap-2">
            {data.positiveFactors.map((factor, i) => (
              <li key={i} className="text-sm text-slate-700 dark:text-zinc-300 flex items-start gap-2">
                <span className="text-red-400 mt-0.5">•</span>
                <span>{factor}</span>
              </li>
            ))}
          </ul>
        </div>
        
        {/* Negative */}
        <div className="bg-blue-50/50 dark:bg-blue-950/20 border border-blue-100 dark:border-blue-900/50 rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-3 text-blue-700 dark:text-blue-400 font-bold text-sm">
            <TrendingDown className="w-4 h-4" /> 주요 악재 (Negative)
          </div>
          <ul className="flex flex-col gap-2">
            {data.negativeFactors.map((factor, i) => (
              <li key={i} className="text-sm text-slate-700 dark:text-zinc-300 flex items-start gap-2">
                <span className="text-blue-400 mt-0.5">•</span>
                <span>{factor}</span>
              </li>
            ))}
            {data.negativeFactors.length === 0 && (
              <li className="text-sm text-slate-500">뚜렷한 악재가 감지되지 않았습니다.</li>
            )}
          </ul>
        </div>
      </div>
    </div>
  );
}
