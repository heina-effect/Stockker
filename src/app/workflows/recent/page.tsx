import { DashboardHeader } from "@/components/home/dashboard-header";
import { RecentResearchBoard } from "@/components/workflows/recent-research-board";

export default function RecentResearchPage() {
  return (
    <div className="min-h-screen bg-[#F2F4F6] dark:bg-zinc-950">
      <DashboardHeader />
      
      <main className="container mx-auto px-4 lg:px-8 py-8 md:py-12 max-w-5xl">
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <span className="bg-amber-100 text-amber-800 text-xs px-2 py-1 rounded font-bold dark:bg-amber-900/40 dark:text-amber-400">
              Saved Workflow
            </span>
          </div>
          <h1 className="text-3xl md:text-4xl font-bold text-slate-900 dark:text-zinc-50 mb-2">
            최근 본 종목 히스토리
          </h1>
          <p className="text-slate-600 dark:text-zinc-400 text-lg">
            최근 조회하신 종목들의 변경된 핵심 이슈와 감성 동향을 빠르게 팔로우업 하세요.
          </p>
        </div>
        
        <RecentResearchBoard />
      </main>
    </div>
  );
}
