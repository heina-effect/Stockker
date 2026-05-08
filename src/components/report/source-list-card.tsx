"use client";

import { useEffect, useState } from "react";
import type { SourceItem } from "@/types/research";
import { Link2, Clock, CheckCircle2, Newspaper, FileText, ChevronDown, ChevronUp } from "lucide-react";

const QUALITY_BADGE: Record<string, { label: string; cls: string }> = {
  high:   { label: "근거 충분", cls: "text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20 border-emerald-100" },
  medium: { label: "근거 보통", cls: "text-amber-600 bg-amber-50 dark:bg-amber-900/20 border-amber-100" },
  low:    { label: "근거 부족", cls: "text-slate-500 bg-slate-100 dark:bg-zinc-800 border-slate-200" },
};

const PAGE_SIZE = 5;

export function SourceListCard({ symbol }: { symbol: string }) {
  const [sources, setSources] = useState<SourceItem[]>([]);
  const [generatedAt, setGeneratedAt] = useState<string>("");
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  // Initial load from /issues endpoint (provides real-time curated sources)
  useEffect(() => {
    fetch(`/api/stocks/${symbol}/issues`)
      .then(r => r.json())
      .then(d => {
        if (d.ok && d.sources) {
          setSources(d.sources.slice(0, PAGE_SIZE));
          setHasMore(d.sources.length > PAGE_SIZE);
          setGeneratedAt(new Date().toISOString());
        }
      })
      .catch(() => {});
  }, [symbol]);

  const loadMore = async () => {
    setLoadingMore(true);
    try {
      const nextPage = page + 1;
      const res = await fetch(`/api/stocks/${symbol}/sources?page=${nextPage}&limit=${PAGE_SIZE}`);
      const d = await res.json();
      if (d.ok && d.sources?.length > 0) {
        setSources(prev => {
          const ids = new Set(prev.map(s => s.id));
          const newItems = d.sources.filter((s: SourceItem) => !ids.has(s.id));
          return [...prev, ...newItems];
        });
        setHasMore(d.hasMore ?? false);
        setPage(nextPage);
      } else {
        setHasMore(false);
      }
    } catch {
      setHasMore(false);
    }
    setLoadingMore(false);
  };

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
            수집: {new Date(generatedAt).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}
          </span>
        )}
      </div>

      <ul className="flex flex-col gap-3">
        {sources.map(src => {
          const qLabel = (src as any)._qualityLabel as string | undefined;
          const badge = qLabel ? QUALITY_BADGE[qLabel] : null;
          const strategyTags: string[] = (src as any)._strategyTags ?? [];
          const confirmCount: number = (src as any)._crossConfirmCount ?? 0;

          return (
            <li key={src.id} className="flex flex-col gap-1 p-3 rounded-xl bg-slate-50 dark:bg-zinc-950 border border-slate-100 dark:border-zinc-800">
              {/* Header row */}
              <div className="flex items-center justify-between flex-wrap gap-1">
                <div className="flex items-center gap-1.5">
                  {src.sourceType === "disclosure" ? (
                    <span className="flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded bg-teal-50 dark:bg-teal-900/20 text-teal-600 border border-teal-100 uppercase">
                      <FileText className="w-2.5 h-2.5" />공시
                    </span>
                  ) : (
                    <span className="flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 border border-indigo-100 uppercase">
                      <Newspaper className="w-2.5 h-2.5" />뉴스
                    </span>
                  )}
                  {badge && (
                    <span className={`text-[9px] px-1.5 py-0.5 rounded border ${badge.cls}`}>{badge.label}</span>
                  )}
                  {confirmCount > 1 && (
                    <span className="text-[9px] text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20 px-1 rounded">
                      {confirmCount}건 확인
                    </span>
                  )}
                </div>
                <span className="text-[10px] text-slate-400">
                  {new Date(src.collectedAt).toLocaleDateString("ko-KR")}
                </span>
              </div>

              {/* Title */}
              <a
                href={src.url || "#"}
                target={src.url ? "_blank" : undefined}
                rel={src.url ? "noopener noreferrer" : undefined}
                className={`text-xs font-medium text-slate-700 dark:text-zinc-300 mt-0.5 line-clamp-2 ${src.url ? "hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors cursor-pointer" : ""}`}
              >
                {src.title}
              </a>

              {/* Footer row */}
              <div className="flex items-center justify-between mt-1">
                <span className="text-[10px] text-slate-500">{src.provider}</span>
                <div className="flex items-center gap-1.5">
                  {strategyTags.slice(0, 2).map(tag => (
                    <span key={tag} className="text-[8px] text-violet-500 bg-violet-50 dark:bg-violet-900/20 px-1 rounded">{tag}</span>
                  ))}
                  {src.url && <Link2 className="w-3 h-3 text-slate-300" />}
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      {/* Pagination: 더 보기 */}
      {hasMore && (
        <button
          onClick={loadMore}
          disabled={loadingMore}
          className="w-full mt-4 flex items-center justify-center gap-1 text-xs text-indigo-500 hover:text-indigo-700 transition-colors disabled:opacity-50"
        >
          {loadingMore ? (
            <span className="animate-pulse">불러오는 중...</span>
          ) : (
            <>
              <ChevronDown className="w-3.5 h-3.5" />더 보기
            </>
          )}
        </button>
      )}

      {!hasMore && sources.length > PAGE_SIZE && (
        <button
          onClick={() => { setSources(s => s.slice(0, PAGE_SIZE)); setPage(1); setHasMore(true); }}
          className="w-full mt-4 flex items-center justify-center gap-1 text-xs text-slate-400 hover:text-slate-600 transition-colors"
        >
          <ChevronUp className="w-3.5 h-3.5" />접기
        </button>
      )}

      <p className="mt-4 text-[10px] text-slate-400 leading-relaxed">
        실제 뉴스 및 Open DART 공시 데이터를 기반으로 AI 선별 후 분석합니다. 환각(Hallucination) 현상이 일부 있을 수 있습니다.
      </p>
    </div>
  );
}
