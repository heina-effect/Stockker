"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { DashboardHeader } from "@/components/home/dashboard-header";
import { 
  ShieldAlert, 
  TrendingUp, 
  Activity, 
  CheckCircle2, 
  XCircle, 
  Flame, 
  Info,
  Calendar
} from "lucide-react";
import Link from "next/link";

interface KosdaqState {
  value: number;
  maState: {
    ma5: number;
    ma20: number;
    ma60: number;
    ma120: number;
  };
  reduceWeight: boolean;
}

interface ScreeningStock {
  symbol: string;
  name: string;
  price: number;
  changeRate: number;
  classification: "normal" | "aggressive" | "exclude";
  weightSuggestion?: number;
  reasons: string[];
  metrics?: {
    volumeRatio: number;
    tailRatio: number;
    freshnessCount: number;
  };
}

interface OvernightResponse {
  ok: boolean;
  kosdaqState: KosdaqState;
  results: {
    normal: ScreeningStock[];
    aggressive: ScreeningStock[];
    exclude: ScreeningStock[];
  };
  generatedAt: string;
  disclaimer: string;
}

function OvernightScreeningContent() {
  const searchParams = useSearchParams();
  const defaultTab = searchParams.get("tab") as "normal" | "aggressive" | "exclude" || "normal";
  
  const [activeTab, setActiveTab] = useState<"normal" | "aggressive" | "exclude">(defaultTab);
  const [data, setData] = useState<OvernightResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    async function fetchScreening() {
      try {
        const res = await fetch("/api/screening/overnight");
        if (!res.ok) throw new Error("Failed to fetch overnight data");
        const json = await res.json();
        setData(json);
      } catch (err) {
        console.error(err);
        setError(true);
      } finally {
        setLoading(false);
      }
    }
    fetchScreening();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-background text-foreground">
        <DashboardHeader />
        <main className="container mx-auto px-4 lg:px-8 py-8 md:py-12 max-w-7xl animate-pulse">
          <div className="h-8 w-64 bg-slate-200 dark:bg-zinc-800 rounded mb-6" />
          <div className="h-24 bg-slate-100 dark:bg-zinc-800/50 rounded-2xl mb-8" />
          <div className="flex gap-2 mb-6">
            <div className="h-10 w-32 bg-slate-200 dark:bg-zinc-800 rounded-lg" />
            <div className="h-10 w-32 bg-slate-200 dark:bg-zinc-800 rounded-lg" />
            <div className="h-10 w-32 bg-slate-200 dark:bg-zinc-800 rounded-lg" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="h-40 bg-slate-50 dark:bg-zinc-950 rounded-2xl" />
            <div className="h-40 bg-slate-50 dark:bg-zinc-950 rounded-2xl" />
          </div>
        </main>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-background text-foreground flex flex-col">
        <DashboardHeader />
        <main className="flex-1 container mx-auto px-4 py-12 flex flex-col items-center justify-center text-slate-400 dark:text-zinc-500">
          <XCircle className="w-12 h-12 mb-4 text-red-500" />
          <h2 className="text-xl font-bold mb-2">오류 발생</h2>
          <p className="text-sm mb-4">데이터를 불러오는 중 문제가 발생했습니다.</p>
          <button 
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm transition-colors"
          >
            다시 시도
          </button>
        </main>
      </div>
    );
  }

  const { kosdaqState, results, generatedAt, disclaimer } = data;
  const currentStocks = results[activeTab];

  const dateStr = generatedAt 
    ? new Date(generatedAt).toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" })
    : "";
  const timeStr = generatedAt 
    ? new Date(generatedAt).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" }) 
    : "";

  return (
    <div className="min-h-screen bg-background text-foreground">
      <DashboardHeader />
      
      <main className="container mx-auto px-4 lg:px-8 py-8 md:py-12 max-w-7xl">
        {/* Header Section */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-zinc-50">
              오버나이트 스크리닝 리포트
            </h1>
            <p className="text-sm text-slate-500 dark:text-zinc-400 mt-2 flex items-center gap-1.5">
              <Calendar className="w-4 h-4" />
              {dateStr} {timeStr} 분석 기준
            </p>
          </div>
          
          {/* 청산 가이드 팝오버/정보 */}
          <div className="bg-indigo-50/50 dark:bg-indigo-950/10 border border-indigo-100 dark:border-indigo-900/30 p-3 rounded-xl max-w-md">
            <h4 className="text-xs font-bold text-indigo-700 dark:text-indigo-400 flex items-center gap-1 mb-1">
              <Info className="w-3.5 h-3.5" />
              청산 필수 규칙 (Exit Rules)
            </h4>
            <ul className="text-[10px] text-slate-600 dark:text-zinc-400 list-disc pl-4 space-y-0.5">
              <li><strong>하드스탑:</strong> 진입가 대비 <span className="text-rose-500 font-bold">-5%</span> 이탈 시 즉시 매도</li>
              <li><strong>시가 생명선:</strong> 09:30 이후 당일 시가 하향 이탈 시 매도</li>
              <li><strong>익절 트레일링:</strong> <span className="text-emerald-500 font-bold">+5%</span> 도달 후 고점 대비 -3% 하락 시 익절</li>
            </ul>
          </div>
        </div>

        {/* 0단계: 거시 시장 상태 */}
        <div className="mb-8">
          <h2 className="text-sm font-bold text-slate-500 dark:text-zinc-400 uppercase tracking-wider mb-3">
            [0단계] 글로벌 & 국내 거시 시장 분위기
          </h2>
          {kosdaqState.reduceWeight ? (
            <div className="bg-amber-500/10 dark:bg-amber-500/5 border border-amber-500/20 text-amber-800 dark:text-amber-300 p-5 rounded-2xl flex items-start gap-4">
              <ShieldAlert className="w-6 h-6 text-amber-500 flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="font-bold text-base mb-1">시장 분위기: 역배열 하락 추세 (보수적 접근)</h3>
                <p className="text-xs leading-relaxed text-slate-600 dark:text-zinc-400">
                  코스닥 지수가 5일/20일/60일/120일 이동평균선 상으로 역배열 흐름에 진입했습니다. 전체적인 매수 비중을 <strong>50% 축소</strong>하고 종목 선정 기준을 보다 엄격히 적용하시기 바랍니다. (지수 종가: {kosdaqState.value.toFixed(2)})
                </p>
              </div>
            </div>
          ) : (
            <div className="bg-emerald-500/10 dark:bg-emerald-500/5 border border-emerald-500/20 text-emerald-800 dark:text-emerald-400 p-5 rounded-2xl flex items-start gap-4">
              <TrendingUp className="w-6 h-6 text-emerald-500 flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="font-bold text-base mb-1">시장 분위기: 정배열 상승 흐름 (정상 비중 유지)</h3>
                <p className="text-xs leading-relaxed text-slate-600 dark:text-zinc-400">
                  코스닥 지수의 이평선 구조가 정배열(5일/20일/60일/120일)을 안정적으로 유지하고 있습니다. 오버나이트 진입 전략을 정상 비중으로 매매하기에 적절한 환경입니다. (지수 종가: {kosdaqState.value.toFixed(2)})
                </p>
              </div>
            </div>
          )}
        </div>

        {/* 탭 인터페이스 */}
        <div className="flex border-b border-slate-200 dark:border-zinc-800 mb-8">
          <button
            onClick={() => setActiveTab("normal")}
            className={`py-3 px-6 font-bold text-sm border-b-2 transition-all flex items-center gap-2 ${
              activeTab === "normal"
                ? "border-indigo-600 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400"
                : "border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-zinc-300"
            }`}
          >
            <CheckCircle2 className="w-4 h-4" />
            정석 오버나이트
            <span className="text-xs bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-400 py-0.5 px-2 rounded-full font-normal">
              {results.normal.length}
            </span>
          </button>
          <button
            onClick={() => setActiveTab("aggressive")}
            className={`py-3 px-6 font-bold text-sm border-b-2 transition-all flex items-center gap-2 ${
              activeTab === "aggressive"
                ? "border-indigo-600 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400"
                : "border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-zinc-300"
            }`}
          >
            <Flame className="w-4 h-4" />
            공격형 추세 지속
            <span className="text-xs bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-400 py-0.5 px-2 rounded-full font-normal">
              {results.aggressive.length}
            </span>
          </button>
          <button
            onClick={() => setActiveTab("exclude")}
            className={`py-3 px-6 font-bold text-sm border-b-2 transition-all flex items-center gap-2 ${
              activeTab === "exclude"
                ? "border-indigo-600 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400"
                : "border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-zinc-300"
            }`}
          >
            <XCircle className="w-4 h-4" />
            제외 종목
            <span className="text-xs bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-400 py-0.5 px-2 rounded-full font-normal">
              {results.exclude.length}
            </span>
          </button>
        </div>

        {/* 종목 리스트 */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-12">
          {currentStocks.length === 0 ? (
            <div className="col-span-full py-16 bg-white dark:bg-zinc-900 rounded-[24px] border border-transparent shadow-sm flex flex-col items-center justify-center text-slate-400 dark:text-zinc-500">
              <Activity className="w-10 h-10 mb-2 opacity-50" />
              <span>선정된 종목이 없습니다.</span>
            </div>
          ) : (
            currentStocks.map(stock => (
              <div 
                key={stock.symbol}
                className="bg-white dark:bg-zinc-900 rounded-[24px] p-6 border border-transparent shadow-sm flex flex-col justify-between transition-all hover:shadow-md"
              >
                <div>
                  {/* 종목 기본 정보 */}
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <Link 
                          href={`/stocks/${stock.symbol}`}
                          className="font-bold text-lg text-slate-900 dark:text-zinc-50 hover:underline hover:text-indigo-600 dark:hover:text-indigo-400"
                        >
                          {stock.name}
                        </Link>
                        <span className="text-xs font-mono text-slate-400 dark:text-zinc-500 bg-slate-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded">
                          {stock.symbol}
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 dark:text-zinc-500 mt-1">
                        전일대비 {stock.changeRate >= 0 ? "+" : ""}{stock.changeRate}%
                      </p>
                    </div>

                    <div className="text-right">
                      <p className="text-lg font-extrabold text-slate-900 dark:text-zinc-50 flex items-center justify-end gap-0.5">
                        {stock.price.toLocaleString()}원
                      </p>
                      <div className="flex flex-col items-end gap-1 mt-1">
                        <span className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          stock.classification === "normal"
                            ? "bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400"
                            : stock.classification === "aggressive"
                            ? "bg-indigo-50 dark:bg-indigo-950/30 text-indigo-600 dark:text-indigo-400"
                            : "bg-rose-50 dark:bg-rose-950/30 text-rose-600 dark:text-rose-400"
                        }`}>
                          {stock.classification === "normal" ? "정석 통과" : stock.classification === "aggressive" ? "공격형 추세" : "제외"}
                        </span>
                        {stock.weightSuggestion && stock.weightSuggestion < 1.0 && (
                          <span className="inline-block text-[9px] font-extrabold bg-amber-100 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 px-1.5 py-0.5 rounded-md">
                            비중 50% 축소 제안
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* 세부 메트릭 (제외 탭이 아닐 때만 렌더링) */}
                  {stock.metrics && (
                    <div className="grid grid-cols-3 gap-2 bg-slate-50 dark:bg-zinc-950 p-3 rounded-xl mb-4 text-center">
                      <div>
                        <div className="text-[10px] text-slate-400 dark:text-zinc-500">거래량 비율</div>
                        <div className={`text-xs font-bold ${stock.metrics.volumeRatio >= 200 ? "text-emerald-500" : "text-amber-500"}`}>
                          {stock.metrics.volumeRatio.toFixed(0)}%
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] text-slate-400 dark:text-zinc-500">윗꼬리 비율</div>
                        <div className={`text-xs font-bold ${stock.metrics.tailRatio <= 3.5 ? "text-emerald-500" : "text-rose-500"}`}>
                          {stock.metrics.tailRatio.toFixed(1)}%
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] text-slate-400 dark:text-zinc-500">테마 신선도</div>
                        <div className={`text-xs font-bold ${stock.metrics.freshnessCount >= 3 ? "text-emerald-500" : "text-indigo-400"}`}>
                          {stock.metrics.freshnessCount}/4 개
                        </div>
                      </div>
                    </div>
                  )}

                  {/* 판단 사유 */}
                  <div className="border-t border-slate-100 dark:border-zinc-800/80 pt-3">
                    <h4 className="text-xs font-bold text-slate-500 dark:text-zinc-400 mb-2">
                      {stock.classification === "exclude" ? "탈락 사유" : "통과 및 검증 근거"}
                    </h4>
                    <ul className="space-y-1">
                      {stock.reasons.map((reason, idx) => (
                        <li key={idx} className="text-xs text-slate-600 dark:text-zinc-300 flex items-start gap-1.5 leading-relaxed">
                          {stock.classification === "exclude" ? (
                            <span className="text-rose-500 flex-shrink-0 mt-0.5">•</span>
                          ) : (
                            <span className="text-emerald-500 flex-shrink-0 mt-0.5">✓</span>
                          )}
                          {reason}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                {/* 청산 가이드 및 상세 링크 */}
                {stock.classification !== "exclude" && (
                  <div className="bg-indigo-50/30 dark:bg-zinc-950 border border-indigo-100/30 dark:border-zinc-800/60 p-3 rounded-xl mt-4 flex items-center justify-between">
                    <div className="text-[10px] text-indigo-700 dark:text-indigo-400 leading-tight">
                      <strong>지정가 청산 룰:</strong> 하드스탑 -5% | 트레일링 +5% / -3%
                    </div>
                    <Link
                      href={`/stocks/${stock.symbol}`}
                      className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline"
                    >
                      상세분석 ➔
                    </Link>
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        {/* Disclaimer */}
        <div className="bg-slate-100/50 dark:bg-zinc-900/50 border border-slate-200 dark:border-zinc-800 p-4 rounded-xl text-center">
          <p className="text-[10px] text-slate-500 dark:text-zinc-400 leading-relaxed">
            {disclaimer}
          </p>
        </div>
      </main>
    </div>
  );
}

export default function OvernightScreeningPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-background text-foreground flex items-center justify-center">
        <Activity className="w-8 h-8 animate-spin text-indigo-600" />
      </div>
    }>
      <OvernightScreeningContent />
    </Suspense>
  );
}
