"use client";

import { useState } from "react";
import { Search, ArrowRight, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import type { StockSearchItem } from "@/types/research";

export function SearchHeroCard() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<StockSearchItem[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const router = useRouter();

  const handleSearch = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setQuery(val);
    setFocusedIndex(-1); // 초기화
    
    if (val.trim().length < 1) {
      setResults([]);
      return;
    }

    setIsSearching(true);
    try {
      const res = await fetch(`/api/stocks/search?q=${encodeURIComponent(val)}`);
      const data = await res.json();
      if (data.ok) {
        setResults(data.results);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsSearching(false);
    }
  };

  const handleSelect = (symbol: string) => {
    router.push(`/stocks/${symbol}`);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (focusedIndex >= 0 && focusedIndex < results.length) {
      handleSelect(results[focusedIndex].symbol);
    } else if (results.length > 0) {
      handleSelect(results[0].symbol);
    } else if (query.trim().length > 0 && /^[A-Za-z0-9]+$/.test(query)) {
        handleSelect(query); // Fallback to raw query if it looks like a symbol
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setFocusedIndex(prev => (prev < results.length - 1 ? prev + 1 : prev));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setFocusedIndex(prev => (prev > 0 ? prev - 1 : prev));
    }
  };

  return (
    <div className="bg-white dark:bg-zinc-900 rounded-[24px] p-8 md:p-12 shadow-sm border flex flex-col items-center justify-center text-center min-h-[320px]">
      <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-slate-900 dark:text-zinc-50 mb-4">
        궁금한 종목의 AI 분석을<br className="md:hidden" /> 확인해보세요.
      </h1>
      <p className="text-slate-500 dark:text-zinc-400 mb-8 max-w-lg mx-auto">
        종목명이나 티커를 검색하고 최신 뉴스, 공시, 감성 점수와 더불어 내 평단가 기반 대응 가이드까지 받아보세요.
      </p>

      <form onSubmit={handleSubmit} className="w-full max-w-xl relative">
        <div className="relative flex items-center w-full">
          <Search className="absolute left-4 w-5 h-5 text-slate-400" />
          <input
            type="text"
            className="w-full h-14 pl-12 pr-32 rounded-2xl border-2 border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-950 focus:outline-none focus:border-indigo-500 dark:focus:border-indigo-500 transition-colors text-lg"
            placeholder="삼성전자 또는 005930"
            value={query}
            onChange={handleSearch}
            onKeyDown={handleKeyDown}
          />
          <div className="absolute right-2">
            <Button 
              type="submit" 
              className="rounded-xl h-10 px-4 bg-indigo-600 hover:bg-indigo-700 text-white font-medium shadow-none"
              disabled={query.trim().length === 0}
            >
              리포트 받기
              <ArrowRight className="ml-2 w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Search Results Dropdown */}
        {query.trim().length > 0 && (
          <div className="absolute top-full mt-2 w-full bg-white dark:bg-zinc-900 rounded-2xl border shadow-lg overflow-hidden z-20 text-left">
            {isSearching ? (
              <div className="p-6 flex items-center justify-center text-slate-500">
                <Loader2 className="w-5 h-5 animate-spin mr-2" />
                분석 대상을 찾는 중...
              </div>
            ) : results.length > 0 ? (
              <ul className="py-2">
                {results.map((item, idx) => (
                  <li key={item.symbol}>
                    <button
                      type="button"
                      className={`w-full text-left px-6 py-3 transition-colors flex items-center justify-between group ${
                        idx === focusedIndex 
                          ? "bg-slate-100 dark:bg-zinc-800 border-l-4 border-indigo-500 pl-5" 
                          : "hover:bg-slate-50 dark:hover:bg-zinc-800 border-l-4 border-transparent"
                      }`}
                      onClick={() => handleSelect(item.symbol)}
                      onMouseEnter={() => setFocusedIndex(idx)}
                    >
                      <div>
                        <span className="font-semibold text-slate-900 dark:text-zinc-100 mr-2">{item.name}</span>
                        <span className="text-sm text-slate-500">{item.symbol}</span>
                      </div>
                      <span className="text-xs bg-slate-100 dark:bg-zinc-800 text-slate-500 px-2 py-1 rounded opacity-100 transition-opacity">
                        {item.market || item.type}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="p-6 text-center text-slate-500">
                검색 결과가 없습니다.
              </div>
            )}
          </div>
        )}
      </form>
    </div>
  );
}
