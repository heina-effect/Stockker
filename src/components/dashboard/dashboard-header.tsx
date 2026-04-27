"use client";

import React from "react";
import { useLiveMarket } from "./live-market-provider";
import { Badge } from "@/components/ui/badge";
import { MARKET_STATE_TOKENS } from "@/lib/market-utils";
import { MarketState } from "@/types/stock";
import { Activity, LayoutDashboard } from "lucide-react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export const DashboardHeader = () => {
  const { currentSymbolState } = useLiveMarket();
  const source = currentSymbolState?.source || MarketState.CONNECTING;
  const lastUpdated = currentSymbolState?.lastUpdated || 0;
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  const token = MARKET_STATE_TOKENS[source] || MARKET_STATE_TOKENS[MarketState.CONNECTING];

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-14 items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="bg-blue-600 p-1.5 rounded-lg shadow-blue-200 dark:shadow-blue-900/20 shadow-lg">
              <LayoutDashboard className="h-5 w-5 text-white" />
            </div>
          </div>
          <h1 className="text-xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-indigo-600 dark:from-blue-400 dark:to-indigo-400">
            Stockker
          </h1>
          <Tooltip>
            <TooltipTrigger>
              <Badge variant="outline" className={cn("ml-2 font-bold gap-1 px-2 py-0.5 border transition-colors duration-300 cursor-help", token.className)}>
                <span className={cn("h-1.5 w-1.5 rounded-full", token.dotClassName)} />
                {token.text}
              </Badge>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs font-medium">
              {source === MarketState.MOCK_FALLBACK && "API 호출 에러 혹은 접속 제한으로 체결/지수 모의 데이터 대체 제공 중"}
              {source === MarketState.RECONNECTING && "서버와의 실시간 연결이 끊겨 재접속을 시도하고 있습니다."}
              {source === MarketState.ERROR && "치명적 통신 오류가 발생했습니다. 시스템을 확인해 주세요."}
              {source === MarketState.STALE && "데이터 수신이 5초 이상 지연되고 있습니다."}
              {source === MarketState.LIVE && "실시간 데이터 정상 수신 중"}
              {source === MarketState.CONNECTING && "실시간 서버에 연결 중입니다..."}
            </TooltipContent>
          </Tooltip>
        </div>
        
        <div className="flex items-center gap-6">
          <div className="hidden sm:flex items-center gap-1.5 min-w-[130px] justify-end">
            <Activity className={cn("h-3.5 w-3.5", token.animateClass)} />
            <span className={cn("text-xs font-bold tracking-tight uppercase", token.textClass)}>
              {token.text}
            </span>
            <span className="text-[10px] text-slate-400 dark:text-slate-500 font-mono ml-1 tabular-nums">
              {mounted && lastUpdated > 0 ? new Date(lastUpdated).toLocaleTimeString() : "--:--:--"}
            </span>
          </div>
        </div>
      </div>
    </header>
  );
};
