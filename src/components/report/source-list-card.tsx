"use client";

import { useEffect, useState } from "react";
import type { IssueItem } from "@/types/research";
import { Link2 } from "lucide-react";

export function SourceListCard({ symbol }: { symbol: string }) {
  const [sources, setSources] = useState<IssueItem[]>([]);

  useEffect(() => {
    // 이슈 목록을 출처 표시용으로 재사용 (mock data)
    fetch(`/api/stocks/${symbol}/issues`)
      .then(r => r.json())
      .then(d => {
        if (d.ok) setSources(d.issues);
      });
  }, [symbol]);

  if (sources.length === 0) return null;

  return (
    <div className="bg-white dark:bg-zinc-900 rounded-[24px] p-6 shadow-sm border">
      <h3 className="font-bold text-slate-900 dark:text-zinc-50 mb-4">
        AI 분석 출처 데이터
      </h3>
      
      <ul className="flex flex-col gap-2">
        {sources.map(src => (
          <li key={src.id} className="flex items-center gap-2 text-xs text-slate-500 dark:text-zinc-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors cursor-pointer group">
            <Link2 className="w-3 h-3 group-hover:rotate-45 transition-transform" />
            <span className="truncate flex-1">{src.source} - {src.title}</span>
          </li>
        ))}
      </ul>
      <p className="mt-4 text-[10px] text-slate-400">
        위 원문 데이터를 기반으로 AI 요약이 생성되었습니다. 환각(Hallucination) 현상이 일부 있을 수 있습니다.
      </p>
    </div>
  );
}
