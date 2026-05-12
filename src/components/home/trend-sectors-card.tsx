"use client";
import { Layers, Cpu, Battery, FlaskConical, Layout, Landmark, Music, Car } from "lucide-react";
import Link from "next/link";

import { useHomeIntelligence } from "./home-intelligence-provider";
import { getSectorById } from "@/data/sectors/taxonomy";
import { getStockName } from "@/lib/stocks/metadata";

const ICON_MAP: Record<string, React.ElementType> = {
  cpu: Cpu,
  battery: Battery,
  flask: FlaskConical,
  layout: Layout,
  landmark: Landmark,
  music: Music,
  car: Car,
  layers: Layers
};

function SectorsSkeleton() {
  return (
    <div className="flex flex-col gap-3 animate-pulse">
      {[1, 2, 3].map(i => (
        <div key={i} className="bg-slate-50 dark:bg-zinc-950 p-3 rounded-xl flex items-start gap-3">
          <div className="w-8 h-8 bg-slate-100 dark:bg-zinc-800 rounded-lg flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <div className="w-24 h-4 bg-slate-100 dark:bg-zinc-800 rounded mb-2" />
            <div className="w-full h-3 bg-slate-50 dark:bg-zinc-800/60 rounded" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function TrendSectorsCard() {
  const { data, isLoading, error } = useHomeIntelligence();
  const sectors: any[] = data?.trendingSectors ?? data?.sectors ?? [];
  const validSectors = sectors.filter(sector => getSectorById(sector.sectorId || sector.id));

  return (
    <div className="bg-white dark:bg-zinc-900 rounded-[24px] p-6 border shadow-sm flex flex-col h-full">
      <h3 className="font-bold text-lg text-slate-900 dark:text-zinc-50 mb-4 flex items-center gap-2">
        <Layers className="w-5 h-5 text-teal-500" />
        지금 주목받는 섹터
      </h3>
      <div className="flex flex-col gap-3 flex-1">
        {isLoading ? (
          <SectorsSkeleton />
        ) : error ? (
          <div className="text-sm text-slate-400 italic">데이터를 불러오지 못했습니다.</div>
        ) : validSectors.length === 0 ? (
          <div className="text-sm text-slate-400 italic">현재 주목받는 섹터가 없습니다.</div>
        ) : (
          validSectors.map(sector => {
            const sectorId = sector.sectorId || sector.id;
            const taxonomySector = getSectorById(sectorId);
            if (!taxonomySector) return null;
            const iconKey = taxonomySector?.iconKey || "layers";
            const Icon = ICON_MAP[iconKey] || Layers;
            const representatives = (sector.representativeSymbols || taxonomySector.representativeSymbols || [])
              .filter((symbol: string) => taxonomySector.memberSymbols.includes(symbol))
              .slice(0, 3);

            return (
              <Link
                href={`/sectors/${taxonomySector.sectorId}`}
                key={taxonomySector.sectorId}
                className="bg-slate-50 dark:bg-zinc-950 p-3 rounded-xl border border-transparent hover:border-slate-200 dark:hover:border-zinc-800 transition-colors flex items-start gap-3 group"
              >
                <div className="bg-white dark:bg-zinc-900 p-2 rounded-lg border border-slate-100 dark:border-zinc-800 shadow-sm mt-0.5 group-hover:border-teal-200 transition-colors">
                  <Icon className="w-4 h-4 text-teal-600 dark:text-teal-400 group-hover:scale-110 transition-transform" />
                </div>
                <div>
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <div className="font-semibold text-sm text-slate-800 dark:text-zinc-200 group-hover:text-teal-600 transition-colors">
                      {taxonomySector.name}
                    </div>
                    {sector.sourceCount ? (
                      <span className="shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-teal-50 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300">
                        근거 {sector.sourceCount}건
                      </span>
                    ) : null}
                  </div>
                  <p className="text-xs text-slate-600 dark:text-zinc-400 leading-relaxed line-clamp-2">{sector.whyNow || sector.description || sector.reason}</p>
                  {representatives.length > 0 && (
                    <div className="mt-2">
                      <div className="text-[10px] font-semibold text-slate-400 dark:text-zinc-500 mb-1">주도주</div>
                      <div className="flex gap-1 flex-wrap">
                        {representatives.map((symbol: string) => (
                          <span key={symbol} className="text-[10px] px-1.5 py-0.5 bg-teal-50 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300 rounded">
                            {getStockName(symbol)}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </Link>
            );
          })
        )}
      </div>
      <div className="mt-4 pt-3 border-t border-slate-100 dark:border-zinc-800 text-[10px] text-slate-400 text-center">
        * 제공되는 정보는 투자 참고용이며 원금 손실 위험이 있습니다.
      </div>
    </div>
  );
}
