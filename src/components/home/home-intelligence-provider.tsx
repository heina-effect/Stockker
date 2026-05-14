"use client";

import React, { createContext, useContext, useEffect, useState } from "react";

interface HomeIntelligenceContextType {
  data: any | null;
  isLoading: boolean;
  isRefreshing: boolean;
  error: Error | null;
}

const HomeIntelligenceContext = createContext<HomeIntelligenceContextType>({
  data: null,
  isLoading: true,
  isRefreshing: false,
  error: null,
});

const HOME_INTELLIGENCE_CACHE_KEY = "stockker_home_intelligence_v1";

export function HomeIntelligenceProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<any | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let mounted = true;
    let hadStaleCache = false;

    try {
      const cached = localStorage.getItem(HOME_INTELLIGENCE_CACHE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed?.intelligence) {
          hadStaleCache = true;
          setData({ ...parsed.intelligence, _clientCacheState: "stale-first" });
          setIsLoading(false);
          setIsRefreshing(true);
        }
      }
    } catch {
      // stale cache parse 실패는 무시하고 네트워크 fetch로 복구
    }

    async function fetchIntel() {
      try {
        if (!hadStaleCache) setIsLoading(true);
        const res = await fetch("/api/home/intelligence");
        if (!res.ok) throw new Error("Failed to fetch home intelligence");
        const json = await res.json();
        if (mounted) {
          setData(json.intelligence);
          localStorage.setItem(HOME_INTELLIGENCE_CACHE_KEY, JSON.stringify({
            intelligence: json.intelligence,
            cachedAt: new Date().toISOString(),
          }));
          setError(null);
        }
      } catch (err: any) {
        if (mounted) {
          setError(err);
        }
      } finally {
        if (mounted) {
          setIsLoading(false);
          setIsRefreshing(false);
        }
      }
    }

    fetchIntel();

    return () => {
      mounted = false;
    };
  }, []);

  return (
    <HomeIntelligenceContext.Provider value={{ data, isLoading, isRefreshing, error }}>
      {children}
      {isRefreshing && (
        <div className="fixed bottom-4 left-4 rounded-full bg-card/90 px-3 py-1.5 text-[11px] font-medium text-muted-foreground shadow-sm border border-border backdrop-blur z-40">
          홈 인텔리전스 갱신 중...
        </div>
      )}
      {data && (data._meta || data._cacheState) && process.env.NODE_ENV === "development" && (
        <div className="fixed bottom-4 right-4 bg-slate-900/80 text-white text-[10px] px-3 py-2 rounded-lg shadow-lg z-50 backdrop-blur-sm pointer-events-none flex flex-col gap-1">
          <div className="font-bold border-b border-slate-700 pb-1 mb-1 flex items-center justify-between">
            <span>Home Intelligence (Dev)</span>
            {data._meta && <span className={data._meta.mode === 'real' ? 'text-green-400 ml-2' : 'text-amber-400 ml-2'}>{data._meta.mode?.toUpperCase()}</span>}
          </div>
          {data._meta && <>
            <div className="flex justify-between gap-4"><span>Model:</span> <span className="font-mono">{data._meta.model}</span></div>
            <div className="flex justify-between gap-4"><span>Latency:</span> <span className="font-mono">{data._meta.latencyMs}ms</span></div>
            {data._meta.budgetDecision && <div className="flex justify-between gap-4"><span>Budget:</span> <span className="font-mono">{data._meta.budgetDecision}</span></div>}
            {data._meta.fallbackReason && <div className="text-amber-400 mt-1 truncate max-w-[200px]">Reason: {data._meta.fallbackReason}</div>}
          </>}
          {data._cacheState && <div className="flex justify-between gap-4"><span>Cache:</span> <span className={`font-mono ${data._cacheState === 'hit' ? 'text-green-400' : data._cacheState === 'stale' ? 'text-amber-400' : 'text-slate-400'}`}>{data._cacheState}</span></div>}
        </div>
      )}
    </HomeIntelligenceContext.Provider>
  );
}

export function useHomeIntelligence() {
  return useContext(HomeIntelligenceContext);
}
