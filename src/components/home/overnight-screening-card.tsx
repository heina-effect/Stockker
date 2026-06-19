"use client";

import { useEffect, useState } from "react";
import { ShieldAlert, TrendingUp, ArrowRight, Activity, Moon } from "lucide-react";
import Link from "next/link";

interface ScreeningData {
  ok: boolean;
  kosdaqState: {
    value: number;
    maState: {
      ma5: number;
      ma20: number;
      ma60: number;
      ma120: number;
    };
    reduceWeight: boolean;
  };
  results: {
    normal: any[];
    aggressive: any[];
    exclude: any[];
  };
  generatedAt: string;
}

export function OvernightScreeningCard() {
  const [data, setData] = useState<ScreeningData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    async function fetchScreening() {
      try {
        const res = await fetch("/api/screening/overnight");
        if (!res.ok) throw new Error("Failed to fetch");
        const json = await res.json();
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
      <div className="bg-white dark:bg-zinc-900 rounded-[24px] p-6 border border-transparent shadow-sm animate-pulse flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded-full bg-slate-200 dark:bg-zinc-800" />
          <div className="w-40 h-5 bg-slate-200 dark:bg-zinc-800 rounded" />
        </div>
        <div className="h-10 bg-slate-100 dark:bg-zinc-800/50 rounded-xl" />
        <div className="grid grid-cols-2 gap-4">
          <div className="h-16 bg-slate-50 dark:bg-zinc-950 rounded-xl" />
          <div className="h-16 bg-slate-50 dark:bg-zinc-950 rounded-xl" />
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="bg-white dark:bg-zinc-900 rounded-[24px] p-6 border border-transparent shadow-sm flex flex-col items-center justify-center py-8 text-slate-400 dark:text-zinc-500">
        <Activity className="w-8 h-8 mb-2 opacity-50" />
        <span className="text-sm">오버나이트 스크리닝 정보를 불러올 수 없습니다.</span>
      </div>
    );
  }

  const { kosdaqState, results, generatedAt } = data;
  const normalCount = results.normal.length;
  const aggressiveCount = results.aggressive.length;
  
  const generatedTimeStr = generatedAt 
    ? new Date(generatedAt).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" }) 
    : "";

  return (
    <div className="bg-white dark:bg-zinc-900 rounded-[24px] p-6 border border-transparent shadow-sm flex flex-col gap-4 relative overflow-hidden transition-all hover:shadow-md">
      
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-lg text-slate-900 dark:text-zinc-50 flex items-center gap-2">
          <Moon className="w-5 h-5 text-indigo-500 fill-indigo-500/20" />
          오버나이트 스크리닝 요약
          {generatedTimeStr && (
            <span className="text-[10px] font-normal text-slate-400 dark:text-zinc-500 ml-1.5">
              {generatedTimeStr} 업데이트
            </span>
          )}
        </h3>
        <Link
          href="/overnight"
          className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 flex items-center gap-1 hover:underline transition-colors focus-visible:outline-none"
        >
          상세 리포트
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>

      {/* 0단계: 거시 시장 상태 배너 */}
      {kosdaqState.reduceWeight ? (
        <div className="bg-amber-500/10 dark:bg-amber-500/5 border border-amber-500/20 text-amber-700 dark:text-amber-300 px-4 py-3 rounded-2xl flex items-center gap-3">
          <ShieldAlert className="w-5 h-5 text-amber-500 flex-shrink-0" />
          <div className="text-xs leading-relaxed">
            <span className="font-bold">시장 경고: 코스닥 지수 역배열 진입.</span> 전체 매매 비중을 <strong>50% 축소</strong>할 것을 권장합니다. (보수적 접근 필요)
          </div>
        </div>
      ) : (
        <div className="bg-emerald-500/10 dark:bg-emerald-500/5 border border-emerald-500/20 text-emerald-700 dark:text-emerald-400 px-4 py-3 rounded-2xl flex items-center gap-3">
          <TrendingUp className="w-5 h-5 text-emerald-500 flex-shrink-0" />
          <div className="text-xs leading-relaxed">
            <span className="font-bold">시장 지표 양호: 코스닥 지수 정배열 상태 유지.</span> 오버나이트 진입 전략을 정상 비중으로 유지합니다. (지수 종가: {kosdaqState.value.toFixed(2)})
          </div>
        </div>
      )}

      {/* 1단계 & 2단계 요약 메트릭 */}
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
    </div>
  );
}
