"use client";
import { useEffect, useState } from "react";
import { Layers } from "lucide-react";

export function TrendSectorsCard() {
  const [sectors, setSectors] = useState<any[]>([]);

  useEffect(() => {
    fetch("/api/home/trending-sectors").then(r => r.json()).then(d => setSectors(d.sectors || []));
  }, []);

  return (
    <div className="bg-white dark:bg-zinc-900 rounded-[24px] p-6 border shadow-sm flex flex-col h-full">
      <h3 className="font-bold text-lg text-slate-900 dark:text-zinc-50 mb-4 flex items-center gap-2">
        <Layers className="w-5 h-5 text-teal-500" />
        지금 주목받는 섹터
      </h3>
      <div className="flex flex-col gap-3">
        {sectors.map(sector => (
          <div key={sector.id} className="bg-slate-50 dark:bg-zinc-950 p-3 rounded-xl border border-transparent hover:border-slate-200 transition-colors">
            <div className="font-semibold text-sm text-slate-800 dark:text-zinc-200 mb-1">{sector.name}</div>
            <p className="text-xs text-slate-500 dark:text-zinc-400 line-clamp-1">{sector.reason}</p>
          </div>
        ))}
        {sectors.length === 0 && <div className="text-sm text-slate-400">불러오는 중...</div>}
      </div>
    </div>
  );
}
