"use client";

import React from "react";
import { useLiveMarket } from "./live-market-provider";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LineChart, Line, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer } from "recharts";
import { Loader2, AlertTriangle } from "lucide-react";
import { MARKET_STATE_TOKENS } from "@/lib/market-utils";
import { MarketState } from "@/types/stock";
import { formatNumber } from "@/lib/format";

export const PriceChart = () => {
  const { currentSymbolState } = useLiveMarket();
  const quote = currentSymbolState?.quote || null;
  const source = currentSymbolState?.source || MarketState.CONNECTING;
  const chartPoints = currentSymbolState?.chart || [];
  
  const token = MARKET_STATE_TOKENS[source];

  if (!quote) return null;

  return (
    <Card className="shadow-sm border-2 border-slate-200 dark:border-zinc-800">
      <CardHeader className="pb-3 border-b flex flex-row items-center justify-between bg-muted/10">
        <div className="flex items-center gap-3">
            <CardTitle className="text-lg font-bold">Price Chart</CardTitle>
            <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold uppercase transition-colors duration-300 ${token.className}`}>
                {token.text}
            </span>
        </div>
        <div className="text-sm font-mono bg-zinc-100 dark:bg-zinc-800 px-3 py-1.5 rounded-md font-bold text-zinc-700 dark:text-zinc-300">
          {quote.name || quote.symbol}
        </div>
      </CardHeader>
      <CardContent className="pt-6 h-[320px] w-full p-6 relative flex flex-col items-center justify-center">
        {(source === MarketState.RECONNECTING || source === MarketState.ERROR || source === MarketState.MOCK_FALLBACK) && (
          <div className="absolute inset-x-0 bottom-0 top-[20px] z-10 flex flex-col items-center justify-center bg-background/50 backdrop-blur-[1px] rounded-b-xl border-t border-slate-100 dark:border-zinc-800/50">
            {source === MarketState.RECONNECTING ? (
              <>
                <Loader2 className="h-8 w-8 text-amber-500 animate-spin mb-2" />
                <span className="text-sm font-medium text-amber-600 dark:text-amber-500">서버 연결 시도 중...</span>
              </>
            ) : source === MarketState.ERROR ? (
              <>
                <AlertTriangle className="h-8 w-8 text-rose-500 mb-2 animate-pulse" />
                <span className="text-sm font-medium text-rose-600 dark:text-rose-500">통신 오류가 발생했습니다.</span>
              </>
            ) : (
              <>
                <Loader2 className="h-6 w-6 text-slate-400 animate-spin mb-2 opacity-50" />
                <span className="text-xs font-medium text-slate-500 dark:text-slate-400">네트워크 지연으로 모의 데이터 표시 중...</span>
                <span className="text-[10px] text-slate-400 mt-1">곧 실시간 모드로 복구됩니다.</span>
              </>
            )}
          </div>
        )}
        <div style={{ width: '100%', height: 280, minHeight: 280 }} className={`transition-opacity duration-500 ${(source === MarketState.STALE || source === MarketState.RECONNECTING || source === MarketState.ERROR || source === MarketState.MOCK_FALLBACK) ? 'opacity-30' : 'opacity-100'}`}>
          <ResponsiveContainer width="100%" height={280}>
          <LineChart data={chartPoints.length > 0 ? chartPoints : [{ time: '00:00', price: quote.price }]}>
            <XAxis 
              dataKey="time" 
              fontSize={10} 
              tickLine={false} 
              axisLine={false}
              interval="preserveStartEnd"
              stroke="#888888"
            />
            <YAxis 
              fontSize={10} 
              tickLine={false} 
              axisLine={false} 
              domain={["auto", "auto"]}
              tickFormatter={(value) => formatNumber(value)}
              stroke="#888888"
              width={60}
            />
            <RechartsTooltip 
              contentStyle={{ 
                backgroundColor: "rgba(255, 255, 255, 0.96)", 
                borderRadius: "12px", 
                border: "1px solid #e2e8f0",
                boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
                fontSize: "12px",
                fontFamily: "monospace"
              }}
              formatter={(value) => {
                return [formatNumber(Number(value ?? 0)), "Price"];
              }}
            />
            <Line 
              type="monotone" 
              dataKey="price" 
              stroke={quote.change >= 0 ? "#e11d48" : "#2563eb"} 
              strokeWidth={3} 
              dot={false} 
              activeDot={{ r: 5, strokeWidth: 0 }}
              animationDuration={source === MarketState.LIVE ? 0 : 800} // Disable animation for live updates to feel more responsive
            />
          </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
};
