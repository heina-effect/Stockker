"use client";

import { useEffect, useState } from "react";
import type { SentimentScore } from "@/types/research";
import { CheckCircle2, TrendingDown, Clock, Link2 } from "lucide-react";

export function SentimentScoreCard({ symbol }: { symbol: string }) {
  const [data, setData] = useState<SentimentScore | null>(null);

  useEffect(() => {
    fetch(`/api/stocks/${symbol}/sentiment`)
      .then(r => r.json())
      .then(d => {
        if (d.ok) setData(d.sentiment);
      });
  }, [symbol]);

  if (!data) return (
    <div className="bg-white dark:bg-zinc-900 rounded-[24px] p-6 shadow-sm border border-transparent h-[340px] flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="font-bold text-slate-900 dark:text-zinc-50">AI 감성 점수</h3>
          <span className="text-[10px] text-slate-400 flex items-center gap-1 mt-1">
            <Clock className="w-3 h-3" />
            분석 중...
          </span>
        </div>
        <div className="px-4 py-2 rounded-full bg-slate-100 dark:bg-zinc-800 animate-pulse w-24 h-8" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4 flex-1">
        <div className="bg-slate-50 dark:bg-zinc-950/20 border border-slate-100 dark:border-zinc-800 rounded-2xl p-4 animate-pulse" />
        <div className="bg-slate-50 dark:bg-zinc-950/20 border border-slate-100 dark:border-zinc-800 rounded-2xl p-4 animate-pulse" />
      </div>
      <div className="pt-4 border-t border-slate-100 dark:border-zinc-800 animate-pulse">
        <div className="h-4 bg-slate-100 dark:bg-zinc-800 rounded w-1/3 mb-2" />
        <div className="h-8 bg-slate-50 dark:bg-zinc-950 rounded border border-slate-100 dark:border-zinc-800" />
      </div>
    </div>
  );

  return (
    <div className="bg-white dark:bg-zinc-900 rounded-[24px] p-6 shadow-sm border border-transparent">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="font-bold text-slate-900 dark:text-zinc-50">AI 감성 점수</h3>
          <span className="text-[10px] text-slate-400 flex items-center gap-1 mt-1">
            <Clock className="w-3 h-3" />
            {new Date(data.generatedAt).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}
          </span>
        </div>
        <div className={`px-4 py-2 text-sm font-bold rounded-full ${
          data._isFallback ? "bg-slate-100 text-slate-400 dark:bg-zinc-800 dark:text-zinc-500" :
          data.label === "긍정" ? "bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-400" :
          data.label === "부정" ? "bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400" :
          "bg-slate-100 text-slate-600 dark:bg-zinc-800 dark:text-zinc-300"
        }`}>
          {data._isFallback ? "-" : data.score}점 / 100점 ({data._isFallback ? "판단불가" : data.label})
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
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

      <div className="pt-4 border-t border-slate-100 dark:border-zinc-800">
        {(data as any)._isFallback ? (
          <div className="flex items-center gap-2 py-3 px-4 bg-amber-50 dark:bg-amber-950/20 border border-amber-100 dark:border-amber-900/30 rounded-xl text-xs text-amber-700 dark:text-amber-400">
            <span className="shrink-0">⚠</span>
            <span>충분한 실시간 데이터를 수집하지 못했습니다. 잠시 후 다시 시도해 주세요.</span>
          </div>
        ) : (
          <>
            <h4 className="text-xs font-bold text-slate-500 mb-2">AI 분석 출처 ({data.basisSources?.length || 0}건)</h4>
            <SourceList sources={data.basisSources} />
          </>
        )}
      </div>
      {(data as any)._meta && process.env.NODE_ENV === "development" && (
        <div className="mt-4 pt-2 border-t border-dashed border-slate-200 dark:border-zinc-800 text-[9px] text-slate-400 flex flex-wrap gap-2">
          <span className="font-mono bg-slate-100 dark:bg-zinc-800 px-1 rounded">Dev Meta</span>
          <span>{`Model: ${(data as any)._meta.model}`}</span>
          <span className={(data as any)._meta.mode === 'real' ? 'text-green-500' : 'text-amber-500'}>{`Mode: ${(data as any)._meta.mode}`}</span>
          <span>{`Latency: ${(data as any)._meta.latencyMs}ms`}</span>
          {(data as any)._meta.sourceCount !== undefined && <span>{`Sources: ${(data as any)._meta.sourceCount}`}</span>}
          {(data as any)._meta.fallbackReason && <span className="text-amber-500 break-all">{`Reason: ${(data as any)._meta.fallbackReason}`}</span>}
        </div>
      )}
    </div>
  );
}

const QUALITY_BADGE: Record<string, { label: string; cls: string }> = {
  high:   { label: "근거 충분", cls: "text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20" },
  medium: { label: "근거 보통", cls: "text-amber-600 bg-amber-50 dark:bg-amber-900/20" },
  low:    { label: "근거 부족", cls: "text-slate-500 bg-slate-100 dark:bg-zinc-800" },
};

function SourceList({ sources }: { sources?: any[] }) {
  const [expanded, setExpanded] = useState(false);
  const items = sources ?? [];
  const visible = expanded ? items : items.slice(0, 3);

  if (items.length === 0) {
    return <p className="text-xs text-slate-400">출처 정보가 없습니다.</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      {visible.map((src) => {
        const badge = src._qualityLabel ? QUALITY_BADGE[src._qualityLabel] : null;
        return (
          <a key={src.id} href={src.url || "#"} target={src.url ? "_blank" : undefined}
            rel={src.url ? "noopener noreferrer" : undefined}
            className="flex items-center justify-between bg-slate-50 dark:bg-zinc-950 p-2 rounded border border-slate-100 dark:border-zinc-800 hover:border-indigo-200 transition-colors group">
            <div className="flex flex-col gap-0.5 truncate">
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] bg-white dark:bg-zinc-800 border px-1 rounded text-slate-500 uppercase">{src.sourceType}</span>
                {badge && (
                  <span className={`text-[9px] px-1 rounded ${badge.cls}`}>{badge.label}</span>
                )}
              </div>
              <span className="text-xs text-slate-600 dark:text-zinc-400 truncate">{src.title}</span>
            </div>
            <Link2 className="w-3 h-3 text-slate-300 group-hover:text-indigo-400 flex-shrink-0 ml-2" />
          </a>
        );
      })}
      {items.length > 3 && (
        <button onClick={() => setExpanded(e => !e)}
          className="text-xs text-indigo-500 hover:text-indigo-700 mt-1 text-center transition-colors">
          {expanded ? "접기 ↑" : `더 보기 (${items.length - 3}건 더) ↓`}
        </button>
      )}
    </div>
  );
}
