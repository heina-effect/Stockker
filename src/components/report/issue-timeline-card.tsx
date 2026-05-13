"use client";

import { useEffect, useState } from "react";
import type { IssueCluster } from "@/types/research";
import { Clock, Newspaper, FileText } from "lucide-react";
import { formatResearchDate } from "@/lib/date-format";

function formatClusterDate(ts: string): string {
  const date = new Date(ts);
  if (isNaN(date.getTime())) return "";
  return formatResearchDate(date);
}

export function IssueTimelineCard({ symbol }: { symbol: string }) {
  const [clusters, setClusters] = useState<IssueCluster[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    setClusters(null);
    setError(false);
    fetch(`/api/stocks/${symbol}/issues`)
      .then(r => r.json())
      .then(d => {
        if (d.ok) setClusters(d.clusters);
        else {
          setError(true);
          setClusters([]);
        }
      })
      .catch(() => {
        setError(true);
        setClusters([]);
      });
  }, [symbol]);

  return (
    <div className="bg-white dark:bg-zinc-900 rounded-[24px] p-6 shadow-sm border border-transparent flex flex-col h-full max-h-[400px]">
      <div className="flex items-center justify-between mb-6">
        <h3 className="font-bold text-slate-900 dark:text-zinc-50 flex items-center gap-2">
          최근 핵심 이슈
        </h3>
        {clusters === null ? (
          <span className="text-xs text-slate-400 animate-pulse">불러오는 중...</span>
        ) : clusters.length > 0 ? (
          <span className="text-[10px] text-violet-600 bg-violet-50 dark:bg-violet-900/20 px-2 py-0.5 rounded-full font-medium">AI 선별</span>
        ) : null}
      </div>

      {clusters === null ? (
        <div className="flex flex-col gap-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="pl-4 border-l-2 border-slate-100 dark:border-zinc-800 pb-2">
              <div className="h-3 bg-slate-100 dark:bg-zinc-800 rounded w-1/4 mb-2 animate-pulse" />
              <div className="h-4 bg-slate-100 dark:bg-zinc-800 rounded w-3/4 mb-1 animate-pulse" />
              <div className="h-3 bg-slate-50 dark:bg-zinc-850 rounded w-2/3 animate-pulse" />
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="flex flex-1 flex-col items-center justify-center py-8 text-center">
          <Newspaper className="w-8 h-8 text-slate-300 mb-3" />
          <p className="text-sm text-slate-400">이슈 데이터를 불러오지 못했습니다.</p>
          <p className="text-xs text-slate-300 mt-1">잠시 후 다시 확인해 주세요.</p>
        </div>
      ) : clusters.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center py-8 text-center">
          <Newspaper className="w-8 h-8 text-slate-300 mb-3" />
          <p className="text-sm text-slate-400">종목과 직접 연결된 최신 이슈가 없습니다.</p>
          <p className="text-xs text-slate-300 mt-1">약한 근거와 타 섹터 이슈는 표시하지 않습니다.</p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto pr-2 flex flex-col gap-5">
        {clusters.map((cluster) => (
          <div key={cluster.id} className="relative pl-4 border-l-2 border-slate-100 dark:border-zinc-800 pb-2 last:pb-0">
            {/* Timeline dot */}
            <div className={`absolute -left-[5px] top-1.5 w-2 h-2 rounded-full ring-4 ring-white dark:ring-zinc-900 ${
              cluster.sentiment === "positive" ? "bg-red-500" :
              cluster.sentiment === "negative" ? "bg-blue-500" : "bg-slate-400"
            }`} />
            
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs text-slate-400 flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {formatClusterDate(cluster.timestamp)}
              </span>
              <span className="text-[10px] text-slate-400">
                관련 출처 {cluster.sourceCount}건
              </span>
              {/* Source type icon */}
              {cluster.representativeSource === "Open DART" ? (
                <span className="flex items-center gap-0.5 text-[9px] text-teal-600 bg-teal-50 dark:bg-teal-900/20 px-1 rounded">
                  <FileText className="w-2.5 h-2.5" />공시
                </span>
              ) : (
                <span className="flex items-center gap-0.5 text-[9px] text-indigo-600 bg-indigo-50 dark:bg-indigo-900/20 px-1 rounded">
                  <Newspaper className="w-2.5 h-2.5" />뉴스
                </span>
              )}
            </div>
            
            <h4 className="text-sm font-semibold text-slate-800 dark:text-zinc-200 mb-1 leading-snug">
              {cluster.title}
            </h4>
            
            <p className="text-xs text-slate-500 dark:text-zinc-400 leading-relaxed line-clamp-2">
              {cluster.summary}
            </p>
            {/* Phase 19: Cross-confirmation indicator */}
            {cluster.sourceCount > 1 && (
              <span className="inline-flex items-center gap-1 mt-1 text-[9px] text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20 px-1.5 py-0.5 rounded">
                근거 충분 ({cluster.sourceCount}개 소스 확인)
              </span>
            )}
          </div>
        ))}
        </div>
      )}
    </div>
  );
}
