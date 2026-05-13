"use client";

import { useLiveMarket } from "@/components/dashboard/live-market-provider";
import { ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { FreshnessLabel } from "./freshness-label";
import { AlertCircle } from "lucide-react";
import { formatNumber } from "@/lib/utils";

import { aggregateToOHLC, calculateMA } from "@/lib/stocks/chart-utils";

export function IntradayCandlestickChartCard({ symbol }: { symbol: string }) {
  const { marketStore } = useLiveMarket();
  const state = marketStore[symbol];
  
  const rawChartData = state?.chart || [];
  const isLoading = !state || state.source === "connecting";

  if (isLoading) {
    return (
      <div className="bg-white dark:bg-zinc-900 rounded-[24px] p-6 shadow-sm border border-transparent h-[400px] flex items-center justify-center">
        <div className="animate-pulse flex items-center gap-2 text-slate-400">
          <div className="w-4 h-4 rounded-full border-2 border-slate-300 border-t-transparent animate-spin" />
          장중 차트 데이터 로드 중...
        </div>
      </div>
    );
  }

  const ohlcBase = aggregateToOHLC(rawChartData);
  let maData = calculateMA(ohlcBase, 5);
  maData = calculateMA(maData, 20);

  // 렌더링에 적합하게 데이터 매핑 (Recharts BarChart range 활용)
  const chartData = maData.map((d: any) => {
    const isUp = d.close >= d.open;
    return {
      ...d,
      isUp,
      // 꼬리(High-Low)를 표현할 수 있는 커스텀 렌더링용 확장
      // Recharts 기본 Bar는 [min, max] 만 그릴 수 있으므로 캔들스틱은 보통 커스텀 Shape를 쓰지만
      // 이번에는 범위 에러를 피하고 심플하게 유지하기 위해 몸통(open-close)만 명확하게 표시
      body: [Math.min(d.open, d.close), Math.max(d.open, d.close)]
    };
  });

  const minPrice = Math.min(...ohlcBase.map(d => d.low));
  const maxPrice = Math.max(...ohlcBase.map(d => d.high));
  const domainMin = Math.max(0, minPrice - Math.abs(minPrice * 0.005));
  const domainMax = maxPrice + Math.abs(maxPrice * 0.005);

  return (
    <div className="bg-white dark:bg-zinc-900 rounded-[24px] p-6 shadow-sm border border-transparent flex flex-col h-[400px]">
      <div className="flex items-center justify-between mb-2">
        <div className="flex flex-col">
           <h3 className="font-bold text-slate-900 dark:text-zinc-50">당일 시세 흐름</h3>
           <div className="text-[10px] text-slate-400 flex items-center gap-2 mt-1">
             <span className="flex items-center gap-1"><span className="w-2 h-2 bg-slate-400 rounded-full"></span> 캔들스틱 (1분봉)</span>
             <span className="flex items-center gap-1"><span className="w-2 h-0.5 bg-yellow-500"></span> MA5</span>
             <span className="flex items-center gap-1"><span className="w-2 h-0.5 bg-purple-500"></span> MA20</span>
           </div>
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
        <div className="flex-1 w-full relative mt-4">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} margin={{ top: 10, right: 30, left: 10, bottom: 0 }} barCategoryGap="20%">
              <XAxis dataKey="time" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} minTickGap={30} />
              <YAxis domain={[domainMin, domainMax]} orientation="right" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={(val) => Math.round(val).toLocaleString()} />
              <Tooltip 
                cursor={{ fill: 'transparent' }}
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const data = payload[0].payload;
                    const diffColor = data.isUp ? "text-red-500" : "text-blue-500";
                    return (
                      <div className="bg-white dark:bg-zinc-900 border shadow-lg rounded-xl p-4 text-xs flex flex-col gap-1 min-w-[140px]">
                        <span className="text-slate-400 font-mono mb-1">{data.time}</span>
                        <div className="flex justify-between"><span className="text-slate-500">시가</span><span className="font-mono">{formatNumber(data.open)}</span></div>
                        <div className="flex justify-between"><span className="text-slate-500">고가</span><span className="font-mono text-red-500">{formatNumber(data.high)}</span></div>
                        <div className="flex justify-between"><span className="text-slate-500">저가</span><span className="font-mono text-blue-500">{formatNumber(data.low)}</span></div>
                        <div className="flex justify-between font-bold mt-1 border-t pt-1"><span className="text-slate-900 dark:text-slate-100">종가</span><span className={`font-mono ${diffColor}`}>{formatNumber(data.close)}</span></div>
                        
                        <div className="flex justify-between border-t border-slate-100 dark:border-zinc-800 mt-2 pt-2">
                          <span className="text-yellow-600 dark:text-yellow-500">MA5</span>
                          <span className="font-mono">{data.ma5 ? formatNumber(Math.round(data.ma5)) : '-'}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-purple-600 dark:text-purple-500">MA20</span>
                          <span className="font-mono">{data.ma20 ? formatNumber(Math.round(data.ma20)) : '-'}</span>
                        </div>
                      </div>
                    );
                  }
                  return null;
                }} 
              />
              
              {/* MA5 Line */}
              <Line type="monotone" dataKey="ma5" stroke="#eab308" strokeWidth={1.5} dot={false} isAnimationActive={false} />
              
              {/* MA20 Line */}
              <Line type="monotone" dataKey="ma20" stroke="#a855f7" strokeWidth={1.5} dot={false} isAnimationActive={false} />
              
              {/* Candlestick Body */}
              <Bar dataKey="body" isAnimationActive={false}>
                {chartData.map((entry, index) => (
                  <Cell 
                    key={`cell-${index}`} 
                    fill={entry.isUp ? "#ef4444" : "#3b82f6"} 
                    stroke={entry.isUp ? "#ef4444" : "#3b82f6"} 
                    strokeWidth={1}
                  />
                ))}
              </Bar>
            </ComposedChart>
          </ResponsiveContainer>
          
          {state.source === "mock-fallback" && (
            <div className="absolute inset-0 bg-white/50 dark:bg-zinc-900/50 backdrop-blur-[1px] flex items-center justify-center pointer-events-none">
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
