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
const HOME_INTELLIGENCE_TIMEOUT_MS = 8000;

function sanitizeCachedData(intel: any) {
  if (!intel) return intel;
  
  // 1. stocks 내 LG에너지솔루션 심볼 강제 보정
  if (Array.isArray(intel.stocks)) {
    intel.stocks = intel.stocks.map((s: any) => {
      if (s?.name === "LG에너지솔루션" && s?.symbol !== "373220") {
        return { ...s, symbol: "373220" };
      }
      return s;
    });
  }
  
  // 2. aiPicks 내 LG에너지솔루션 심볼 강제 보정
  if (Array.isArray(intel.aiPicks)) {
    intel.aiPicks = intel.aiPicks.map((p: any) => {
      if (p?.type === "stock" && p?.name === "LG에너지솔루션" && p?.targetId !== "373220") {
        return { ...p, targetId: "373220" };
      }
      return p;
    });
  }
  
  return intel;
}

function readCachedHomeIntelligence() {
  if (typeof window === "undefined") return null;

  try {
    const cached = window.localStorage.getItem(HOME_INTELLIGENCE_CACHE_KEY);
    if (!cached) return null;
    const parsed = JSON.parse(cached);
    if (parsed?.intelligence && typeof parsed.intelligence === "object") {
      return sanitizeCachedData(parsed.intelligence);
    }
    return null;
  } catch {
    return null;
  }
}

function writeCachedHomeIntelligence(intelligence: any) {
  if (typeof window === "undefined" || !intelligence) return;

  try {
    const sanitized = sanitizeCachedData(intelligence);
    window.localStorage.setItem(
      HOME_INTELLIGENCE_CACHE_KEY,
      JSON.stringify({ intelligence: sanitized, cachedAt: new Date().toISOString() }),
    );
  } catch {
    // localStorage quota/permission errors should never block the dashboard.
  }
}

export function HomeIntelligenceProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<any | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let mounted = true;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), HOME_INTELLIGENCE_TIMEOUT_MS);

    const cached = readCachedHomeIntelligence();
    if (cached) {
      setData(cached);
      setIsLoading(false);
      setIsRefreshing(true);
    }

    async function fetchIntel() {
      try {
        const res = await fetch("/api/home/intelligence", { signal: controller.signal });
        if (!res.ok) throw new Error("Failed to fetch home intelligence");
        const json = await res.json();
        if (mounted) {
          setData(json.intelligence);
          writeCachedHomeIntelligence(json.intelligence);
          setError(null);
        }
      } catch (err: any) {
        if (mounted) {
          if (err?.name !== "AbortError") {
            setError(err);
          } else if (!cached) {
            setError(new Error("Home intelligence request timed out"));
          }
        }
      } finally {
        window.clearTimeout(timeout);
        if (mounted) {
          setIsLoading(false);
          setIsRefreshing(false);
        }
      }
    }

    fetchIntel();

    return () => {
      mounted = false;
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, []);

  return (
    <HomeIntelligenceContext.Provider value={{ data, isLoading, isRefreshing, error }}>
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
