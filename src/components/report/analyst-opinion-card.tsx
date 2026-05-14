"use client";

import { useEffect, useState } from "react";
import { TrendingUp, Building2, AlertCircle } from "lucide-react";
import { formatNumber } from "@/lib/utils";
import { formatResearchDate } from "@/lib/date-format";
import type { AnalystOpinionItem, AnalystOpinionSummary } from "@/types/research";

type CardData = AnalystOpinionSummary & { currentPrice?: number };

const OPINION_COLOR: Record<string, string> = {
  강력매수: "text-red-600 dark:text-red-400 font-bold",
  매수: "text-red-500 dark:text-red-400",
  시장상회: "text-orange-500 dark:text-orange-400",
  중립: "text-slate-500 dark:text-zinc-400",
  시장하회: "text-blue-400 dark:text-blue-400",
  매도: "text-blue-500 dark:text-blue-400",
  강력매도: "text-blue-600 dark:text-blue-400 font-bold",
};

function opinionColor(op: string) {
  return OPINION_COLOR[op] ?? "text-slate-500 dark:text-zinc-400";
}

function OpinionChangeBadge({ prev, curr }: { prev?: string; curr: string }) {
  if (!prev || prev === curr || prev === "—") return null;
  return (
    <span className="text-[9px] px-1 py-0.5 rounded bg-indigo-50 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-300 ml-1">
      {prev} → {curr}
    </span>
  );
}

function SkeletonRow() {
  return (
    <div className="flex items-center gap-2 py-2 animate-pulse">
      <div className="w-20 h-3 bg-slate-100 dark:bg-zinc-800 rounded" />
      <div className="w-10 h-3 bg-slate-100 dark:bg-zinc-800 rounded ml-auto" />
      <div className="w-16 h-3 bg-slate-100 dark:bg-zinc-800 rounded" />
    </div>
  );
}

export function AnalystOpinionCard({ symbol }: { symbol: string }) {
  const [data, setData] = useState<CardData | null>(null);
  const [loadedAt, setLoadedAt] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setError(false);

    fetch(`/api/stocks/${symbol}/analyst-opinion`)
      .then(r => {
        if (!r.ok) throw new Error("API error");
        return r.json();
      })
      .then(d => {
        if (!mounted) return;
        if (d.ok) {
          setData(d.data);
          setLoadedAt(Date.now());
        } else {
          setError(true);
        }
      })
      .catch(() => { if (mounted) setError(true); })
      .finally(() => { if (mounted) setLoading(false); });

    return () => { mounted = false; };
  }, [symbol]);

  const hasData = data && data.items.length > 0;

  return (
    <div className="bg-white dark:bg-zinc-900 rounded-[24px] p-6 shadow-sm border border-transparent">
      <div className="flex items-center gap-2 mb-1">
        <Building2 className="w-4 h-4 text-indigo-500" />
        <h3 className="font-bold text-slate-900 dark:text-zinc-50">국내 증권사 투자의견</h3>
      </div>
      <p className="text-[10px] text-slate-400 mb-4">증권사 리서치 기반 목표주가·의견. 투자 권유 아님.</p>

      {loading ? (
        <div>
          <p className="text-xs text-slate-400 dark:text-zinc-500 mb-2">불러오는 중...</p>
          {[1, 2, 3].map(i => <SkeletonRow key={i} />)}
        </div>
      ) : error ? (
        <div className="flex items-center gap-2 text-sm text-slate-400 py-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          투자의견 데이터를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.
        </div>
      ) : hasData ? (
        <>
          {/* 요약 배너 */}
          <SummaryBanner data={data!} referenceTs={loadedAt} />

          {/* 테이블 */}
          <div className="mt-4 divide-y divide-slate-100 dark:divide-zinc-800">
            {data!.items.map((item, i) => (
              <OpinionRow key={i} item={item} />
            ))}
          </div>
        </>
      ) : (
        <div className="text-sm text-slate-400 dark:text-zinc-500 py-2">
          표시할 투자의견 데이터가 없습니다.
        </div>
      )}
    </div>
  );
}

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

function countRecent(items: AnalystOpinionItem[], referenceTs: number): number {
  return items.filter(i => referenceTs - new Date(i.date).getTime() < THIRTY_DAYS_MS).length;
}

function SummaryBanner({ data, referenceTs }: { data: CardData; referenceTs: number }) {
  const { avgTargetPrice, currentPrice, items } = data;
  const upside =
    avgTargetPrice > 0 && currentPrice && currentPrice > 0
      ? (((avgTargetPrice - currentPrice) / currentPrice) * 100).toFixed(1)
      : null;

  const recentCount = countRecent(items, referenceTs);

  return (
    <div className="grid grid-cols-3 gap-2 p-3 rounded-2xl bg-slate-50 dark:bg-zinc-950 text-center">
      <div>
        <div className="text-[10px] text-slate-400 mb-0.5">평균 목표가</div>
        <div className="text-sm font-bold text-slate-800 dark:text-zinc-100">
          {avgTargetPrice > 0 ? `${formatNumber(avgTargetPrice)}원` : "—"}
        </div>
      </div>
      <div>
        <div className="text-[10px] text-slate-400 mb-0.5">현재가 대비</div>
        <div className={`text-sm font-bold ${upside !== null ? (Number(upside) >= 0 ? "text-red-500" : "text-blue-500") : "text-slate-400"}`}>
          {upside !== null ? `${Number(upside) >= 0 ? "+" : ""}${upside}%` : "—"}
        </div>
      </div>
      <div>
        <div className="text-[10px] text-slate-400 mb-0.5">최근 30일</div>
        <div className="text-sm font-bold text-slate-800 dark:text-zinc-100 flex items-center justify-center gap-1">
          <TrendingUp className="w-3 h-3 text-indigo-400" />
          {recentCount}건
        </div>
      </div>
    </div>
  );
}

function OpinionRow({ item }: { item: AnalystOpinionItem }) {
  const priceDiff = item.prevTargetPrice && item.targetPrice
    ? item.targetPrice - item.prevTargetPrice
    : 0;

  return (
    <div className="py-2.5 flex items-start justify-between gap-2">
      <div className="flex flex-col min-w-0">
        <span className="text-sm font-medium text-slate-800 dark:text-zinc-200 truncate">
          {item.firmName}
        </span>
        <span className="text-[10px] text-slate-400">{formatResearchDate(new Date(item.date))}</span>
      </div>

      <div className="flex flex-col items-end flex-shrink-0 gap-0.5">
        <div className="flex items-center">
          <span className={`text-sm ${opinionColor(item.opinion)}`}>{item.opinion}</span>
          <OpinionChangeBadge prev={item.prevOpinion} curr={item.opinion} />
        </div>
        <div className="flex items-center gap-1">
          <span className="text-sm font-semibold text-slate-700 dark:text-zinc-300">
            {item.targetPrice > 0 ? `${formatNumber(item.targetPrice)}원` : "—"}
          </span>
          {priceDiff !== 0 && (
            <span className={`text-[10px] ${priceDiff > 0 ? "text-red-400" : "text-blue-400"}`}>
              {priceDiff > 0 ? "▲" : "▼"}{formatNumber(Math.abs(priceDiff))}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
