"use client";

import { useEffect, useState } from "react";
import type { RelatedStock, RelationType } from "@/types/research";
import Link from "next/link";
import { formatNumber } from "@/lib/utils";
import { useLiveMarket } from "@/components/dashboard/live-market-provider";
import { GitBranch, Layers, FileText, Sparkles } from "lucide-react";

const RELATION_LABEL: Record<RelationType, string> = {
  sector_peer: "동종 섹터",
  issue_mention: "이슈 연관",
  supply_chain: "공급망",
  disclosure_linked: "공시 연관",
  peer: "유사 종목",
  ai_inferred: "AI 추론",
};

const RELATION_COLORS: Record<RelationType, string> = {
  sector_peer: "bg-teal-50 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300",
  issue_mention: "bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300",
  supply_chain: "bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  disclosure_linked: "bg-cyan-50 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300",
  peer: "bg-slate-100 text-slate-600 dark:bg-zinc-800 dark:text-zinc-300",
  ai_inferred: "bg-slate-100 text-slate-500 dark:bg-zinc-800 dark:text-zinc-400",
};

function RelationIcon({ type }: { type: RelationType }) {
  if (type === "sector_peer") return <Layers className="w-3 h-3" />;
  if (type === "issue_mention") return <FileText className="w-3 h-3" />;
  if (type === "supply_chain") return <GitBranch className="w-3 h-3" />;
  if (type === "disclosure_linked") return <FileText className="w-3 h-3" />;
  return <Sparkles className="w-3 h-3" />;
}

function RelatedStocksSkeleton() {
  return (
    <div className="flex flex-col gap-3 animate-pulse">
      {[1, 2, 3].map(i => (
        <div key={i} className="p-3 rounded-2xl bg-slate-50 dark:bg-zinc-950">
          <div className="flex justify-between mb-2">
            <div className="w-20 h-4 bg-slate-100 dark:bg-zinc-800 rounded" />
            <div className="w-16 h-4 bg-slate-100 dark:bg-zinc-800 rounded" />
          </div>
          <div className="w-3/4 h-3 bg-slate-50 dark:bg-zinc-800/60 rounded" />
        </div>
      ))}
    </div>
  );
}

export function RelatedStocksCard({ symbol }: { symbol: string }) {
  const [stocks, setStocks] = useState<RelatedStock[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const { marketStore } = useLiveMarket();

  useEffect(() => {
    let isMounted = true;
    setLoading(true);
    setError(false);
    fetch(`/api/stocks/${symbol}/related`)
      .then(r => {
        if (!r.ok) throw new Error("API error");
        return r.json();
      })
      .then(d => {
        if (!isMounted) return;
        if (d.ok) setStocks(d.related);
        else setError(true);
      })
      .catch(() => { if (isMounted) setError(true); })
      .finally(() => { if (isMounted) setLoading(false); });
    return () => { isMounted = false; };
  }, [symbol]);

  return (
    <div className="bg-white dark:bg-zinc-900 rounded-[24px] p-6 shadow-sm border border-transparent">
      <h3 className="font-bold text-slate-900 dark:text-zinc-50 mb-1">연관 종목</h3>
      <p className="text-[10px] text-slate-400 mb-4">섹터 동종·이슈 기반으로 선정. 투자 권유 아님.</p>

      {loading ? (
        <>
          <p className="text-xs text-slate-400 dark:text-zinc-500 mb-2">불러오는 중...</p>
          <RelatedStocksSkeleton />
        </>
      ) : error ? (
        <div className="text-sm text-slate-400 py-4">연관 종목 정보를 불러오지 못했습니다.</div>
      ) : stocks.length === 0 ? (
        <div className="text-sm text-slate-400 py-4">동일 섹터 또는 최신 이슈에서 확인된 연관 종목이 아직 없습니다.</div>
      ) : (
        <div className="flex flex-col gap-3">
          {stocks.map((stock) => {
            const liveState = marketStore[stock.symbol];
            const currentPrice = liveState?.quote?.price || stock.price || 0;
            const currentChangeRate = liveState?.quote?.changeRate || stock.changeRate || 0;
            const isLive = liveState?.source === "live";
            const isUp = currentChangeRate > 0;
            const isDown = currentChangeRate < 0;

            return (
              <Link
                key={stock.symbol}
                href={`/stocks/${stock.symbol}`}
                className="flex items-center justify-between p-3 rounded-2xl bg-slate-50 dark:bg-zinc-950 hover:bg-slate-100 dark:hover:bg-zinc-900 transition-colors group"
              >
                <div className="flex flex-col flex-1 pr-4 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm text-slate-900 dark:text-zinc-100 group-hover:text-indigo-600 transition-colors">
                      {stock.name}
                    </span>
                    <span className="text-[10px] px-1 py-0.5 rounded border border-slate-200 dark:border-zinc-800 text-slate-500 bg-white dark:bg-zinc-900 font-mono">
                      {stock.symbol}
                    </span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded flex items-center gap-0.5 font-semibold ${RELATION_COLORS[stock.relationType]}`}>
                      <RelationIcon type={stock.relationType} />
                      {RELATION_LABEL[stock.relationType]}
                    </span>
                  </div>
                  <span className="text-[10px] text-slate-500 mt-1 line-clamp-1">
                    {stock.relationReason}
                  </span>
                  {stock.basisSourceCount && (
                    <span className="text-[10px] text-slate-400 mt-0.5">
                      관련 출처 {stock.basisSourceCount}건 기반
                    </span>
                  )}
                </div>

                <div className="flex flex-col items-end whitespace-nowrap flex-shrink-0">
                  <span className="text-sm font-bold text-slate-900 dark:text-zinc-100 flex items-center gap-1.5">
                    {isLive && (
                      <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
                    )}
                    {currentPrice ? `${formatNumber(currentPrice)}원` : "—"}
                  </span>
                  <span className={`text-[10px] font-bold ${isUp ? "text-red-500" : isDown ? "text-blue-500" : "text-slate-500"}`}>
                    {currentChangeRate !== 0 ? `${isUp ? "+" : ""}${currentChangeRate}%` : "—"}
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
