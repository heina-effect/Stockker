"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { TrendingUp, TrendingDown, Eye, Zap, AlertCircle } from "lucide-react";
import type { SectorResearchSnapshot } from "@/server/research/snapshots/sector-snapshot-manager";
import type { SectorTheme } from "@/data/sectors/taxonomy";
import { getStockName } from "@/lib/stocks/metadata";

function SectorAISkeleton() {
  return (
    <div className="animate-pulse flex flex-col gap-6">
      <div className="bg-white dark:bg-zinc-900 rounded-[24px] p-6 border border-slate-100 dark:border-zinc-800">
        <div className="flex items-center justify-between mb-4">
          <div className="w-32 h-5 bg-slate-100 dark:bg-zinc-800 rounded" />
          <div className="w-20 h-4 bg-slate-100 dark:bg-zinc-800 rounded" />
        </div>
        <div className="p-4 bg-indigo-50/50 dark:bg-indigo-950/20 rounded-xl border border-indigo-100 dark:border-indigo-900/50 mb-6 space-y-2">
          <div className="w-full h-3 bg-indigo-100/60 dark:bg-indigo-900/40 rounded" />
          <div className="w-5/6 h-3 bg-indigo-100/60 dark:bg-indigo-900/40 rounded" />
          <div className="w-4/6 h-3 bg-indigo-100/60 dark:bg-indigo-900/40 rounded" />
        </div>
        <div className="w-28 h-4 bg-slate-100 dark:bg-zinc-800 rounded mb-3" />
        {[1, 2].map(i => (
          <div key={i} className="p-3 bg-slate-50 dark:bg-zinc-950 border border-slate-100 dark:border-zinc-800 rounded-lg mb-2">
            <div className="w-3/5 h-4 bg-slate-100 dark:bg-zinc-800 rounded mb-1" />
            <div className="w-full h-3 bg-slate-50 dark:bg-zinc-800/60 rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}

function SectorAIGenerating() {
  return (
    <div className="bg-white dark:bg-zinc-900 rounded-[24px] p-8 border border-slate-100 dark:border-zinc-800 flex flex-col items-center gap-4">
      <div className="flex items-center gap-2">
        <span className="w-2 h-2 bg-indigo-500 rounded-full animate-bounce [animation-delay:0ms]" />
        <span className="w-2 h-2 bg-indigo-500 rounded-full animate-bounce [animation-delay:150ms]" />
        <span className="w-2 h-2 bg-indigo-500 rounded-full animate-bounce [animation-delay:300ms]" />
      </div>
      <div className="text-center">
        <p className="text-sm font-semibold text-slate-700 dark:text-zinc-300">AI 섹터 분석 생성 중</p>
        <p className="text-xs text-slate-400 dark:text-zinc-500 mt-1">최신 뉴스와 공시를 기반으로 분석 중입니다. 잠시만 기다려 주세요.</p>
      </div>
    </div>
  );
}

function TrendStrengthBar({ value }: { value: number }) {
  const pct = Math.max(0, Math.min(100, value));
  const color = pct >= 70 ? "bg-emerald-500" : pct >= 40 ? "bg-amber-400" : "bg-rose-400";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-slate-100 dark:bg-zinc-800 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-slate-500 dark:text-zinc-400 tabular-nums w-7 text-right">{pct}</span>
    </div>
  );
}

function SectorAIContent({ snapshot, sector }: { snapshot: SectorResearchSnapshot; sector?: SectorTheme }) {
  const hasLeaders = (snapshot.leaders?.length || 0) > 0;
  const hasLaggards = (snapshot.laggards?.length || 0) > 0;
  const hasWatchCandidates = (snapshot.watch_candidates?.length || 0) > 0;

  return (
    <div className="flex flex-col gap-5">
      {/* 핵심 요약 블록 */}
      <div className="bg-white dark:bg-zinc-900 rounded-[24px] p-6 shadow-sm border border-slate-100 dark:border-zinc-800">
        <div className="flex items-start justify-between mb-3 gap-3">
          <h3 className="font-bold text-slate-900 dark:text-zinc-50 flex items-center gap-2">
            <Zap className="w-4 h-4 text-indigo-500" />
            지금 이 섹터가 주목받는 이유
          </h3>
          <div className="flex-shrink-0 text-right">
            <div className="text-[10px] text-slate-400 dark:text-zinc-500 mb-1">모멘텀 강도</div>
            <div className="w-28">
              <TrendStrengthBar value={snapshot.trend_strength} />
            </div>
          </div>
        </div>
        <div className="p-4 bg-indigo-50/60 dark:bg-indigo-950/20 rounded-xl border border-indigo-100 dark:border-indigo-900/40">
          <p className="text-sm text-slate-700 dark:text-zinc-300 leading-relaxed">{snapshot.ai_summary}</p>
        </div>
      </div>

      {/* 주도주/소외주 통합 섹션 */}
      {(hasLeaders || hasLaggards) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {hasLeaders && (
            <div className="bg-emerald-50 dark:bg-emerald-950/20 rounded-[20px] p-5 border border-emerald-100 dark:border-emerald-900/30">
              <h4 className="font-bold text-sm text-emerald-800 dark:text-emerald-400 mb-3 flex items-center gap-1.5">
                <TrendingUp className="w-3.5 h-3.5" />주도주
              </h4>
              <ul className="space-y-1.5">
                {snapshot.leaders!.map((l: string, i: number) => {
                  // 이름으로 심볼 찾기 (sector prop 있으면 링크로 표시)
                  const matchedSym = sector?.memberSymbols.find(
                    sym => getStockName(sym) === l || sym === l
                  );
                  return (
                    <li key={i}>
                      {matchedSym ? (
                        <Link
                          href={`/stocks/${matchedSym}`}
                          className="flex items-center justify-between px-2 py-1 rounded-lg hover:bg-emerald-100 dark:hover:bg-emerald-900/30 transition-colors"
                        >
                          <span className="text-sm text-emerald-700 dark:text-emerald-300 font-medium">{l}</span>
                          <span className="text-[10px] text-emerald-500/60 font-mono">{matchedSym}</span>
                        </Link>
                      ) : (
                        <span className="block text-sm text-emerald-700 dark:text-emerald-300 px-2 py-1">{l}</span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
          {hasLaggards && (
            <div className="bg-rose-50 dark:bg-rose-950/20 rounded-[20px] p-5 border border-rose-100 dark:border-rose-900/30">
              <h4 className="font-bold text-sm text-rose-800 dark:text-rose-400 mb-3 flex items-center gap-1.5">
                <TrendingDown className="w-3.5 h-3.5" />소외주
              </h4>
              <ul className="space-y-1.5">
                {snapshot.laggards!.map((l: string, i: number) => (
                  <li key={i} className="text-sm text-rose-700 dark:text-rose-300 px-2 py-1">{l}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* 주요 이슈 */}
      {snapshot.related_issues.length > 0 && (
        <div className="bg-white dark:bg-zinc-900 rounded-[24px] p-6 shadow-sm border border-slate-100 dark:border-zinc-800">
          <h4 className="font-bold text-sm text-slate-800 dark:text-zinc-200 mb-4">주요 근거 이슈</h4>
          <div className="flex flex-col gap-3">
            {snapshot.related_issues.map((issue: any) => (
              <div key={issue.id} className="p-3 bg-slate-50 dark:bg-zinc-950 border border-slate-100 dark:border-zinc-800 rounded-xl">
                <div className="flex items-start justify-between gap-2 mb-1">
                  <div className="font-semibold text-sm text-slate-800 dark:text-zinc-200 leading-tight">{issue.title}</div>
                  {issue.sentiment && (
                    <span className={`flex-shrink-0 text-[9px] px-1.5 py-0.5 rounded font-medium ${
                      issue.sentiment === "positive"
                        ? "bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400"
                        : issue.sentiment === "negative"
                        ? "bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400"
                        : "bg-slate-100 dark:bg-zinc-800 text-slate-500 dark:text-zinc-400"
                    }`}>
                      {issue.sentiment === "positive" ? "긍정" : issue.sentiment === "negative" ? "부정" : "중립"}
                    </span>
                  )}
                </div>
                <div className="text-xs text-slate-500 dark:text-zinc-400 line-clamp-2 leading-relaxed">{issue.summary}</div>
                <div className="text-[10px] text-slate-400 dark:text-zinc-500 mt-2">{issue.representativeSource}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 관찰 후보 */}
      {hasWatchCandidates && (
        <div className="bg-white dark:bg-zinc-900 rounded-[24px] p-6 shadow-sm border border-slate-100 dark:border-zinc-800">
          <h3 className="font-bold text-sm text-slate-900 dark:text-zinc-50 mb-4 flex items-center gap-2">
            <Eye className="w-4 h-4 text-amber-500" />
            관찰 후보
          </h3>
          <div className="flex flex-col gap-3">
            {snapshot.watch_candidates!.map((c: any, i: number) => (
              <div key={i} className="p-4 bg-amber-50/50 dark:bg-amber-950/10 border border-amber-100 dark:border-amber-900/30 rounded-xl">
                <div className="font-bold text-sm text-amber-700 dark:text-amber-400 mb-1">{c.name}</div>
                <div className="text-xs text-slate-600 dark:text-zinc-400 leading-relaxed">{c.reason}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

interface SectorAISectionProps {
  snapshot: SectorResearchSnapshot | null;
  sectorId: string;
  sector?: SectorTheme;
  fallbackTrendStrength?: number;
}

export function SectorAISection({ snapshot: initialSnapshot, sectorId, sector, fallbackTrendStrength = 50 }: SectorAISectionProps) {
  const [snapshot, setSnapshot] = useState<SectorResearchSnapshot | null>(initialSnapshot);
  const [loading, setLoading] = useState(!initialSnapshot);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (initialSnapshot) return;

    let isMounted = true;
    fetch(`/api/sectors/${sectorId}`)
      .then(r => {
        if (!r.ok) throw new Error("API error");
        return r.json();
      })
      .then(d => {
        if (!isMounted) return;
        if (d.ok && d.sector) setSnapshot(d.sector);
        else setError(true);
      })
      .catch(() => { if (isMounted) setError(true); })
      .finally(() => { if (isMounted) setLoading(false); });

    return () => { isMounted = false; };
  }, [sectorId, initialSnapshot]);

  if (loading) return <SectorAIGenerating />;

  if (error || !snapshot) {
    return (
      <div className="bg-white dark:bg-zinc-900 rounded-[24px] p-6 shadow-sm border border-slate-100 dark:border-zinc-800">
        <div className="flex items-start justify-between mb-3 gap-3">
          <h3 className="font-bold text-slate-900 dark:text-zinc-50 flex items-center gap-2">
            <Zap className="w-4 h-4 text-indigo-500" />
            지금 이 섹터가 주목받는 이유
          </h3>
          <div className="flex-shrink-0 text-right">
            <div className="text-[10px] text-slate-400 dark:text-zinc-500 mb-1">모멘텀 강도</div>
            <div className="w-28">
              <TrendStrengthBar value={fallbackTrendStrength} />
            </div>
          </div>
        </div>
        <div className="p-4 bg-indigo-50/60 dark:bg-indigo-950/20 rounded-xl border border-indigo-100 dark:border-indigo-900/40 flex items-center gap-3 text-sm text-slate-500 dark:text-zinc-400">
          <AlertCircle className="w-4 h-4 flex-shrink-0 text-indigo-500" />
          AI 섹터 분석을 불러오지 못했습니다. 모멘텀 지표는 기본값으로 유지합니다.
        </div>
      </div>
    );
  }

  return <SectorAIContent snapshot={snapshot} sector={sector} />;
}

export function SectorAISectionSkeleton() {
  return <SectorAISkeleton />;
}
