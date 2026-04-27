"use client";

import React from "react";
import { useMockLive } from "./mock-live-provider";
import { useLiveMarket } from "./live-market-provider";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatNumber, formatPercent } from "@/lib/format";
import { TrendingUp, TrendingDown, Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";

export const MarketOverviewCard = () => {
  const { marketIndices } = useMockLive();
  const { indices, selectedSymbol, setSelectedSymbol } = useLiveMarket();

  // Merge mock with live - DO NOT fall back to mock if WebSocket is just pending
  const displayedIndices = marketIndices.map(mockIndex => {
    const live = indices[mockIndex.name === 'KOSPI' ? 'kospi' : 'kosdaq'];
    const symbol = mockIndex.name === 'KOSPI' ? '0001' : '1001';
    
    // Show live data if available in any state (LIVE, STALE, RECONNECTING, MOCK_FALLBACK)
    // Do NOT fall back to mock data (2580/865) - those are wrong values
    if (live?.quote) {
      return { ...live.quote, symbol, name: mockIndex.name, source: live.source }; 
    }
    // No live data yet - show skeleton/connecting state
    return { name: mockIndex.name, symbol, price: 0, change: 0, changeRate: 0, source: 'connecting' as const };
  });

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
      {displayedIndices.map((index) => {
        const isSelected = index.symbol === selectedSymbol;
        const isConnecting = index.source === 'connecting';
        const isPositive = index.change >= 0;
        const value = 'value' in index ? (index as { value: number }).value : index.price;
        
        return (
          <Card 
            key={index.name} 
            className={cn(
              "overflow-hidden shadow-sm cursor-pointer transition-all duration-300 border-2",
              isSelected ? "ring-2 ring-blue-500 border-blue-500 bg-blue-50/10" : "hover:border-slate-300 dark:hover:border-zinc-700 border-transparent"
            )}
            onClick={() => setSelectedSymbol(index.symbol)}
          >
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 bg-slate-50/50 dark:bg-slate-900/50">
              <CardTitle className="text-sm font-medium">{index.name}</CardTitle>
              {isConnecting ? (
                <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
              ) : isPositive ? (
                <TrendingUp className="h-4 w-4 text-rose-500" />
              ) : (
                <TrendingDown className="h-4 w-4 text-blue-500" />
              )}
            </CardHeader>
            <CardContent className="pt-4">
              {isConnecting ? (
                <div className="text-2xl font-bold text-slate-400 animate-pulse">---.---</div>
              ) : (
                <div className="text-2xl font-bold">{formatNumber(value)}</div>
              )}
              <p className={`text-xs mt-1 font-medium ${isConnecting ? 'text-slate-400' : isPositive ? "text-rose-500" : "text-blue-500"}`}>
                {isConnecting ? "실시간 연결 중..." : `${isPositive ? "+" : ""}${formatNumber(index.change)} (${formatPercent(index.changeRate)})`}
              </p>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
};


