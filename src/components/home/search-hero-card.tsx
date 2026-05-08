"use client";

import { useState, useEffect } from "react";
import { Search, ArrowRight, Loader2, Clock } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import type { StockSearchItem } from "@/types/research";
import { LocalStorageAdapter } from "@/lib/user-storage/local-adapter";
import type { RecentSearchItem } from "@/lib/user-storage/local-adapter";

export function SearchHeroCard() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<StockSearchItem[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const [recentSearches, setRecentSearches] = useState<RecentSearchItem[]>([]);
  const [isFocused, setIsFocused] = useState(false);
  const router = useRouter();

  useEffect(() => {
    setRecentSearches(LocalStorageAdapter.getAll().recentSearches);
  }, []);

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

  const handleSelect = (item: { symbol: string, name: string, type?: string }) => {
    LocalStorageAdapter.addRecentSearch(item);
    if (item.type === "sector" || item.symbol.startsWith("sec-")) {
      router.push(`/sectors/${item.symbol}`);
    } else {
      router.push(`/stocks/${item.symbol}`);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (focusedIndex >= 0 && focusedIndex < results.length) {
      handleSelect(results[focusedIndex]);
    } else if (results.length > 0) {
      handleSelect(results[0]);
    } else if (query.trim().length > 0 && /^[A-Za-z0-9-]+$/.test(query)) {
      handleSelect({ symbol: query, name: query }); // Fallback
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      setIsFocused(false);
      (e.currentTarget as HTMLInputElement).blur();
    } else if (e.key === "ArrowDown") {
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
            onFocus={() => setIsFocused(true)}
            onBlur={() => setTimeout(() => setIsFocused(false), 200)}
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
        {query.trim().length > 0 && isFocused && (
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
                      onClick={() => handleSelect(item)}
                      onMouseEnter={() => setFocusedIndex(idx)}
                    >
                      <div>
                        <span className="font-semibold text-slate-900 dark:text-zinc-100 mr-2">{item.name}</span>
                        <span className="text-sm text-slate-500">{item.symbol}</span>
                      </div>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded transition-opacity ${
                        item.type === "sector" 
                          ? "bg-purple-50 dark:bg-purple-900/20 text-purple-600 border border-purple-100" 
                          : "bg-slate-100 dark:bg-zinc-800 text-slate-500 border border-transparent"
                      }`}>
                        {item.market === "SECTOR" || item.type === "sector" ? "SECTOR" : (item.market || item.type)}
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
        
        {/* Recent Searches */}
        {query.trim().length === 0 && recentSearches.length > 0 && isFocused && (
          <div className="absolute top-full mt-2 w-full bg-white dark:bg-zinc-900 rounded-2xl border shadow-lg overflow-hidden z-20 text-left p-4">
             <div className="text-xs font-semibold text-slate-400 mb-3 flex items-center gap-1">
               <Clock className="w-3 h-3" />
               최근 검색
             </div>
             <div className="flex flex-wrap gap-2">
               {recentSearches.map(item => {
                 let s = item;
                 // backward compatibility with string
                 if (typeof item === "string") {
                   s = { symbol: item, name: item };
                 }
                 return (
                   <button 
                     key={s.symbol} 
                     type="button" 
                     onClick={() => handleSelect(s)}
                     className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-xs font-medium text-slate-600 dark:text-zinc-300 transition-colors flex items-center gap-1.5"
                   >
                     <span>{s.name}</span>
                     {s.name !== s.symbol && (
                       <span className="text-[10px] opacity-40 font-mono">{s.symbol}</span>
                     )}
                   </button>
                 );
               })}
             </div>
          </div>
        )}
      </form>
    </div>
  );
}
