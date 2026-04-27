"use client";

import { useLiveMarket } from "@/components/dashboard/live-market-provider";
import { BarChart, Bar, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { FreshnessLabel } from "./freshness-label";
import { AlertCircle } from "lucide-react";
import { formatNumber, formatChange } from "@/lib/utils";

export function IntradayPriceBarChartCard({ symbol }: { symbol: string }) {
  const { marketStore } = useLiveMarket();
  const state = marketStore[symbol];
  
  const rawChartData = state?.chart || [];
  const isLoading = !state || state.source === "connecting";
  const quote = state?.quote;

  if (isLoading) {
    return (
      <div className="bg-white dark:bg-zinc-900 rounded-[24px] p-6 shadow-sm border h-[300px] flex items-center justify-center">
        <div className="animate-pulse flex items-center gap-2 text-slate-400">
          <div className="w-4 h-4 rounded-full border-2 border-slate-300 border-t-transparent animate-spin" />
          장중 차트 데이터 불러오는 중...
        </div>
      </div>
    );
  }

  // BarChart의 범위를 눈에 잘 띄게 하기 위해 최저가 기준으로 기준선(baseline) 설정
  let minPrice = rawChartData.length > 0 ? Math.min(...rawChartData.map(d => d.price)) : 0;
  let maxPrice = rawChartData.length > 0 ? Math.max(...rawChartData.map(d => d.price)) : 0;
  
  // 데이터가 일자 수평인 경우 범위를 약간 늘려줌
  if (minPrice === maxPrice && minPrice > 0) {
    minPrice = minPrice * 0.999;
    maxPrice = maxPrice * 1.001;
  }
  
  const baseline = Math.max(0, minPrice - Math.abs(minPrice * 0.002)); // 0.2% 간격

  const chartData = rawChartData.map((d, i) => {
    const prevPrice = i > 0 ? rawChartData[i - 1].price : (quote?.open || d.price);
    const isUp = d.price >= prevPrice;
    return {
      ...d,
      range: [baseline, d.price],
      isUp,
      diff: d.price - prevPrice,
      diffRate: ((d.price - prevPrice) / prevPrice) * 100
    };
  });



  return (
    <div className="bg-white dark:bg-zinc-900 rounded-[24px] p-6 shadow-sm border flex flex-col h-[300px]">
      <div className="flex items-center justify-between mb-2">
        <div className="flex flex-col">
           <h3 className="font-bold text-slate-900 dark:text-zinc-50">당일 시세 흐름</h3>
           <span className="text-[10px] text-slate-400">1분 버킷 기준 (Bar Chart)</span>
        </div>
        
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
        <div className="flex-1 w-full relative mt-2">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 10, right: 0, left: 0, bottom: 0 }} barCategoryGap={1}>
              <XAxis dataKey="time" hide />
              <YAxis domain={[baseline, maxPrice + Math.abs(maxPrice * 0.002)]} hide />
              <Tooltip 
                cursor={{ fill: 'transparent' }}
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const data = payload[0].payload;
                    const diffColor = data.isUp ? "text-red-500" : "text-blue-500";
                    return (
                      <div className="bg-white dark:bg-zinc-900 border shadow-lg rounded-xl p-3 text-sm flex flex-col">
                        <span className="text-slate-400 text-xs mb-1 font-mono">{data.time}</span>
                        <span className="font-bold text-slate-900 dark:text-zinc-50">{formatNumber(data.price)}원</span>
                        {Math.abs(data.diff) > 0 && (
                          <span className={`${diffColor} text-[10px] font-semibold mt-0.5`}>
                            {data.isUp ? "▲" : "▼"} {formatNumber(Math.abs(data.diff))} ({formatChange(Math.abs(data.diffRate))}%)
                          </span>
                        )}
                      </div>
                    );
                  }
                  return null;
                }} 
              />
              <Bar 
                dataKey="range" 
                isAnimationActive={false}
                radius={[2, 2, 0, 0] as [number, number, number, number]}
              >
                {chartData.map((entry, index) => (
                  <Cell 
                    key={`cell-${index}`} 
                    fill={entry.isUp ? "#ef4444" : "#3b82f6"} 
                    fillOpacity={0.8}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          
          {state.source === "mock-fallback" && (
            <div className="absolute inset-0 bg-white/50 dark:bg-zinc-900/50 backdrop-blur-[1px] flex items-center justify-center">
              <span className="bg-white dark:bg-zinc-800 text-xs font-semibold px-3 py-1.5 rounded-full border shadow-sm">
                장 마감 또는 가격 지연 (Mock)
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
