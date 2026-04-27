"use client";

import React from "react";
import { useLiveMarket } from "./live-market-provider";
import { Badge } from "@/components/ui/badge";
import { MARKET_STATE_TOKENS } from "@/lib/market-utils";
import { MarketState } from "@/types/stock";
import { Wifi, WifiOff, Database, Loader2, RefreshCw, AlertCircle } from "lucide-react";

export const ConnectionStatus = () => {
  const { currentSymbolState } = useLiveMarket();
  const source = currentSymbolState?.source || MarketState.CONNECTING;
  const token = MARKET_STATE_TOKENS[source] || MARKET_STATE_TOKENS[MarketState.CONNECTING];

  const getIcon = () => {
    switch (source) {
      case MarketState.LIVE: return <Wifi className="h-3 w-3 animate-pulse" />;
      case MarketState.CONNECTING: return <Loader2 className="h-3 w-3 animate-spin" />;
      case MarketState.RECONNECTING: return <RefreshCw className="h-3 w-3 animate-spin" />;
      case MarketState.STALE: return <Loader2 className="h-3 w-3 animate-spin opacity-50" />;
      case MarketState.MOCK_FALLBACK: return <Database className="h-3 w-3" />;
      case MarketState.ERROR: return <AlertCircle className="h-3 w-3" />;
      default: return <WifiOff className="h-3 w-3" />;
    }
  };

  return (
    <div className="flex items-center gap-2">
      <Badge variant="outline" className={`gap-1.5 py-1 transition-colors duration-300 border ${token.className}`}>
        {getIcon()}
        <span className="text-[10px] font-bold uppercase tracking-wider">{token.text}</span>
      </Badge>
    </div>
  );
};
