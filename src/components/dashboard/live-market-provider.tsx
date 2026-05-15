"use client";

import React, { createContext, useContext, useState, useEffect, useCallback, useRef, useMemo } from "react";
import { usePathname } from "next/navigation";
import { toast } from "sonner";
import { MarketState, type SymbolState, type MarketStore, type StockQuote } from "@/types/stock";

interface LiveMarketContextType {
    selectedSymbol: string;
    marketStore: MarketStore;
    setSelectedSymbol: (symbol: string) => void;
    // Helper selectors for easier UI consumption
    currentSymbolState: SymbolState | null;
    indices: { kospi: SymbolState | null; kosdaq: SymbolState | null };
}

const LiveMarketContext = createContext<LiveMarketContextType | undefined>(undefined);
const LIVE_QUOTE_CACHE_PREFIX = "stockker_live_quote_v1:";
const LIVE_QUOTE_CACHE_MAX_AGE_MS = 10 * 60 * 1000;

function readCachedQuote(symbol: string): Pick<SymbolState, "quote" | "lastUpdated"> | null {
    if (typeof window === "undefined") return null;

    try {
        const raw = window.localStorage.getItem(`${LIVE_QUOTE_CACHE_PREFIX}${symbol}`);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed?.quote?.price || !parsed?.lastUpdated) return null;
        if (Date.now() - Number(parsed.lastUpdated) > LIVE_QUOTE_CACHE_MAX_AGE_MS) return null;
        return { quote: parsed.quote, lastUpdated: Number(parsed.lastUpdated) };
    } catch {
        return null;
    }
}

function writeCachedQuote(symbol: string, quote: StockQuote | null | undefined, lastUpdated: number) {
    if (typeof window === "undefined" || !quote?.price || quote.price <= 0) return;

    try {
        window.localStorage.setItem(
            `${LIVE_QUOTE_CACHE_PREFIX}${symbol}`,
            JSON.stringify({ quote, lastUpdated }),
        );
    } catch {
        // 시세 캐시는 UX 보조용이다. 저장 실패가 화면을 막으면 안 된다.
    }
}

export const LiveMarketProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const pathname = usePathname();
    const routeSymbol = useMemo(() => pathname?.match(/^\/stocks\/(\d{6})/)?.[1] ?? "", [pathname]);
    const isStockRoute = Boolean(routeSymbol);

    const [selectedSymbol, setSelectedSymbol] = useState(routeSymbol);
    const [marketStore, setMarketStore] = useState<MarketStore>({});
    
    // Track last update time for stale detection
    const lastUpdateTsRef = useRef<number>(0);
    const prevSourceRef = useRef<MarketState | null>(null);
    const currentAbortControllerRef = useRef<AbortController | null>(null);

    // Watch for recovery to LIVE state to show toast notification
    useEffect(() => {
        const currentSource = marketStore[selectedSymbol]?.source;
        if (currentSource) {
            const prevSource = prevSourceRef.current;
            if (
                prevSource &&
                prevSource !== MarketState.LIVE &&
                prevSource !== MarketState.CONNECTING &&
                currentSource === MarketState.LIVE
            ) {
                toast.success("실시간 데이터 연결이 복구되었습니다.");
            }
            prevSourceRef.current = currentSource;
        }
    }, [marketStore, selectedSymbol]);
    
    // Live KIS bootstrap은 종목 상세처럼 실제 시세가 필요한 화면에서만 실행한다.
    const bootstrap = useCallback(async (symbol: string, signal?: AbortSignal) => {
        const updateSymbol = (s: string, data: Partial<SymbolState>) => {
            setMarketStore(prev => {
                const existing = prev[s];
                // Smart Merge: If incoming is fallback/error but existing is LIVE, keep the LIVE quote/chart
                const isIncomingDegraded = data.source === MarketState.MOCK_FALLBACK || data.source === MarketState.ERROR;
                const isExistingLive = existing?.source === MarketState.LIVE;

                const shouldKeepExistingQuote = isIncomingDegraded && isExistingLive;

                return {
                    ...prev,
                    [s]: {
                        symbol: s,
                        quote: shouldKeepExistingQuote ? existing.quote : (data.quote ?? existing?.quote ?? null),
                        orderbook: shouldKeepExistingQuote ? existing.orderbook : (data.orderbook ?? existing?.orderbook ?? null),
                        chart: shouldKeepExistingQuote ? existing.chart : (data.chart ?? existing?.chart ?? []),
                        source: data.source ?? existing?.source ?? MarketState.CONNECTING,
                        lastUpdated: data.lastUpdated ?? existing?.lastUpdated ?? Date.now()
                    }
                };
            });
        };

        try {
            // 1. Primary Selection (Stock or Index)
            const isIndex = symbol === "0001" || symbol === "1001";
            // NOTE: Do NOT set CONNECTING here - it destroys existing LIVE data!
            // Only set CONNECTING if there's no existing data yet
            setMarketStore(prev => {
                if (!prev[symbol]) {
                    return { ...prev, [symbol]: { symbol, quote: null, orderbook: null, chart: [], source: MarketState.CONNECTING, lastUpdated: 0 } };
                }
                return prev;
            });
            
            const endpoint = isIndex 
                ? `/api/kis/bootstrap?symbol=${symbol}&type=index` 
                : `/api/kis/bootstrap?symbol=${symbol}`;
                
            const stockRes = await fetch(endpoint, { signal });
            const stockData = await stockRes.json();
            
            if (signal?.aborted) return;

            if (stockData.ok) {
                const rawPrice = isIndex ? (stockData.index?.value) : (stockData.quote?.price);
                const currentPrice = (rawPrice && !isNaN(rawPrice) && rawPrice !== 0) ? rawPrice : 1;
                
                const quote = isIndex ? {
                    symbol,
                    name: stockData.index?.name || (symbol === "0001" ? "KOSPI" : "KOSDAQ"),
                    price: currentPrice,
                    change: stockData.index?.change || 0,
                    changeRate: stockData.index?.changeRate || 0,
                    volume: 0, high: 0, low: 0, open: 0, timestamp: new Date().toISOString()
                } : stockData.quote;
                
                let chart = [];
                if (!isIndex && process.env.NEXT_PUBLIC_ENABLE_INTRADAY_CHART === "1") {
                    try {
                        const ohlcRes = await fetch(`/api/stocks/${symbol}/ohlc?mode=intraday`, { signal });
                        const ohlcData = await ohlcRes.json();
                        if (ohlcData.ok) {
                            chart = ohlcData.chart;
                        }
                    } catch (e) {
                        console.warn("[LiveMarket] OHLC backfill fetch failed:", e);
                    }
                }
                
                chart.push({ 
                    time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), 
                    price: currentPrice 
                });

                const nextLastUpdated = Date.now();

                updateSymbol(symbol, {
                    quote,
                    orderbook: isIndex ? null : stockData.orderbook,
                    chart,
                    source: stockData.source === "mock-fallback" ? MarketState.MOCK_FALLBACK : MarketState.LIVE,
                    lastUpdated: nextLastUpdated
                });
                if (!isIndex) writeCachedQuote(symbol, quote, nextLastUpdated);
                
                lastUpdateTsRef.current = nextLastUpdated;
            } else {
                updateSymbol(symbol, { source: MarketState.MOCK_FALLBACK });
                return;
            }

        } catch (e) {
            if (e instanceof Error && e.name === 'AbortError') return;
            console.error("[LiveMarket] Bootstrap failed:", e);
            updateSymbol(symbol, { source: MarketState.MOCK_FALLBACK });
        }
    }, []);

    useEffect(() => {
        if (routeSymbol && routeSymbol !== selectedSymbol) {
            setSelectedSymbol(routeSymbol);
        }
    }, [routeSymbol, selectedSymbol]);


    // 4. Initial bootstrap and on symbol change
    const lastSymbolRef = useRef<string>("");
    useEffect(() => {
        if (!isStockRoute || !selectedSymbol) return;

        // Only trigger full bootstrap when selectedSymbol changes
        if (lastSymbolRef.current === selectedSymbol) return;
        lastSymbolRef.current = selectedSymbol;

        const cached = readCachedQuote(selectedSymbol);
        if (cached) {
            setMarketStore(prev => {
                const existing = prev[selectedSymbol];
                if (existing?.quote?.price && existing.source === MarketState.LIVE) return prev;
                return {
                    ...prev,
                    [selectedSymbol]: {
                        symbol: selectedSymbol,
                        quote: cached.quote,
                        orderbook: existing?.orderbook ?? null,
                        chart: existing?.chart ?? [],
                        source: MarketState.STALE,
                        lastUpdated: cached.lastUpdated,
                    },
                };
            });
        }
        
        // Cancel previous if any
        if (currentAbortControllerRef.current) {
            currentAbortControllerRef.current.abort();
        }
        
        const controller = new AbortController();
        currentAbortControllerRef.current = controller;
        
        // Use a wrapper to call bootstrap safely
        const startBootstrap = async () => {
            try {
                await bootstrap(selectedSymbol, controller.signal);
            } catch (e) {
                if (e instanceof Error && e.name === 'AbortError') return;
                console.error("[LiveMarket] Bootstrap effect error:", e);
            }
        };
        
        startBootstrap();

        return () => {
            controller.abort();
        };
    }, [selectedSymbol, bootstrap, isStockRoute]);

    // SSE: Real-time updates
    useEffect(() => {
        if (!isStockRoute || !selectedSymbol) return;

        const eventSource = new EventSource(`/api/kis/stream?symbol=${selectedSymbol}`);

        eventSource.addEventListener("trade", (event: MessageEvent) => {
            try {
                const data = JSON.parse(event.data);
                const symbol = data.symbol;
                const price = data.price;
                let quoteToCache: StockQuote | null = null;
                const updatedAt = Date.now();

                setMarketStore(prev => {
                    const existing = prev[symbol] || {
                        symbol,
                        quote: null,
                        orderbook: null,
                        chart: [],
                        source: MarketState.CONNECTING,
                        lastUpdated: 0
                    };

                    const updatedQuote = existing.quote 
                        ? { ...existing.quote, price, change: data.change, changeRate: data.changeRate, volume: data.volume }
                        : { symbol, price, change: data.change, changeRate: data.changeRate, volume: data.volume, name: "", high: 0, low: 0, open: 0, timestamp: new Date().toISOString() } as StockQuote;
                    quoteToCache = updatedQuote;

                    let updatedChart = existing.chart;
                    // Always try to keep some history even if not selected, but only update active chart points for selected
                    if (symbol === selectedSymbol) {
                        const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                        updatedChart = [...existing.chart, { time, price }].slice(-50);
                    }

                    return {
                        ...prev,
                        [symbol]: {
                            ...existing,
                            quote: updatedQuote,
                            chart: updatedChart,
                            source: MarketState.LIVE, // Automatically recover to LIVE on any data
                            lastUpdated: updatedAt
                        }
                    };
                });

                writeCachedQuote(symbol, quoteToCache, updatedAt);
                lastUpdateTsRef.current = updatedAt;
            } catch (err) {
                console.error("Failed to parse trade SSE:", err);
            }
        });

        eventSource.addEventListener("index", (event: MessageEvent) => {
            try {
                const data = JSON.parse(event.data);
                const symbol = data.symbol; // "0001" or "1001"
                let quoteToCache: StockQuote | null = null;
                const updatedAt = Date.now();
                
                setMarketStore(prev => {
                    const existing = prev[symbol] || {
                        symbol,
                        quote: null,
                        orderbook: null,
                        chart: [],
                        source: MarketState.CONNECTING,
                        lastUpdated: 0
                    };

                    const updatedQuote = existing.quote 
                        ? { ...existing.quote, price: data.value, change: data.change, changeRate: data.changeRate }
                        : { symbol, price: data.value, change: data.change, changeRate: data.changeRate, name: "", high: 0, low: 0, open: 0, timestamp: new Date().toISOString() } as StockQuote;
                    quoteToCache = updatedQuote;

                    let updatedChart = existing.chart;
                    if (symbol === selectedSymbol) {
                        const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                        updatedChart = [...existing.chart, { time, price: data.value }].slice(-50);
                    }

                    return {
                        ...prev,
                        [symbol]: {
                            ...existing,
                            quote: updatedQuote,
                            chart: updatedChart,
                            source: MarketState.LIVE, // Recover indices too
                            lastUpdated: updatedAt
                        }
                    };
                });

                writeCachedQuote(symbol, quoteToCache, updatedAt);
                lastUpdateTsRef.current = updatedAt;
            } catch (err) {
                console.error("Failed to parse index SSE:", err);
            }
        });

        eventSource.addEventListener("ping", () => {
            lastUpdateTsRef.current = Date.now();
        });

        eventSource.addEventListener("status", () => {
            lastUpdateTsRef.current = Date.now();
        });

        eventSource.onerror = () => {
            lastUpdateTsRef.current = Date.now();
        };

        return () => {
            eventSource.close();
        };
    }, [selectedSymbol, isStockRoute]);

    // Stale detection timer
    useEffect(() => {
        if (!isStockRoute || !selectedSymbol) return;

        const checkStale = () => {
            const now = Date.now();
            if (lastUpdateTsRef.current === 0) return;
            
            // 전역 SSE 연결 건강성 확인 (ping 포함)
            const globalDiff = now - lastUpdateTsRef.current;

            setMarketStore(prev => {
                let hasChanges = false;
                const nextStore = { ...prev };

                for (const s in nextStore) {
                    const item = nextStore[s];
                    
                    // SSE 활성 구독 중인 심볼(현재 선택종목 + 지수)만 STALE 감시 대상
                    if (s !== selectedSymbol && s !== "0001" && s !== "1001") continue;
                    
                    // 정상/지연 상태 혹은 연결 중인 것들만 감시
                    if (item.source !== MarketState.LIVE && item.source !== MarketState.STALE && item.source !== MarketState.CONNECTING) continue;

                    let nextSource: MarketState = item.source;

                    // 거래가 없어도 ping이 오면 정상 연결로 간주
                    if (globalDiff > 45000) {      // 45초 이상 지연 - RECONNECTING
                        nextSource = MarketState.RECONNECTING;
                    } else if (globalDiff > 25000) { // 25초 이상 지연 - STALE
                        nextSource = MarketState.STALE;
                    } else if (item.source === MarketState.STALE || item.source === MarketState.CONNECTING) {
                        nextSource = MarketState.LIVE;
                    }

                    if (nextSource !== item.source) {
                        nextStore[s] = { ...item, source: nextSource };
                        hasChanges = true;
                    }
                }

                return hasChanges ? nextStore : prev;
            });
        };

        const timer = setInterval(checkStale, 2000);
        return () => clearInterval(timer);
    }, [selectedSymbol, isStockRoute]);

    const currentSymbolState = marketStore[selectedSymbol] || null;
    const indices = {
        kospi: marketStore["0001"] || null,
        kosdaq: marketStore["1001"] || null
    };

    return (
        <LiveMarketContext.Provider value={{
            selectedSymbol,
            marketStore,
            setSelectedSymbol,
            currentSymbolState,
            indices
        }}>
            {children}
        </LiveMarketContext.Provider>
    );
};

export const useLiveMarket = () => {
    const context = useContext(LiveMarketContext);
    if (context === undefined) {
        throw new Error("useLiveMarket must be used within a LiveMarketProvider");
    }
    return context;
};

export const useOptionalLiveMarket = () => {
    return useContext(LiveMarketContext) ?? null;
};
