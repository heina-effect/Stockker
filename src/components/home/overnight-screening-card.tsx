"use client";

import { useEffect, useState } from "react";
import { ArrowRight, Activity, Moon } from "lucide-react";
import Link from "next/link";
import { formatGapPct, maArrangement, maGaps } from "@/app/overnight/market-state";
import { useMarketState, type IndexState } from "@/app/overnight/use-market-state";
import { kstClock, savedResultTitle } from "@/lib/screening/saved-result";
import { SurfaceCard } from "@/components/common/surface-card";

interface LatestScreening {
  ok: boolean;
  empty: boolean;
  tradeDate: string | null;
  savedAt: string | null;
  isToday: boolean;
  results: {
    normal: unknown[];
    aggressive: unknown[];
    exclude: unknown[];
  };
}

export function OvernightScreeningCard() {
  const [data, setData] = useState<LatestScreening | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const { market, marketFailed } = useMarketState();

  useEffect(() => {
    async function fetchScreening() {
      try {
        // 저장분만 읽는다. 홈에서는 실시간 스크리닝을 부르지 않는다(2026-11-05)
        const res = await fetch("/api/screening/overnight/latest");
        const json = await res.json().catch(() => null);
        // 읽기 실패 응답에는 결과가 없다 — 종목 수를 그리지 않는다
        if (!res.ok || !json?.ok || !json.results) throw new Error(json?.reason || "screening_failed");
        setData(json);
      } catch (err) {
        console.error(err);
        setError(true);
      } finally {
        setLoading(false);
      }
    }
    fetchScreening();
  }, []);

  if (loading) {
    return (
      <SurfaceCard className="animate-pulse flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded-full bg-slate-200 dark:bg-zinc-800" />
          <div className="w-40 h-5 bg-slate-200 dark:bg-zinc-800 rounded" />
        </div>
        <div className="h-10 bg-slate-100 dark:bg-zinc-800/50 rounded-xl" />
        <div className="grid grid-cols-2 gap-4">
          <div className="h-16 bg-slate-50 dark:bg-zinc-950 rounded-xl" />
          <div className="h-16 bg-slate-50 dark:bg-zinc-950 rounded-xl" />
        </div>
      </SurfaceCard>
    );
  }

  if (error || !data) {
    return (
      <SurfaceCard className="flex flex-col items-center justify-center py-8 text-slate-400 dark:text-zinc-500">
        <Activity className="w-8 h-8 mb-2 opacity-50" />
        <span className="text-sm">스크리닝 실패 — 데이터를 가져오지 못했습니다</span>
      </SurfaceCard>
    );
  }

  const { empty, tradeDate, savedAt, isToday, results } = data;
  const normalCount = results.normal.length;
  const aggressiveCount = results.aggressive.length;

  return (
    <SurfaceCard className="flex flex-col gap-4 relative overflow-hidden transition-all hover:shadow-md">
      
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-lg text-slate-900 dark:text-zinc-50 flex items-center gap-2">
          <Moon className="w-5 h-5 text-indigo-500 fill-indigo-500/20" />
          오버나이트 스크리닝 요약
        </h3>
        <Link
          href="/overnight"
          className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 flex items-center gap-1 hover:underline transition-colors focus-visible:outline-none"
        >
          상세 리포트
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>

      {/* 지금 시장 상태 — 지수값·배열 상태·괴리율을 사실로만 적는다(2026-11-02). 색으로 좋고 나쁨을 나타내지 않고
          reduceWeight 는 화면에 쓰지 않는다. 저장분과 시점이 달라 영역을 나누고 시각을 적는다(2026-11-05). */}
      <section aria-label="지금 시장 상태">
        <p className="text-xs font-semibold text-slate-500 dark:text-zinc-400 mb-1.5">
          지금 시장 상태
          {market && <span className="font-normal"> · {kstClock(market.fetchedAt)} 조회</span>}
        </p>
        <div className="bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 px-4 py-3 rounded-2xl space-y-1.5">
          {market ? (
            <>
              <IndexStateLine label="코스닥" state={market.kosdaqState} />
              <IndexStateLine label="코스피" state={market.kospiState} />
            </>
          ) : (
            <p className="text-xs text-slate-500 dark:text-zinc-400">
              {marketFailed ? "지수를 받지 못했습니다" : "지수를 받는 중…"}
            </p>
          )}
        </div>
      </section>

      {/* 선별 결과 — 저장분. 오늘 결과가 아니면 그 사실을 함께 적는다 */}
      <p className="flex flex-wrap items-center gap-1.5 text-xs font-semibold text-slate-500 dark:text-zinc-400 -mb-2">
        {tradeDate ? savedResultTitle(tradeDate, savedAt) : "저장된 선별 결과 없음"}
        {!empty && (
          <span className={`font-bold px-1.5 py-0.5 rounded-full ${
            isToday
              ? "bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300"
              : "bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-300"
          }`}>
            {isToday ? "오늘" : "오늘 아님"}
          </span>
        )}
      </p>

      {/* 분류별 종목 수 */}
      <div className="grid grid-cols-2 gap-4">
        {/* 정석 통과 */}
        <Link
          href="/overnight?tab=normal"
          className="bg-slate-50 dark:bg-zinc-950 p-4 rounded-2xl border border-transparent hover:border-slate-200 dark:hover:border-zinc-800 transition-all group"
        >
          <div className="text-xs text-slate-500 dark:text-zinc-400 mb-1 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
            정석 오버나이트 통과
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-bold text-slate-800 dark:text-zinc-100">
              {normalCount}
            </span>
            <span className="text-xs text-slate-400 dark:text-zinc-500">종목</span>
          </div>
        </Link>

        {/* 공격형 추세 */}
        <Link
          href="/overnight?tab=aggressive"
          className="bg-slate-50 dark:bg-zinc-950 p-4 rounded-2xl border border-transparent hover:border-slate-200 dark:hover:border-zinc-800 transition-all group"
        >
          <div className="text-xs text-slate-500 dark:text-zinc-400 mb-1 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
            공격형 추세 지속
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-bold text-slate-800 dark:text-zinc-100">
              {aggressiveCount}
            </span>
            <span className="text-xs text-slate-400 dark:text-zinc-500">종목</span>
          </div>
        </Link>
      </div>

      {/* Footer Text */}
      <div className="text-[10px] text-slate-400 dark:text-zinc-500 text-center border-t border-slate-100 dark:border-zinc-800/80 pt-3">
        당일 거래대금 상위 종목을 대상으로 5일·20일·60일·120일 정배열 및 테마 신선도를 결합하여 산출합니다.
      </div>
    </SurfaceCard>
  );
}

// 지수 한 줄 — 조회 실패면 0 이나 대체 값을 그리지 않고, 이평선이 없으면 지수값만 그린다.
function IndexStateLine({ label, state }: { label: string; state?: IndexState | null }) {
  if (!state || !(state.value > 0)) {
    return <p className="text-xs text-slate-500 dark:text-zinc-400">{label} 지수 조회 실패</p>;
  }
  const gaps = maGaps(state.value, state.maState);
  const arrangement = maArrangement(state.maState);
  return (
    <p className="text-xs text-slate-600 dark:text-zinc-300 tabular-nums leading-relaxed">
      <span className="font-bold text-slate-800 dark:text-zinc-100">
        {label} {state.value.toFixed(2)}
      </span>
      {arrangement && <span className="ml-1.5 font-semibold">{arrangement}</span>}
      {gaps.length > 0 && (
        <span
          className="ml-2 text-slate-500 dark:text-zinc-400"
          title={`지수 대비 괴리율 · 이평선 ${gaps.map((g) => `${g.period}일 ${g.ma.toFixed(2)}`).join(" / ")}`}
        >
          {gaps.map((g) => `${g.period}일 ${formatGapPct(g.gapPct)}`).join(" · ")}
        </span>
      )}
    </p>
  );
}
