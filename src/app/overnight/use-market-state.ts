"use client";

import { useEffect, useState } from "react";
import type { MAState } from "./market-state";

export interface IndexState {
  value: number;
  maState?: MAState | null;
  // 전일 대비(2026-11-13). 이전 응답·직전 봉 없음이면 비어 있다
  change?: number | null;
  changeRate?: number | null;
}

export interface MarketState {
  kosdaqState: IndexState | null;
  kospiState: IndexState | null;
  fetchedAt: string;
}

// "지금 시장 상태" — 선별 결과와 따로 받는다. 실패해도 선별 결과에는 영향이 없다
export function useMarketState() {
  const [market, setMarket] = useState<MarketState | null>(null);
  const [marketFailed, setMarketFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function fetchMarket() {
      try {
        const res = await fetch("/api/screening/overnight/market-state");
        const json = await res.json().catch(() => null);
        if (cancelled) return;
        if (!res.ok || !json?.ok) {
          setMarketFailed(true);
          return;
        }
        setMarket(json);
      } catch (err) {
        console.error(err);
        if (!cancelled) setMarketFailed(true);
      }
    }
    fetchMarket();
    return () => {
      cancelled = true;
    };
  }, []);

  function showMarket(next: MarketState) {
    setMarket(next);
    setMarketFailed(false);
  }

  return { market, marketFailed, showMarket };
}
