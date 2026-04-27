"use client";

import React from "react";
import { useMockLive } from "./mock-live-provider";
import { useLiveMarket } from "./live-market-provider";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency, formatPercent } from "@/lib/format";
import { MARKET_STATE_TOKENS } from "@/lib/market-utils";
import { MarketState } from "@/types/stock";
import { cn } from "@/lib/utils"; // Added import for cn

export const WatchlistPanel = () => {
  const { watchlist } = useMockLive();
  const { marketStore, selectedSymbol, setSelectedSymbol } = useLiveMarket(); // Modified destructuring

  const overallMarketState = Object.values(marketStore)[0]?.source || MarketState.CONNECTING;
  const headerToken = MARKET_STATE_TOKENS[overallMarketState];

  return (
    <Card className="h-full shadow-sm">
      <CardHeader className="pb-3 text-sm">
        <CardTitle className="text-lg font-bold flex justify-between items-center">
            <span>Watchlist</span>
            <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold uppercase transition-colors duration-300 ${headerToken.className}`}>
                {headerToken.text}
            </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader className="bg-muted/50">
            <TableRow>
              <TableHead className="w-[80px]">Symbol</TableHead>
              <TableHead>Name</TableHead>
              <TableHead className="text-right">Price</TableHead>
              <TableHead className="text-right">Change</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {watchlist.map((stock) => {
              const live = marketStore[stock.symbol];
              const isSelected = stock.symbol === selectedSymbol;
              
              const quote = live?.quote || null;
              
              const displayPrice = quote ? quote.price : stock.price;
              const displayChangeRate = quote ? quote.changeRate : stock.changeRate;
              const isPositive = quote ? quote.change > 0 : stock.change > 0;
              const isNegative = quote ? quote.change < 0 : stock.change < 0;

              return (
                <TableRow 
                  key={stock.symbol} 
                  className={cn(
                    "cursor-pointer transition-colors",
                    isSelected ? "bg-muted font-medium border-l-4 border-l-blue-500" : "hover:bg-muted/50"
                  )}
                  onClick={() => setSelectedSymbol(stock.symbol)}
                >
                  <TableCell className="font-mono text-xs">{stock.symbol}</TableCell>
                  <TableCell className="text-sm truncate max-w-[100px]">{stock.name}</TableCell>
                  <TableCell className="text-right font-mono text-xs">
                    {formatCurrency(displayPrice)}
                  </TableCell>
                  <TableCell className={cn(
                    "text-right font-mono text-xs",
                    isPositive ? "text-rose-600" : isNegative ? "text-blue-600" : ""
                  )}>
                    {formatPercent(displayChangeRate)}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
};
