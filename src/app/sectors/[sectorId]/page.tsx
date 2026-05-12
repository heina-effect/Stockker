import { DashboardHeader } from "@/components/home/dashboard-header";
import { SectorAISection } from "@/components/sectors/sector-ai-section";
import { SECTOR_UNIVERSE } from "@/data/sectors/taxonomy";
import { getStockName } from "@/lib/stocks/metadata";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getSectorSnapshot } from "@/server/research/snapshots/sector-snapshot-manager";

interface SectorPageProps {
  params: Promise<{ sectorId: string }>;
}

export default async function SectorReportPage({ params }: SectorPageProps) {
  const sectorId = (await params).sectorId;
  const sector = SECTOR_UNIVERSE[sectorId];

  if (!sector) {
    notFound();
  }

  // Fast DB check only — never blocks SSR waiting for generation
  const snapshot = await getSectorSnapshot(sectorId);

  return (
    <div className="min-h-screen bg-[#F2F4F6] dark:bg-zinc-950">
      <DashboardHeader />

      <main className="container mx-auto px-4 lg:px-8 py-8 md:py-12 max-w-5xl">
        {/* Shell: always renders immediately */}
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
            {/* Representative stocks — synchronous, always shown */}
            <div className="bg-white dark:bg-zinc-900 rounded-[24px] p-6 shadow-sm border">
              <h3 className="font-bold text-slate-900 dark:text-zinc-50 mb-4">대표 종목</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {sector.memberSymbols.map(sym => (
                  <Link
                    key={sym}
                    href={`/stocks/${sym}`}
                    className="flex items-center justify-between p-4 bg-slate-50 dark:bg-zinc-950 border border-slate-100 dark:border-zinc-800 hover:border-indigo-200 rounded-xl transition-colors"
                  >
                    <div className="font-semibold">{getStockName(sym)}</div>
                    <div className="text-xs text-slate-500 font-mono">{sym}</div>
                  </Link>
                ))}
              </div>
            </div>

            {/* AI section — non-blocking: shows stale snapshot or loads async */}
            <SectorAISection snapshot={snapshot} sectorId={sectorId} />
          </div>

          <div className="lg:col-span-4 flex flex-col gap-6">
            <div className="bg-slate-50 dark:bg-zinc-900 rounded-[24px] p-6 border text-xs text-slate-500 text-center leading-relaxed">
              본 섹터 정보 및 관련 종목 데이터는 정보 제공을 목적으로 하며, 투자 수익이나 원금을 보장하지 않습니다.
              <br /><br />
              투자 판단에 대한 책임은 전적으로 이용자 본인에게 있습니다.
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
