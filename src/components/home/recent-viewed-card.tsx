"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getStockName } from "@/lib/stocks/metadata";
import { getCanonicalSectorForSymbol } from "@/lib/stocks/sector-utils";
import { LocalStorageAdapter } from "@/lib/user-storage/local-adapter";
import { USER_STORAGE_EVENT } from "@/lib/user-storage/events";
import { SurfaceCard } from "@/components/common/surface-card";

/**
 * 홈 오른쪽 열의 최근 조회 종목. 종목 상세 진입 때 stock-report-header가 기록하는
 * recentViewed(최대 10개)를 그대로 보여 준다. 시세는 붙이지 않는다 — 붙이려면 종목마다
 * /api/watchlist/summary(시세·투자의견·이슈·AI 요약)를 불러야 해서 호출이 크게 는다.
 */
export function RecentViewedCard() {
  const [recent, setRecent] = useState<string[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const sync = () => setRecent(LocalStorageAdapter.getAll().recentViewed);
    sync();
    window.addEventListener(USER_STORAGE_EVENT, sync);
    window.addEventListener("storage", sync);
    setMounted(true);
    return () => {
      window.removeEventListener(USER_STORAGE_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  if (!mounted) {
    return <SurfaceCard className="min-h-40 animate-pulse" />;
  }

  return (
    <SurfaceCard>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-bold text-lg text-slate-900 dark:text-zinc-50">최근 조회 종목</h2>
        {recent.length > 0 && (
          <Link href="/workflows/recent" className="text-xs text-indigo-500 hover:text-indigo-700 font-medium">
            모아보기 &raquo;
          </Link>
        )}
      </div>

      {recent.length === 0 ? (
        <div className="flex items-center justify-center h-20 text-sm text-slate-400 dark:text-zinc-500">
          최근 조회한 종목이 없습니다.
        </div>
      ) : (
        <ul className="flex flex-col gap-1">
          {recent.map((symbol) => {
            const sector = getCanonicalSectorForSymbol(symbol)?.name;
            // 종목 사전에 없는 코드는 getStockName이 코드를 그대로 돌려준다 — 코드를 두 번 쓰지 않는다
            const name = getStockName(symbol);
            return (
              <li key={symbol}>
                <Link
                  href={`/stocks/${symbol}`}
                  className="flex items-center justify-between gap-3 rounded-2xl px-3 py-2 hover:bg-slate-50 dark:hover:bg-zinc-950 transition-colors group"
                >
                  <span className="flex min-w-0 items-baseline gap-2">
                    <span className="truncate text-sm font-semibold text-slate-900 dark:text-zinc-100 group-hover:text-indigo-600 transition-colors">
                      {name}
                    </span>
                    {name !== symbol && (
                      <span className="shrink-0 text-[10px] font-mono text-slate-400 dark:text-zinc-500">{symbol}</span>
                    )}
                  </span>
                  {sector && (
                    <span className="shrink-0 text-xs text-slate-500 dark:text-zinc-400">{sector}</span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </SurfaceCard>
  );
}
