"use client";

import { useEffect, useState } from "react";
import type { SourceItem } from "@/types/research";
import { Link2, Clock, CheckCircle2 } from "lucide-react";

export function SourceListCard({ symbol }: { symbol: string }) {
  const [sources, setSources] = useState<SourceItem[]>([]);
  const [generatedAt, setGeneratedAt] = useState<string>("");

  useEffect(() => {
    fetch(`/api/stocks/${symbol}/issues`)
      .then(r => r.json())
      .then(d => {
        if (d.ok) {
          setSources(d.sources);
          setGeneratedAt(new Date().toISOString());
        }
      });
  }, [symbol]);

  if (sources.length === 0) return null;

  return (
    <div className="bg-white dark:bg-zinc-900 rounded-[24px] p-6 shadow-sm border">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-bold text-slate-900 dark:text-zinc-50 flex items-center gap-2">
          AI 분석 출처 데이터
          <CheckCircle2 className="w-4 h-4 text-green-500" />
        </h3>
        {generatedAt && (
          <span className="text-[10px] text-slate-400 flex items-center gap-1">
            <Clock className="w-3 h-3" />
            생성: {new Date(generatedAt).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}
          </span>
        )}
      </div>
      
      <ul className="flex flex-col gap-3">
        {sources.map(src => (
          <li key={src.id} className="flex flex-col gap-1 p-3 rounded-xl bg-slate-50 dark:bg-zinc-950 border border-slate-100 dark:border-zinc-800">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-white dark:bg-zinc-800 text-slate-500 uppercase border">
                {src.sourceType}
              </span>
              <span className="text-[10px] text-slate-400 flex items-center gap-1">
                수집: {new Date(src.collectedAt).toLocaleDateString("ko-KR")} {new Date(src.collectedAt).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}
              </span>
            </div>
            
            <a 
              href={src.url || "#"} 
              target={src.url ? "_blank" : undefined}
              rel={src.url ? "noopener noreferrer" : undefined}
              className={`text-xs font-medium text-slate-700 dark:text-zinc-300 mt-1 line-clamp-2 ${src.url ? 'hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors cursor-pointer group' : ''}`}
            >
              {src.title}
            </a>
            
            <div className="flex items-center justify-between mt-1">
              <span className="text-[10px] text-slate-500 font-medium">출처: {src.provider}</span>
              {src.url && <Link2 className="w-3 h-3 text-slate-300 group-hover:text-indigo-500" />}
            </div>
          </li>
        ))}
      </ul>
      <p className="mt-4 text-[10px] text-slate-400 leading-relaxed">
        실제 뉴스 및 Open DART 공시 데이터를 기반으로 AI 요약이 생성되었습니다. 환각(Hallucination) 현상이 일부 있을 수 있습니다.
      </p>
    </div>
  );
}
