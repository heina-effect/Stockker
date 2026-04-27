"use client";

import React from "react";
import { useLiveMarket } from "./live-market-provider";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatNumber } from "@/lib/format";
import { MARKET_STATE_TOKENS } from "@/lib/market-utils";
import { MarketState } from "@/types/stock";
import { Loader2, AlertTriangle } from "lucide-react";

export const OrderbookPanel = () => {
  const { currentSymbolState } = useLiveMarket();
  const quote = currentSymbolState?.quote || null;
  const orderbook = currentSymbolState?.orderbook || null;
  const source = currentSymbolState?.source || MarketState.CONNECTING;
  
  const token = MARKET_STATE_TOKENS[source];

  if (!orderbook || !quote) return null;

  return (
    <Card className="shadow-sm border-2 border-slate-200 dark:border-zinc-800">
      <CardHeader className="pb-3 bg-muted/30">
        <CardTitle className="text-sm font-bold flex justify-between items-center">
            <div className="flex items-center gap-2">
                <span>Order Book</span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold uppercase transition-all duration-300 ${token.className}`}>
                    {token.text}
                </span>
            </div>
            <span className="text-xs text-muted-foreground font-medium">{quote.name} ({quote.symbol})</span>
        </CardTitle>
      </CardHeader>
      <CardContent className={`p-0 transition-opacity duration-500 relative min-h-[400px] flex flex-col ${(source === MarketState.STALE || source === MarketState.RECONNECTING || source === MarketState.ERROR) ? 'opacity-50' : 'opacity-100'}`}>
        {(source === MarketState.RECONNECTING || source === MarketState.ERROR) && (
          <div className="absolute inset-x-0 bottom-0 top-[40px] z-20 flex flex-col items-center justify-center bg-background/50 backdrop-blur-[1px] rounded-b-xl">
            {source === MarketState.RECONNECTING ? (
              <>
                <Loader2 className="h-8 w-8 text-amber-500 animate-spin mb-2" />
                <span className="text-sm font-medium text-amber-600 dark:text-amber-500">재접속 중...</span>
              </>
            ) : (
              <>
                <AlertTriangle className="h-8 w-8 text-rose-500 mb-2 animate-pulse" />
                <span className="text-sm font-medium text-rose-600 dark:text-rose-500">통신 오류가 발생했습니다.</span>
              </>
            )}
          </div>
        )}
        {!orderbook ? (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-3">
                <div className="p-4 rounded-full bg-slate-50 dark:bg-zinc-800">
                    <svg className="h-8 w-8 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                </div>
                <div>
                    <p className="text-sm font-semibold text-slate-600 dark:text-zinc-400">No Order Book Data</p>
                    <p className="text-xs text-slate-400 dark:text-zinc-500 max-w-[180px] mx-auto mt-1">
                        지수 데이터는 호가 정보를 제공하지 않습니다. 차트를 참조해 주세요.
                    </p>
                </div>
            </div>
        ) : (
        <Table className="relative">
          <TableHeader className="bg-muted/50">
            <TableRow>
              <TableHead className="text-center w-1/3">Ask (Sell)</TableHead>
              <TableHead className="text-center w-1/3">Price</TableHead>
              <TableHead className="text-center w-1/3">Bid (Buy)</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {/* 매도 호가 (Asks) - 역순 출력 (높은 가격이 위로) */}
            {[...orderbook.levels].reverse().map((level, idx) => (
              <TableRow key={`ask-${idx}`} className="bg-blue-50/20 dark:bg-blue-900/10 hover:bg-blue-100/30 dark:hover:bg-blue-800/20 border-b-0">
                <TableCell className="text-center font-mono text-blue-600 dark:text-blue-400 text-xs py-2">
                  {formatNumber(level.askSize)}
                </TableCell>
                <TableCell className="text-center font-bold font-mono text-blue-700 dark:text-blue-300 text-sm py-2 bg-blue-50/40 dark:bg-blue-900/20">
                  {formatNumber(level.askPrice)}
                </TableCell>
                <TableCell />
              </TableRow>
            ))}
            
            {/* 현재가 강조선 */}
            <TableRow className="bg-zinc-100 dark:bg-zinc-800 border-y-2 border-zinc-300 dark:border-zinc-700">
              <TableCell colSpan={3} className="text-center font-black text-xl py-3 tracking-tight">
                <span className={quote.change >= 0 ? "text-rose-600 dark:text-rose-400" : "text-blue-600 dark:text-blue-400"}>
                    {formatNumber(quote.price)}
                </span>
              </TableCell>
            </TableRow>

            {/* 매수 호가 (Bids) */}
            {orderbook.levels.map((level, idx) => (
              <TableRow key={`bid-${idx}`} className="bg-rose-50/20 dark:bg-rose-900/10 hover:bg-rose-100/30 dark:hover:bg-rose-800/20 border-b-0">
                <TableCell />
                <TableCell className="text-center font-bold font-mono text-rose-700 dark:text-rose-300 text-sm py-2 bg-rose-50/40 dark:bg-rose-900/20">
                  {formatNumber(level.bidPrice)}
                </TableCell>
                <TableCell className="text-center font-mono text-rose-600 dark:text-rose-400 text-xs py-2">
                  {formatNumber(level.bidSize)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        )}
      </CardContent>
    </Card>
  );
};
