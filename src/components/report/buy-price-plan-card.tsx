"use client";

import { useState, useEffect } from "react";
import type { BuyPricePlan } from "@/types/research";
import { Button } from "@/components/ui/button";
import { Loader2, Calculator, Info } from "lucide-react";
import { formatNumber } from "@/lib/utils";
import { LocalStorageAdapter } from "@/lib/user-storage/local-adapter";

// 금액의 한글 표기 변환기
function getKoreanAmountHelper(amount: number): string {
  if (!amount || amount === 0) return "";
  if (amount < 10000) return `${amount.toLocaleString()}원`;
  
  if (amount >= 100000000) {
    const uk = amount / 100000000;
    return `약 ${uk.toLocaleString(undefined, { maximumFractionDigits: 1 })}억 원`;
  }
  const man = amount / 10000;
  return `약 ${man.toLocaleString(undefined, { maximumFractionDigits: 0 })}만 원`;
}

export function BuyPricePlanCard({ symbol }: { symbol: string }) {
  const [displayValue, setDisplayValue] = useState("");
  const [plan, setPlan] = useState<BuyPricePlan | null>(null);
  const [loading, setLoading] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    // Component Mount 시 localStorage 복원 (Hydration)
    const savedPrice = LocalStorageAdapter.getBuyPrice(symbol);
    if (savedPrice) {
      setDisplayValue(savedPrice.toLocaleString());
    }
    setHydrated(true);
  }, [symbol]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // 1. 숫자만 획득
    const rawNum = e.target.value.replace(/[^0-9]/g, "");
    if (!rawNum) {
      setDisplayValue("");
      return;
    }
    // 2. 콤마 붙여서 상태 업데이트
    setDisplayValue(parseInt(rawNum, 10).toLocaleString());
  };

  const getRawNumber = () => {
    return parseInt(displayValue.replace(/,/g, ""), 10) || 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const rawVal = getRawNumber();
    if (!rawVal || rawVal <= 0) return;

    setLoading(true);
    try {
      const res = await fetch(`/api/stocks/${symbol}/buy-plan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetPrice: rawVal }),
      });
      const data = await res.json();
      if (data.ok) {
        setPlan(data.buyPlan);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSave = () => {
    const rawVal = getRawNumber();
    if (rawVal > 0) {
      LocalStorageAdapter.setBuyPrice(symbol, rawVal);
      // 상태 강제 업데이트를 위해 setDisplayValue를 한 번 더 호출하여 리렌더링 유발
      setDisplayValue(rawVal.toLocaleString());
    }
  };

  return (
    <div className="bg-white dark:bg-zinc-900 rounded-[24px] p-6 shadow-sm border border-transparent relative overflow-hidden">
      <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-50 dark:bg-indigo-900/10 rounded-bl-full -z-10" />
      
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Calculator className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
          <h3 className="font-bold text-slate-900 dark:text-zinc-50 flex items-center gap-2">
            내 평단가 기준 대응 가이드
            {hydrated && displayValue.length > 0 && (
              <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                (LocalStorageAdapter.getBuyPrice(symbol) === getRawNumber()) 
                ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' 
                : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
              }`}>
                {(LocalStorageAdapter.getBuyPrice(symbol) === getRawNumber()) ? "저장됨" : "임시 입력"}
              </span>
            )}
          </h3>
        </div>
      </div>
      
      <p className="text-sm text-slate-500 dark:text-zinc-400 mb-6">
        현재 보유 중인 주식의 평균단가를 입력하면 AI가 비중 조절 및 대응 가이드를 제안해 드립니다.
      </p>

      {!hydrated ? (
        <div className="h-12 bg-slate-50 dark:bg-zinc-950 animate-pulse border-2 rounded-xl" />
      ) : !plan ? (
        <form onSubmit={handleSubmit} className="flex flex-col gap-2">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <input
                type="text"
                placeholder="예: 120,000"
                value={displayValue}
                onChange={handleChange}
                className="w-full h-12 bg-slate-50 dark:bg-zinc-950 border-2 border-slate-100 dark:border-zinc-800 rounded-xl px-4 pr-10 text-sm focus:outline-none focus:border-indigo-500 transition-colors text-right font-mono"
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 text-sm font-medium">원</span>
            </div>
            <Button 
              type="submit" 
              disabled={!displayValue || loading}
              className="h-12 rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-indigo-600 dark:hover:bg-indigo-700 text-white font-medium w-full sm:w-auto px-6"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "가이드 받기"}
            </Button>
          </div>
          {displayValue && getRawNumber() > 0 && (
            <p className="text-xs text-indigo-500 font-medium px-2">
              입력 단위: {getKoreanAmountHelper(getRawNumber())}
            </p>
          )}
        </form>
      ) : (
        <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">
          <div className="flex flex-wrap items-center gap-4 mb-4 pb-4 border-b border-slate-100 dark:border-zinc-800">
            <div>
              <p className="text-xs text-slate-500 mb-1">입력된 매수가</p>
              <p className="font-semibold">{formatNumber(plan.targetPrice)}원</p>
            </div>
            <div>
              <p className="text-xs text-slate-500 mb-1">예상 수익률</p>
              <p className={`font-bold ${plan.currentProfitLossRate > 0 ? "text-red-500" : "text-blue-500"}`}>
                {plan.currentProfitLossRate > 0 ? "+" : ""}{plan.currentProfitLossRate}%
              </p>
            </div>
          </div>
          
          <div className="mb-4">
            <h4 className="text-sm font-bold text-slate-800 dark:text-zinc-200 mb-2">포지션 진단</h4>
            <p className="text-sm text-slate-600 dark:text-zinc-400 bg-slate-50 dark:bg-zinc-950 p-3 rounded-xl border">
              {plan.positionAnalysis}
            </p>
          </div>
          
          <div>
            <h4 className="text-sm font-bold text-slate-800 dark:text-zinc-200 mb-2">AI 액션 가이드</h4>
            <ul className="flex flex-col gap-2">
              {plan.actionGuides.map((guide, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-slate-600 dark:text-zinc-300 relative pl-4">
                  <span className="absolute left-0 top-1.5 w-1.5 h-1.5 bg-indigo-400 rounded-full" />
                  {guide}
                </li>
              ))}
            </ul>
          </div>
          
          <div className="mt-6 flex items-center justify-between">
            <div className="text-[10px] text-slate-400 flex items-center gap-1">
              <Info className="w-3 h-3" /> 본 가이드는 AI 기반 참조용입니다.
            </div>
            <div className="flex gap-2 items-center">
              <button 
                onClick={() => setPlan(null)} 
                className="text-xs text-slate-500 font-medium hover:underline px-2"
              >
                다시 입력
              </button>
              <Button 
                onClick={handleSave}
                size="sm"
                className="h-8 text-xs bg-indigo-50 text-indigo-600 hover:bg-indigo-100 dark:bg-indigo-900/30 dark:text-indigo-400 font-semibold"
              >
                이 평단가 저장
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
