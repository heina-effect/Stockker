"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { StockQuote, Orderbook, MarketIndex, PricePoint } from "@/types/stock";
import { MOCK_WATCHLIST, MOCK_MARKET_INDICES, generateMockOrderbook, generateMockChartData } from "@/lib/mock/market";

interface MockLiveContextType {
  watchlist: StockQuote[];
  selectedStock: StockQuote;
  orderbook: Orderbook;
  marketIndices: MarketIndex[];
  chartData: PricePoint[];
  lastUpdated: Date;
  isConnected: boolean;
}

const MockLiveContext = createContext<MockLiveContextType | undefined>(undefined);

export const MockLiveProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [watchlist, setWatchlist] = useState<StockQuote[]>(MOCK_WATCHLIST);
  const [selectedStock, setSelectedStock] = useState<StockQuote>(MOCK_WATCHLIST[0]);
  const [orderbook, setOrderbook] = useState<Orderbook>(generateMockOrderbook(MOCK_WATCHLIST[0].symbol, MOCK_WATCHLIST[0].price));
  const [marketIndices, setMarketIndices] = useState<MarketIndex[]>(MOCK_MARKET_INDICES);
  const [chartData, setChartData] = useState<PricePoint[]>(generateMockChartData(MOCK_WATCHLIST[0].price));
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [isConnected, setIsConnected] = useState(true);

  useEffect(() => {
    const interval = setInterval(() => {
      // 1. 관심종목 가격 랜덤 변동
      setWatchlist((prev) =>
        prev.map((stock) => {
          const changeAmount = (Math.random() - 0.5) * 200;
          const newPrice = Math.max(100, Math.floor(stock.price + changeAmount));
          const basePrice = stock.price - stock.change; // 전일 종가 가정
          const newChange = newPrice - basePrice;
          const newChangeRate = (newChange / basePrice) * 100;

          return {
            ...stock,
            price: newPrice,
            change: newChange,
            changeRate: newChangeRate,
            timestamp: new Date().toISOString(),
          };
        })
      );

      // 2. 선택된 종목의 호가 및 차트 업데이트
      setWatchlist((currentWatchlist) => {
        const updatedSelected = currentWatchlist.find((s) => s.symbol === selectedStock.symbol);
        if (updatedSelected) {
          setSelectedStock(updatedSelected);
          setOrderbook(generateMockOrderbook(updatedSelected.symbol, updatedSelected.price));
          setChartData((prevChart) => {
            const lastPoint = prevChart[prevChart.length - 1];
            const newPoint = {
              time: new Date().toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" }),
              price: updatedSelected.price,
            };
            // 마지막 포인트와 시간이 같으면 교체, 다르면 추가 (최대 30개 유지)
            if (lastPoint && lastPoint.time === newPoint.time) {
                return [...prevChart.slice(0, -1), newPoint];
            }
            return [...prevChart.slice(1), newPoint];
          });
        }
        return currentWatchlist;
      });

      // 3. 시장 지수 업데이트
      setMarketIndices((prev) =>
        prev.map((idx) => ({
          ...idx,
          value: idx.value + (Math.random() - 0.5) * 5,
        }))
      );

      setLastUpdated(new Date());
    }, 2000);

    return () => clearInterval(interval);
  }, [selectedStock.symbol]);

  return (
    <MockLiveContext.Provider
      value={{
        watchlist,
        selectedStock,
        orderbook,
        marketIndices,
        chartData,
        lastUpdated,
        isConnected,
      }}
    >
      {children}
    </MockLiveContext.Provider>
  );
};

export const useMockLive = () => {
  const context = useContext(MockLiveContext);
  if (context === undefined) {
    throw new Error("useMockLive must be used within a MockLiveProvider");
  }
  return context;
};
