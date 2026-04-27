import { DashboardHeader } from "@/components/home/dashboard-header";
import { SearchHeroCard } from "@/components/home/search-hero-card";
import { WatchlistAsideCard } from "@/components/home/watchlist-aside-card";
import { CategoryPreviewCard } from "@/components/home/category-preview-card";

export default function HomePage() {
  return (
    <div className="min-h-screen bg-[#F2F4F6] dark:bg-zinc-950">
      <DashboardHeader />
      
      <main className="container mx-auto px-4 lg:px-8 py-8 md:py-12 max-w-7xl">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12">
          
          {/* Left Column: Main Research Search and Preview */}
          <div className="lg:col-span-8 flex flex-col gap-8">
            <SearchHeroCard />
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <CategoryPreviewCard 
                title="지금 주목받는 종목" 
                description="최근 24시간 동안 AI가 가장 긍정적으로 분석한 종목들을 확인하세요."
                icon="trending"
              />
              <CategoryPreviewCard 
                title="실시간 핵심 이슈" 
                description="시장을 움직이는 핵심 뉴스와 공시, SNS 반응을 실시간으로 추적합니다."
                icon="news"
              />
            </div>
          </div>
          
          {/* Right Column: Watchlist Overview */}
          <div className="lg:col-span-4">
            <WatchlistAsideCard />
          </div>
        </div>
      </main>
      
      <footer className="py-8 mt-12 text-center text-xs text-slate-400 dark:text-zinc-500">
        <p>&copy; 2026 Stockker Project - AI Research Edition</p>
        <p className="mt-2 text-[10px] text-slate-300 dark:text-zinc-600">본 서비스의 정보는 AI 모킹 스텁 데이터이며 투자 권유를 구하지 않습니다.</p>
      </footer>
    </div>
  );
}
