"use client";

import { useEffect, useState } from "react";
import { Activity, AlertCircle, Eye } from "lucide-react";
import { formatChange, formatNumber } from "@/lib/utils";

type SectorMarketSignal = {
  sectorName: string;
  industryCode?: string | null;
  industryName?: string | null;
  industryIndex?: {
    name: string;
    value: number;
    change: number;
    changeRate: number;
  } | null;
  representativeQuotes?: Array<{
    symbol: string;
    name: string;
    price: number | null;
    changeRate: number | null;
    volume: number | null;
  }>;
  avgRepresentativeChangeRate: number | null;
  whyNow: string;
};

type WatchCandidate = { name: string; reason: string };

export function SectorMarketSignalCard({
  sectorId,
  watchCandidates = [],
}: {
  sectorId: string;
  watchCandidates?: WatchCandidate[];
}) {
  const [data, setData] = useState<SectorMarketSignal | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(false);

    fetch(`/api/sectors/${sectorId}/market`)
      .then(r => {
        if (!r.ok) throw new Error("API error");
        return r.json();
      })
      .then(json => {
        if (!active) return;
        if (json.ok) setData(json);
        else setError(true);
      })
      .catch(() => {
        if (active) setError(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => { active = false; };
  }, [sectorId]);

  return (
    <div className="bg-white dark:bg-zinc-900 rounded-[24px] p-5 shadow-sm border border-slate-100 dark:border-zinc-800">
      <h3 className="font-bold text-sm text-slate-900 dark:text-zinc-50 mb-3 flex items-center gap-2">
        <Activity className="w-4 h-4 text-teal-500" />
        KIS 업종 흐름
      </h3>

      {loading ? (
        <div className="animate-pulse space-y-3">
          <div className="h-4 w-32 bg-slate-100 dark:bg-zinc-800 rounded" />
          <div className="h-12 bg-slate-50 dark:bg-zinc-950 rounded-xl" />
          <div className="h-4 w-3/4 bg-slate-100 dark:bg-zinc-800 rounded" />
        </div>
      ) : error || !data ? (
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <AlertCircle className="w-4 h-4" />
          업종 시세 정보를 불러오지 못했습니다.
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="rounded-2xl bg-slate-50 dark:bg-zinc-950 p-3">
            <div className="text-[10px] text-slate-400 mb-1">
              {data.industryName ? `KIS 업종 ${data.industryName}` : "대표 종목 평균"}
            </div>
            <div className="flex items-end justify-between gap-3">
              <div className="font-bold text-slate-900 dark:text-zinc-50">
                {data.industryIndex?.value ? formatNumber(Math.round(data.industryIndex.value)) : data.sectorName}
              </div>
              <div className={`text-sm font-semibold ${
                (data.industryIndex?.changeRate ?? data.avgRepresentativeChangeRate ?? 0) >= 0
                  ? "text-red-500"
                  : "text-blue-500"
              }`}>
                {formatChange(data.industryIndex?.changeRate ?? data.avgRepresentativeChangeRate ?? 0)}%
              </div>
            </div>
          </div>

          {data.whyNow && (
            <p className="text-xs leading-relaxed text-slate-500 dark:text-zinc-400">{data.whyNow}</p>
          )}

          {watchCandidates.length > 0 && (
            <div className="border-t border-slate-100 pt-3 dark:border-zinc-800">
              <h4 className="mb-2 flex items-center gap-1.5 text-xs font-bold text-amber-600 dark:text-amber-400">
                <Eye className="h-3.5 w-3.5" />
                관찰 후보
              </h4>
              <div className="flex flex-col gap-2">
                {watchCandidates.map((candidate, index) => (
                  <div key={`${candidate.name}-${index}`} className="rounded-xl border border-amber-100 bg-amber-50/50 p-3 dark:border-amber-900/30 dark:bg-amber-950/10">
                    <div className="mb-1 text-sm font-bold text-amber-700 dark:text-amber-400">{candidate.name}</div>
                    <div className="text-xs leading-relaxed text-slate-600 dark:text-zinc-400">{candidate.reason}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
