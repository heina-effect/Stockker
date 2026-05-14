"use client";

import { useEffect, useState } from "react";
import { Building2, AlertCircle } from "lucide-react";
import { formatNumber } from "@/lib/utils";
import type { AnalystOpinionItem, AnalystOpinionSummary } from "@/types/research";
import { useOptionalLiveMarket } from "@/components/dashboard/live-market-provider";

type CardData = AnalystOpinionSummary & { currentPrice?: number };

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
  const [page, setPage] = useState(0);
  const liveMarket = useOptionalLiveMarket();
  const liveCurrentPrice = liveMarket?.marketStore[symbol]?.quote?.price;
  const effectiveCurrentPrice =
    liveCurrentPrice && liveCurrentPrice > 0
      ? liveCurrentPrice
      : data?.currentPrice;

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
          setPage(0);
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
        {hasData && (
          <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-semibold text-indigo-600 dark:bg-indigo-900/20 dark:text-indigo-300">
            최근 30일 {countRecent(data!.items, loadedAt)}건
          </span>
        )}
      </div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <p className="text-[10px] text-slate-400">증권사 리서치 기반 목표주가·의견. 투자 권유 아님.</p>
        {data?._meta?.kisMode === "mock" && (
          <span
            title={data._meta.note}
            className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-600 ring-1 ring-emerald-100 dark:bg-emerald-900/20 dark:text-emerald-300 dark:ring-emerald-900/40"
          >
            KIS {data._meta.kisMode} · 실제 응답
          </span>
        )}
      </div>

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
          <SummaryBanner data={data!} currentPrice={effectiveCurrentPrice} />

          {/* 테이블 */}
          <OpinionPager items={data!.items} page={page} setPage={setPage} />
        </>
      ) : (
        <div className="text-sm text-slate-400 dark:text-zinc-500 py-2">
          표시할 투자의견 데이터가 없습니다.
        </div>
      )}
    </div>
  );
}

const PAGE_SIZE = 3;
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

function getHighestTarget(items: AnalystOpinionItem[]): number {
  return Math.max(0, ...items.map(item => item.targetPrice).filter(price => price > 0));
}

function OpinionPager({
  items,
  page,
  setPage,
}: {
  items: AnalystOpinionItem[];
  page: number;
  setPage: (next: number) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const visibleItems = items.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

  return (
    <>
      <div className="mt-4 divide-y divide-slate-100 dark:divide-zinc-800">
        {visibleItems.map((item, i) => (
          <OpinionRow key={i} item={item} />
        ))}
      </div>

      {totalPages > 1 && (
        <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3 text-xs dark:border-zinc-800">
          <span className="text-slate-400">
            {safePage + 1} / {totalPages}
          </span>
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => setPage(Math.max(0, safePage - 1))}
              disabled={safePage === 0}
              className="rounded-lg bg-slate-50 px-2 py-1 font-medium text-slate-500 transition-colors hover:bg-slate-100 disabled:opacity-40 dark:bg-zinc-950 dark:text-zinc-400 dark:hover:bg-zinc-800"
            >
              이전
            </button>
            <button
              type="button"
              onClick={() => setPage(Math.min(totalPages - 1, safePage + 1))}
              disabled={safePage >= totalPages - 1}
              className="rounded-lg bg-slate-50 px-2 py-1 font-medium text-slate-500 transition-colors hover:bg-slate-100 disabled:opacity-40 dark:bg-zinc-950 dark:text-zinc-400 dark:hover:bg-zinc-800"
            >
              다음
            </button>
          </div>
        </div>
      )}
    </>
  );
}

function countRecent(items: AnalystOpinionItem[], referenceTs: number): number {
  return items.filter(i => referenceTs - new Date(i.date).getTime() < THIRTY_DAYS_MS).length;
}

function SummaryBanner({ data, currentPrice }: { data: CardData; currentPrice?: number }) {
  const { avgTargetPrice, items } = data;
  const highestTargetPrice = getHighestTarget(items);
  const upside =
    avgTargetPrice > 0 && currentPrice && currentPrice > 0
      ? (((avgTargetPrice - currentPrice) / currentPrice) * 100).toFixed(1)
      : null;
  const highestUpside =
    highestTargetPrice > 0 && currentPrice && currentPrice > 0
      ? (((highestTargetPrice - currentPrice) / currentPrice) * 100).toFixed(1)
      : null;

  return (
    <div className="grid grid-cols-3 gap-2 rounded-2xl bg-slate-50 p-3 text-center dark:bg-zinc-950">
      <div>
        <div className="mb-0.5 text-[10px] text-slate-400">평균</div>
        <div className="text-sm font-bold leading-tight text-slate-800 dark:text-zinc-100">
          {avgTargetPrice > 0 ? `${formatNumber(avgTargetPrice)}원` : "—"}
        </div>
      </div>
      <div>
        <div className="mb-0.5 text-[10px] text-slate-400">최고</div>
        <div className="text-sm font-bold leading-tight text-slate-800 dark:text-zinc-100">
          {highestTargetPrice > 0 ? `${formatNumber(highestTargetPrice)}원` : "—"}
        </div>
        {highestUpside !== null && (
          <div className={`mt-0.5 text-[10px] font-semibold ${Number(highestUpside) >= 0 ? "text-red-400" : "text-blue-400"}`}>
            {Number(highestUpside) >= 0 ? "+" : ""}{highestUpside}%
          </div>
        )}
      </div>
      <div>
        <div className="mb-0.5 text-[10px] text-slate-400">현재가 대비</div>
        <div className={`text-sm font-bold leading-tight ${upside !== null ? (Number(upside) >= 0 ? "text-red-500" : "text-blue-500") : "text-slate-400"}`}>
          {upside !== null ? `${Number(upside) >= 0 ? "+" : ""}${upside}%` : "—"}
        </div>
      </div>
    </div>
  );
}

function OpinionBadge({ opinion }: { opinion: string }) {
  const className = {
    강력매수: "bg-red-50 text-red-600 ring-red-100 dark:bg-red-900/20 dark:text-red-300 dark:ring-red-900/40",
    매수: "bg-rose-50 text-rose-600 ring-rose-100 dark:bg-rose-900/20 dark:text-rose-300 dark:ring-rose-900/40",
    시장상회: "bg-orange-50 text-orange-600 ring-orange-100 dark:bg-orange-900/20 dark:text-orange-300 dark:ring-orange-900/40",
    중립: "bg-slate-50 text-slate-600 ring-slate-200 dark:bg-zinc-800 dark:text-zinc-300 dark:ring-zinc-700",
    시장하회: "bg-sky-50 text-sky-600 ring-sky-100 dark:bg-sky-900/20 dark:text-sky-300 dark:ring-sky-900/40",
    매도: "bg-blue-50 text-blue-600 ring-blue-100 dark:bg-blue-900/20 dark:text-blue-300 dark:ring-blue-900/40",
    강력매도: "bg-blue-100 text-blue-700 ring-blue-200 dark:bg-blue-900/30 dark:text-blue-200 dark:ring-blue-900/50",
  }[opinion] ?? "bg-slate-50 text-slate-600 ring-slate-200 dark:bg-zinc-800 dark:text-zinc-300 dark:ring-zinc-700";

  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-bold ring-1 ${className}`}>
      {opinion}
    </span>
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
        <span className="text-[10px] text-slate-400">{item.date}</span>
      </div>

      <div className="flex flex-col items-end flex-shrink-0 gap-0.5">
        <div className="flex items-center">
          <OpinionBadge opinion={item.opinion} />
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
