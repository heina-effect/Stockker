"use client";

import { useEffect, useState } from "react";
import type { SectorResearchSnapshot } from "@/server/research/snapshots/sector-snapshot-manager";

function SectorAISkeleton() {
  return (
    <div className="animate-pulse flex flex-col gap-6">
      <div className="bg-white dark:bg-zinc-900 rounded-[24px] p-6 border">
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
    <div className="bg-white dark:bg-zinc-900 rounded-[24px] p-8 border flex flex-col items-center gap-4">
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

function SectorAIContent({ snapshot }: { snapshot: SectorResearchSnapshot }) {
  return (
    <>
      <div className="bg-white dark:bg-zinc-900 rounded-[24px] p-6 shadow-sm border">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-slate-900 dark:text-zinc-50">AI 섹터 동향 요약</h3>
          <span className="text-xs px-2 py-1 bg-slate-100 dark:bg-zinc-800 rounded text-slate-600 dark:text-zinc-400">
            모멘텀 강도: {snapshot.trend_strength}/100
          </span>
        </div>
        <div className="p-4 bg-indigo-50/50 dark:bg-indigo-950/20 rounded-xl border border-indigo-100 dark:border-indigo-900/50 mb-6">
          <p className="text-sm text-slate-700 dark:text-zinc-300">{snapshot.ai_summary}</p>
        </div>

        {snapshot.related_issues.length > 0 && (
          <div>
            <h4 className="font-bold text-sm text-slate-800 dark:text-zinc-200 mb-3">주요 연관 이슈</h4>
            <div className="flex flex-col gap-3">
              {snapshot.related_issues.map((issue: any) => (
                <div key={issue.id} className="p-3 bg-slate-50 dark:bg-zinc-950 border border-slate-100 dark:border-zinc-800 rounded-lg">
                  <div className="font-semibold text-sm mb-1">{issue.title}</div>
                  <div className="text-xs text-slate-500 line-clamp-2">{issue.summary}</div>
                  <div className="text-[10px] text-slate-400 mt-2">{issue.representativeSource}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {((snapshot.leaders?.length || 0) > 0 || (snapshot.laggards?.length || 0) > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {snapshot.leaders && snapshot.leaders.length > 0 && (
            <div className="bg-emerald-50 dark:bg-emerald-950/20 p-4 rounded-2xl border border-emerald-100 dark:border-emerald-900/30">
              <h4 className="font-bold text-emerald-800 dark:text-emerald-400 mb-2">주도주 (Leaders)</h4>
              <ul className="list-disc list-inside text-sm text-emerald-700 dark:text-emerald-300">
                {snapshot.leaders.map((l: string, i: number) => <li key={i}>{l}</li>)}
              </ul>
            </div>
          )}
          {snapshot.laggards && snapshot.laggards.length > 0 && (
            <div className="bg-rose-50 dark:bg-rose-950/20 p-4 rounded-2xl border border-rose-100 dark:border-rose-900/30">
              <h4 className="font-bold text-rose-800 dark:text-rose-400 mb-2">소외주 (Laggards)</h4>
              <ul className="list-disc list-inside text-sm text-rose-700 dark:text-rose-300">
                {snapshot.laggards.map((l: string, i: number) => <li key={i}>{l}</li>)}
              </ul>
            </div>
          )}
        </div>
      )}

      {snapshot.watch_candidates && snapshot.watch_candidates.length > 0 && (
        <div className="bg-white dark:bg-zinc-900 rounded-[24px] p-6 shadow-sm border">
          <h3 className="font-bold text-slate-900 dark:text-zinc-50 mb-4">섹터 내 관찰 후보</h3>
          <div className="flex flex-col gap-3">
            {snapshot.watch_candidates.map((c: any, i: number) => (
              <div key={i} className="p-4 bg-slate-50 dark:bg-zinc-950 border border-slate-100 dark:border-zinc-800 rounded-xl">
                <div className="font-bold text-sm text-indigo-700 dark:text-indigo-400 mb-1">{c.name}</div>
                <div className="text-xs text-slate-600 dark:text-zinc-400 leading-relaxed">{c.reason}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

interface SectorAISectionProps {
  snapshot: SectorResearchSnapshot | null;
  sectorId: string;
}

export function SectorAISection({ snapshot: initialSnapshot, sectorId }: SectorAISectionProps) {
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
      <div className="bg-white dark:bg-zinc-900 rounded-[24px] p-6 border text-sm text-slate-400 italic">
        AI 섹터 분석을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.
      </div>
    );
  }

  return <SectorAIContent snapshot={snapshot} />;
}

export function SectorAISectionSkeleton() {
  return <SectorAISkeleton />;
}
