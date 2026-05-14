import { DashboardHeader } from "@/components/home/dashboard-header";
import { StockReportHeader } from "@/components/report/stock-report-header";
import { DailyCandlestickChartCard } from "@/components/report/daily-candlestick-chart-card";
import { SentimentScoreCard } from "@/components/report/sentiment-score-card";
import { BuyPricePlanCard } from "@/components/report/buy-price-plan-card";
import { IssueTimelineCard } from "@/components/report/issue-timeline-card";
import { RelatedStocksCard } from "@/components/report/related-stocks-card";
import { SourceListCard } from "@/components/report/source-list-card";
import { AnalystOpinionCard } from "@/components/report/analyst-opinion-card";
import { isUnsupportedStockSymbol } from "@/lib/stocks/listing-status";
import { notFound } from "next/navigation";

interface ReportPageProps {
  params: Promise<{ symbol: string }>;
}

export default async function StockReportPage({ params }: ReportPageProps) {
  const symbol = (await params).symbol;
  if (isUnsupportedStockSymbol(symbol)) notFound();

  return (
    <div className="min-h-screen bg-background text-foreground">
      <DashboardHeader />
      
      <main className="container mx-auto px-4 lg:px-8 py-8 md:py-12 max-w-7xl">
        <StockReportHeader symbol={symbol} />
        
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mt-6 items-start">
          <div className="lg:col-span-8">
            <DailyCandlestickChartCard symbol={symbol} />
          </div>

          <div className="lg:col-span-4 flex flex-col gap-6">
            <SentimentScoreCard symbol={symbol} />
            <AnalystOpinionCard symbol={symbol} />
          </div>

          <div className="lg:col-span-7">
            <IssueTimelineCard symbol={symbol} />
          </div>

          <div className="lg:col-span-5 flex flex-col gap-6">
            <RelatedStocksCard symbol={symbol} />
            <SourceListCard symbol={symbol} />
          </div>

          <div className="lg:col-span-12">
            <BuyPricePlanCard symbol={symbol} />
          </div>
        </div>
      </main>
      
      <footer className="py-8 mt-12 text-center text-xs text-slate-400 dark:text-zinc-500">
        <p>&copy; 2026 Stockker Project - AI Research Edition</p>
      </footer>
    </div>
  );
}
