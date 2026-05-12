import { DashboardHeader } from "@/components/home/dashboard-header";
import { BookmarksResearchBoard } from "@/components/workflows/bookmarks-research-board";

export default function BookmarksResearchPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <DashboardHeader />
      
      <main className="container mx-auto px-4 lg:px-8 py-8 md:py-12 max-w-5xl">
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <span className="bg-emerald-100 text-emerald-800 text-xs px-2 py-1 rounded font-bold dark:bg-emerald-900/40 dark:text-emerald-400">
              Saved Workflow
            </span>
          </div>
          <h1 className="text-3xl md:text-4xl font-bold text-slate-900 dark:text-zinc-50 mb-2">
            북마크 리포트 읽기
          </h1>
          <p className="text-slate-600 dark:text-zinc-400 text-lg">
            나중에 읽기 위해 북마크한 리서치 리포트들을 확인하세요.
          </p>
        </div>
        
        <BookmarksResearchBoard />
      </main>
    </div>
  );
}
