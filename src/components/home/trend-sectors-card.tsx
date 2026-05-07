"use client";
import { useEffect, useState } from "react";
import { Layers, Cpu, Battery, FlaskConical, Layout, Landmark, Music, Car } from "lucide-react";

import { useHomeIntelligence } from "./home-intelligence-provider";
import { SECTOR_UNIVERSE } from "@/data/sectors/taxonomy";

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

export function TrendSectorsCard() {
  const { data, isLoading } = useHomeIntelligence();
  const sectors: any[] = data?.sectors || [];

  return (
    <div className="bg-white dark:bg-zinc-900 rounded-[24px] p-6 border shadow-sm flex flex-col h-full">
      <h3 className="font-bold text-lg text-slate-900 dark:text-zinc-50 mb-4 flex items-center gap-2">
        <Layers className="w-5 h-5 text-teal-500" />
        지금 주목받는 섹터
      </h3>
      <div className="flex flex-col gap-3">
        {sectors.map(sector => {
          const taxonomySector = SECTOR_UNIVERSE[sector.id];
          const iconKey = taxonomySector?.iconKey || "layers";
          const Icon = ICON_MAP[iconKey] || Layers;
          
          return (
            <div key={sector.id} className="bg-slate-50 dark:bg-zinc-950 p-3 rounded-xl border border-transparent hover:border-slate-200 transition-colors flex items-start gap-3">
              <div className="bg-white dark:bg-zinc-900 p-2 rounded-lg border border-slate-100 dark:border-zinc-800 shadow-sm mt-0.5">
                <Icon className="w-4 h-4 text-teal-600 dark:text-teal-400" />
              </div>
              <div>
                <div className="font-semibold text-sm text-slate-800 dark:text-zinc-200 mb-1">{sector.name}</div>
                <p className="text-xs text-slate-500 dark:text-zinc-400 line-clamp-1">{sector.description || sector.reason}</p>
              </div>
            </div>
          );
        })}
        {sectors.length === 0 && <div className="text-sm text-slate-400">불러오는 중...</div>}
      </div>
    </div>
  );
}
