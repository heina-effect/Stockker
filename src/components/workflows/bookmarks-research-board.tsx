"use client";
import { useEffect, useState } from "react";
import { LocalStorageAdapter } from "@/lib/user-storage/local-adapter";
import { getStockName } from "@/lib/stocks/metadata";
import Link from "next/link";
import { Bookmark, Calendar } from "lucide-react";

export function BookmarksResearchBoard() {
  const [bookmarks, setBookmarks] = useState<string[]>([]);
  const [data, setData] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const list = LocalStorageAdapter.getAll().bookmarkedReports || [];
    setBookmarks(list);

    if (list.length === 0) {
      setLoading(false);
      return;
    }

    async function fetchAll() {
      const results: Record<string, any> = {};
      for (const symbol of list) {
        try {
          const res = await fetch(`/api/stocks/${symbol}/sentiment`);
          if (res.ok) {
            results[symbol] = await res.json();
          }
        } catch (e) {
          console.error(e);
        }
      }
      setData(results);
      setLoading(false);
    }

    fetchAll();
  }, []);

  if (loading) {
    return <div className="text-center py-20 text-slate-500">데이터를 불러오는 중입니다...</div>;
  }

  if (bookmarks.length === 0) {
    return (
      <div className="text-center py-20 bg-white dark:bg-zinc-900 rounded-[24px] border shadow-sm px-8">
        <Bookmark className="w-12 h-12 text-slate-300 mx-auto mb-4" />
        <p className="text-slate-700 dark:text-zinc-300 font-semibold mb-2">북마크한 리포트가 없습니다.</p>
        <p className="text-sm text-slate-400 dark:text-zinc-500">
          종목 상세 페이지 우측 상단의 북마크 아이콘을 눌러<br />
          나중에 다시 확인하고 싶은 리서치를 저장하세요.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {bookmarks.map((sym: string) => {
        const item = data[sym];
        return (
          <Link href={`/stocks/${sym}`} key={sym} className="block bg-white dark:bg-zinc-900 rounded-[24px] p-6 border shadow-sm hover:border-emerald-200 transition-colors">
            <div className="flex justify-between items-start mb-4">
              <div>
                <h3 className="font-bold text-lg text-slate-900 dark:text-zinc-50">{getStockName(sym)}</h3>
                <span className="text-xs text-slate-500 font-mono">{sym}</span>
              </div>
              <Bookmark className="w-5 h-5 text-emerald-500 fill-emerald-500" />
            </div>
            {item ? (
              <div className="text-sm text-slate-600 dark:text-zinc-400 line-clamp-3 leading-relaxed">
                {item.positiveFactors[0] || item.negativeFactors[0] || "요약 정보가 없습니다."}
              </div>
            ) : (
              <div className="text-sm text-slate-400">데이터 없음</div>
            )}
            <div className="mt-4 flex items-center gap-1 text-[10px] text-slate-400">
              <Calendar className="w-3 h-3" />
              <span>저장된 리포트</span>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
