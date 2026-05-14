import { DashboardHeader } from "@/components/home/dashboard-header";
import { SectorAISection } from "@/components/sectors/sector-ai-section";
import { SectorMarketSignalCard } from "@/components/sectors/sector-market-signal-card";
import { SECTOR_UNIVERSE } from "@/data/sectors/taxonomy";
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
    <div className="min-h-screen bg-background text-foreground">
      <DashboardHeader />

      <main className="container mx-auto px-4 lg:px-8 py-8 md:py-12 max-w-5xl">
        {/* 섹터 헤더 쉘: 항상 즉시 렌더링 */}
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-2">
            <span className="bg-teal-100 dark:bg-teal-900/40 text-teal-800 dark:text-teal-400 text-xs px-2 py-1 rounded font-bold">
              섹터 분석
            </span>
          </div>
          <h1 className="text-3xl md:text-4xl font-bold text-slate-900 dark:text-zinc-50 mb-2">
            {sector.name}
          </h1>
          <p className="text-slate-600 dark:text-zinc-400 text-base leading-relaxed max-w-2xl">
            {sector.description}
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-8 flex flex-col gap-6">

            {/* AI 섹션: 비블로킹 — 스냅샷 있으면 즉시, 없으면 클라이언트에서 비동기 로드 */}
            {/* 주도주 정보를 AI 섹션이 포함하므로, 별도 대표 종목 섹션은 제거 */}
            <SectorAISection snapshot={snapshot} sectorId={sectorId} sector={sector} />

          </div>

          <div className="lg:col-span-4 flex flex-col gap-4">
            <SectorMarketSignalCard sectorId={sectorId} watchCandidates={snapshot?.watch_candidates ?? []} />

            <div className="bg-slate-50 dark:bg-zinc-900 rounded-[24px] p-5 border border-slate-100 dark:border-zinc-800 text-xs text-slate-500 dark:text-zinc-500 text-center leading-relaxed">
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
