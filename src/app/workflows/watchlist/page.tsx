import { DashboardHeader } from "@/components/home/dashboard-header";
import { WatchlistResearchBoard } from "@/components/workflows/watchlist-research-board";

export default function WatchlistResearchPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <DashboardHeader />
      
      <main className="container mx-auto px-4 lg:px-8 py-8 md:py-12 max-w-5xl">
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <span className="bg-indigo-100 text-indigo-800 text-xs px-2 py-1 rounded font-bold dark:bg-indigo-900/40 dark:text-indigo-400">
              Saved Workflow
            </span>
          </div>
          <h1 className="text-3xl md:text-4xl font-bold text-slate-900 dark:text-zinc-50 mb-2">
            관심 종목 리서치 모아보기
          </h1>
          <p className="text-slate-600 dark:text-zinc-400 text-lg">
            저장하신 관심 종목들의 최신 AI 리서치 요약과 감성 동향을 한눈에 확인하세요.
          </p>
        </div>
        
        <WatchlistResearchBoard />
      </main>
    </div>
  );
}
