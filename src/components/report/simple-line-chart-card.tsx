"use client";

import { useLiveMarket } from "@/components/dashboard/live-market-provider";
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer } from "recharts";
import { FreshnessLabel } from "./freshness-label";
import { AlertCircle } from "lucide-react";

export function SimpleLineChartCard({ symbol }: { symbol: string }) {
  const { marketStore } = useLiveMarket();
  const state = marketStore[symbol];
  
  const chartData = state?.chart || [];
  const isLoading = !state || state.source === "connecting";
  const isUp = (state?.quote?.change || 0) >= 0;

  if (isLoading) {
    return (
      <div className="bg-white dark:bg-zinc-900 rounded-[24px] p-6 shadow-sm border h-[300px] flex items-center justify-center">
        <div className="animate-pulse flex items-center gap-2 text-slate-400">
          <div className="w-4 h-4 rounded-full border-2 border-slate-300 border-t-transparent animate-spin" />
          차트 데이터 불러오는 중...
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-zinc-900 rounded-[24px] p-6 shadow-sm border flex flex-col h-[300px]">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-bold text-slate-900 dark:text-zinc-50">당일 시세 흐름</h3>
        
        {state.source === "live" ? (
          <FreshnessLabel type="price" state="live" timestamp={new Date().toISOString()} />
        ) : state.source === "mock-fallback" ? (
          <FreshnessLabel type="price" state="error" timestamp={new Date().toISOString()} />
        ) : (
          <FreshnessLabel type="price" state="stale" timestamp={new Date(state.lastUpdated).toISOString()} />
        )}
      </div>

      {chartData.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-slate-400 dark:text-zinc-600 gap-2">
          <AlertCircle className="w-8 h-8 opacity-50" />
          <p className="text-sm">차트 데이터가 없습니다.</p>
        </div>
      ) : (
        <div className="flex-1 w-full relative">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <XAxis dataKey="time" hide />
              <YAxis domain={["dataMin", "dataMax"]} hide />
              <Line 
                type="monotone" 
                dataKey="price" 
                stroke={isUp ? "#ef4444" : "#3b82f6"} 
                strokeWidth={3}
                dot={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
          
          {state.source === "mock-fallback" && (
            <div className="absolute inset-0 bg-white/50 dark:bg-zinc-900/50 backdrop-blur-[1px] flex items-center justify-center">
              <span className="bg-white dark:bg-zinc-800 text-xs font-semibold px-3 py-1.5 rounded-full border shadow-sm">
                장 마감 또는 데이터 지연 (Mock)
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
