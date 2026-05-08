import { DashboardHeader } from "@/components/home/dashboard-header";
import { SECTOR_UNIVERSE } from "@/data/sectors/taxonomy";
import { getStockName } from "@/lib/stocks/metadata";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getSectorSnapshot, generateSectorSnapshot } from "@/server/research/snapshots/sector-snapshot-manager";

interface SectorPageProps {
  params: Promise<{ sectorId: string }>;
}

export default async function SectorReportPage({ params }: SectorPageProps) {
  const sectorId = (await params).sectorId;
  const sector = SECTOR_UNIVERSE[sectorId];

  if (!sector) {
    notFound();
  }

  let snapshot = await getSectorSnapshot(sectorId);
  if (!snapshot) {
    snapshot = await generateSectorSnapshot(sectorId);
  }

  return (
    <div className="min-h-screen bg-[#F2F4F6] dark:bg-zinc-950">
      <DashboardHeader />
      
      <main className="container mx-auto px-4 lg:px-8 py-8 md:py-12 max-w-5xl">
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <span className="bg-teal-100 text-teal-800 text-xs px-2 py-1 rounded font-bold dark:bg-teal-900/40 dark:text-teal-400">
              Sector / Theme
            </span>
          </div>
          <h1 className="text-3xl md:text-4xl font-bold text-slate-900 dark:text-zinc-50 mb-2">
            {sector.name}
          </h1>
          <p className="text-slate-600 dark:text-zinc-400 text-lg">
            {sector.description}
          </p>
        </div>
        
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-8 flex flex-col gap-6">
            <div className="bg-white dark:bg-zinc-900 rounded-[24px] p-6 shadow-sm border">
              <h3 className="font-bold text-slate-900 dark:text-zinc-50 mb-4">대표 종목</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {sector.memberSymbols.map(sym => (
                  <Link key={sym} href={`/stocks/${sym}`} className="flex items-center justify-between p-4 bg-slate-50 dark:bg-zinc-950 border border-slate-100 dark:border-zinc-800 hover:border-indigo-200 rounded-xl transition-colors">
                    <div className="font-semibold">{getStockName(sym)}</div>
                    <div className="text-xs text-slate-500 font-mono">{sym}</div>
                  </Link>
                ))}
              </div>
            </div>

            <div className="bg-white dark:bg-zinc-900 rounded-[24px] p-6 shadow-sm border">
               <div className="flex items-center justify-between mb-4">
                 <h3 className="font-bold text-slate-900 dark:text-zinc-50">AI 섹터 동향 요약</h3>
                 {snapshot && (
                   <span className="text-xs px-2 py-1 bg-slate-100 dark:bg-zinc-800 rounded text-slate-600 dark:text-zinc-400">
                     모멘텀 강도: {snapshot.trend_strength}/100
                   </span>
                 )}
               </div>
               <div className="p-4 bg-indigo-50/50 dark:bg-indigo-950/20 rounded-xl border border-indigo-100 dark:border-indigo-900/50 mb-6">
                 <p className="text-sm text-slate-700 dark:text-zinc-300">
                   {snapshot ? snapshot.ai_summary : "해당 섹터에 대한 실시간 이슈 분석 및 AI 요약 정보가 준비 중입니다."}
                 </p>
               </div>
               
               {snapshot && snapshot.related_issues.length > 0 && (
                 <div>
                   <h4 className="font-bold text-sm text-slate-800 dark:text-zinc-200 mb-3">주요 연관 이슈</h4>
                   <div className="flex flex-col gap-3">
                     {snapshot.related_issues.map((issue: any) => (
                       <div key={issue.id} className="p-3 bg-slate-50 dark:bg-zinc-950 border border-slate-100 dark:border-zinc-800 rounded-lg">
                         <div className="font-semibold text-sm mb-1">{issue.title}</div>
                         <div className="text-xs text-slate-500 line-clamp-2">{issue.summary}</div>
                         <div className="text-[10px] text-slate-400 mt-2">{issue.representativeSource}</div>
                       </div>
                     ))}
                   </div>
                 </div>
               )}
            </div>
          </div>
          
          <div className="lg:col-span-4 flex flex-col gap-6">
             {/* Recommendation Disclaimer */}
             <div className="bg-slate-50 dark:bg-zinc-900 rounded-[24px] p-6 border text-xs text-slate-500 text-center leading-relaxed">
               본 섹터 정보 및 관련 종목 데이터는 정보 제공을 목적으로 하며, 투자 수익이나 원금을 보장하지 않습니다. 
               <br/><br/>
               투자 판단에 대한 책임은 전적으로 이용자 본인에게 있습니다.
             </div>
          </div>
        </div>
      </main>
    </div>
  );
}
