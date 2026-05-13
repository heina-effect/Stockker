"use client";

import { useEffect, useState } from "react";
import type { SourceItem } from "@/types/research";
import { Link2, Clock, CheckCircle2, Newspaper, FileText, ChevronDown, ChevronUp, AlertCircle } from "lucide-react";
import { formatResearchDate } from "@/lib/date-format";

const QUALITY_BADGE: Record<string, { label: string; cls: string }> = {
  high:   { label: "근거 충분", cls: "text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20 border-emerald-100 dark:border-emerald-900/30" },
  medium: { label: "근거 보통", cls: "text-amber-600 bg-amber-50 dark:bg-amber-900/20 border-amber-100 dark:border-amber-900/30" },
  low:    { label: "근거 부족", cls: "text-slate-500 bg-slate-100 dark:bg-zinc-800 border-slate-200 dark:border-zinc-700" },
};

const PAGE_SIZE = 5;

/**
 * 소스의 실제 발행/공시 날짜를 반환한다.
 * generatedAt = 원본 날짜 (뉴스 발행일 또는 DART 공시 접수일 rcept_dt)
 * collectedAt = Stockker 수집 시각 (항상 현재에 가까움, 표시에 부적합)
 */
function getSourceDate(src: SourceItem): Date | null {
  const raw = src.generatedAt || src.collectedAt;
  if (!raw) return null;
  const d = new Date(raw);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * 소스 타입에 따른 날짜 레이블 반환
 * 공시: "공시일", 뉴스: "발행일"
 */
function getDateLabel(src: SourceItem): string {
  return src.sourceType === "disclosure" ? "공시일" : "발행일";
}

function formatSourceDate(date: Date): string {
  return formatResearchDate(date);
}

function sortByDate(items: SourceItem[]): SourceItem[] {
  return [...items].sort(
    (a, b) =>
      new Date(b.generatedAt || b.collectedAt || 0).getTime() -
      new Date(a.generatedAt || a.collectedAt || 0).getTime()
  );
}

function SkeletonSource() {
  return (
    <div className="animate-pulse flex flex-col gap-2 p-3 rounded-xl bg-slate-50 dark:bg-zinc-950 border border-slate-100 dark:border-zinc-800">
      <div className="flex items-center gap-2">
        <div className="w-8 h-3 bg-slate-200 dark:bg-zinc-700 rounded" />
        <div className="w-12 h-3 bg-slate-100 dark:bg-zinc-800 rounded ml-auto" />
      </div>
      <div className="w-full h-3 bg-slate-200 dark:bg-zinc-700 rounded" />
      <div className="w-3/4 h-3 bg-slate-100 dark:bg-zinc-800 rounded" />
    </div>
  );
}

export function SourceListCard({ symbol }: { symbol: string }) {
  const [sources, setSources] = useState<SourceItem[]>([]);
  const [sourceCount, setSourceCount] = useState(0);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setError(false);

    fetch(`/api/stocks/${symbol}/issues`)
      .then(r => { if (!r.ok) throw new Error("API error"); return r.json(); })
      .then(d => {
        if (!mounted) return;
        if (d.ok && d.sources) {
          const sorted = sortByDate(d.sources);
          setSources(sorted.slice(0, PAGE_SIZE));
          setSourceCount(sorted.length);
          setHasMore(sorted.length > PAGE_SIZE);
        } else {
          setError(true);
        }
      })
      .catch(() => { if (mounted) setError(true); })
      .finally(() => { if (mounted) setLoading(false); });

    return () => { mounted = false; };
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

  const disclosureCount = sources.filter(s => s.sourceType === "disclosure").length;
  const newsCount = sources.filter(s => s.sourceType === "news").length;

  return (
    <div className="bg-white dark:bg-zinc-900 rounded-[24px] p-6 shadow-sm border border-transparent">
      <div className="flex items-center justify-between mb-1">
        <h3 className="font-bold text-slate-900 dark:text-zinc-50 flex items-center gap-2">
          AI 분석 근거 소스
          <CheckCircle2 className="w-4 h-4 text-emerald-500" />
        </h3>
        <span className="text-[10px] text-slate-400 dark:text-zinc-500">
          {!loading && sourceCount > 0 ? `총 ${sourceCount}건` : ""}
        </span>
      </div>

      {loading ? (
        <div className="flex flex-col gap-3">
          <p className="text-xs text-slate-400 dark:text-zinc-500">불러오는 중...</p>
          {[1, 2, 3].map(i => <SkeletonSource key={i} />)}
        </div>
      ) : error ? (
        <div className="flex items-center gap-2 text-sm text-slate-400 dark:text-zinc-500 py-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          소스 데이터를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.
        </div>
      ) : sources.length === 0 ? (
        <div className="text-sm text-slate-400 dark:text-zinc-500 py-2">
          분석 근거 소스가 없습니다.
        </div>
      ) : (
        <>
          {/* 소스 유형 요약 */}
          {(disclosureCount > 0 || newsCount > 0) && (
            <div className="flex gap-2 mb-4">
              {newsCount > 0 && (
                <span className="flex items-center gap-1 text-[10px] text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/20 px-2 py-0.5 rounded-full">
                  <Newspaper className="w-2.5 h-2.5" />뉴스 {newsCount}건
                </span>
              )}
              {disclosureCount > 0 && (
                <span className="flex items-center gap-1 text-[10px] text-teal-600 dark:text-teal-400 bg-teal-50 dark:bg-teal-900/20 px-2 py-0.5 rounded-full">
                  <FileText className="w-2.5 h-2.5" />공시 {disclosureCount}건
                </span>
              )}
            </div>
          )}

      <ul className="flex flex-col gap-3">
        {sources.map(src => {
          const qLabel = (src as any)._qualityLabel as string | undefined;
          const badge = qLabel ? QUALITY_BADGE[qLabel] : null;
          const strategyTags: string[] = (src as any)._strategyTags ?? [];
          const confirmCount: number = (src as any)._crossConfirmCount ?? 0;
          const sourceDate = getSourceDate(src);
          const dateLabel = getDateLabel(src);

          return (
            <li key={src.id} className="flex flex-col gap-1 p-3 rounded-xl bg-slate-50 dark:bg-zinc-950 border border-slate-100 dark:border-zinc-800">
              {/* Header row */}
              <div className="flex items-center justify-between flex-wrap gap-1">
                <div className="flex items-center gap-1.5">
                  {src.sourceType === "disclosure" ? (
                    <span className="flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded bg-teal-50 dark:bg-teal-900/20 text-teal-600 dark:text-teal-400 border border-teal-100 dark:border-teal-900/40 uppercase">
                      <FileText className="w-2.5 h-2.5" />공시
                    </span>
                  ) : (
                    <span className="flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-900/40 uppercase">
                      <Newspaper className="w-2.5 h-2.5" />뉴스
                    </span>
                  )}
                  {badge && (
                    <span className={`text-[9px] px-1.5 py-0.5 rounded border ${badge.cls}`}>{badge.label}</span>
                  )}
                  {confirmCount > 1 && (
                    <span className="text-[9px] text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 px-1 rounded">
                      {confirmCount}건 확인
                    </span>
                  )}
                </div>
                {/* 실제 공시일/발행일 표시 (수집 시각 아님) */}
                {sourceDate && (
                  <span className="flex items-center gap-1 text-[10px] text-slate-400 dark:text-zinc-500">
                    <Clock className="w-2.5 h-2.5" />
                    <span className="text-slate-300 dark:text-zinc-600">{dateLabel}</span>
                    {formatSourceDate(sourceDate)}
                  </span>
                )}
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
                <span className="text-[10px] text-slate-500 dark:text-zinc-500">{src.provider}</span>
                <div className="flex items-center gap-1.5">
                  {strategyTags.slice(0, 2).map(tag => (
                    <span key={tag} className="text-[8px] text-violet-500 dark:text-violet-400 bg-violet-50 dark:bg-violet-900/20 px-1 rounded">{tag}</span>
                  ))}
                  {src.url && <Link2 className="w-3 h-3 text-slate-300 dark:text-zinc-600" />}
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      {hasMore && (
        <button
          onClick={loadMore}
          disabled={loadingMore}
          className="w-full mt-4 flex items-center justify-center gap-1 text-xs text-indigo-500 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300 transition-colors disabled:opacity-50"
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
          className="w-full mt-4 flex items-center justify-center gap-1 text-xs text-slate-400 hover:text-slate-600 dark:hover:text-zinc-300 transition-colors"
        >
          <ChevronUp className="w-3.5 h-3.5" />접기
        </button>
      )}

      <p className="mt-4 text-[10px] text-slate-400 dark:text-zinc-500 leading-relaxed">
        실제 뉴스 및 Open DART 공시 데이터를 기반으로 AI 선별 후 분석합니다. 환각(Hallucination) 현상이 일부 있을 수 있습니다.
      </p>
        </>
      )}
    </div>
  );
}
