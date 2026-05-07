import { DashboardHeader } from "@/components/home/dashboard-header";
import { SearchHeroCard } from "@/components/home/search-hero-card";
import { WatchlistAsideCard } from "@/components/home/watchlist-aside-card";
import { TrendIssuesCard } from "@/components/home/trend-issues-card";
import { TrendStocksCard } from "@/components/home/trend-stocks-card";
import { TrendSectorsCard } from "@/components/home/trend-sectors-card";
import { AIPicksCard } from "@/components/home/ai-picks-card";
import { HomeIntelligenceProvider } from "@/components/home/home-intelligence-provider";

export default function HomePage() {
  return (
    <div className="min-h-screen bg-[#F2F4F6] dark:bg-zinc-950">
      <DashboardHeader />
      
      <main className="container mx-auto px-4 lg:px-8 py-8 md:py-12 max-w-7xl">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12">
          
          {/* Left Column: Main Research Search and Preview */}
          <div className="lg:col-span-8 flex flex-col gap-8">
            <SearchHeroCard />
            
            <HomeIntelligenceProvider>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <TrendIssuesCard />
                <TrendStocksCard />
                <TrendSectorsCard />
                <AIPicksCard />
              </div>
            </HomeIntelligenceProvider>
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
