"use client";

import React, { createContext, useContext, useEffect, useState } from "react";

interface HomeIntelligenceContextType {
  data: any | null;
  isLoading: boolean;
  error: Error | null;
}

const HomeIntelligenceContext = createContext<HomeIntelligenceContextType>({
  data: null,
  isLoading: true,
  error: null,
});

export function HomeIntelligenceProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<any | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let mounted = true;

    async function fetchIntel() {
      try {
        const res = await fetch("/api/home/intelligence");
        if (!res.ok) throw new Error("Failed to fetch home intelligence");
        const json = await res.json();
        if (mounted) {
          setData(json.intelligence);
        }
      } catch (err: any) {
        if (mounted) {
          setError(err);
        }
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    }

    fetchIntel();

    return () => {
      mounted = false;
    };
  }, []);

  return (
    <HomeIntelligenceContext.Provider value={{ data, isLoading, error }}>
      {children}
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
