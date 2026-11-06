"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { DashboardHeader } from "@/components/home/dashboard-header";
import {
  Activity,
  CheckCircle2,
  XCircle,
  Flame,
  Calendar,
  Clock,
  Zap,
  RefreshCw
} from "lucide-react";
import Link from "next/link";
import { formatGapPct, maArrangement, maGaps } from "./market-state";
import { useMarketState, type IndexState } from "./use-market-state";
import { persistSkipLabel } from "@/lib/screening/persist-skip-label";
import { kstClock, savedResultTitle, tradeDateLabel } from "@/lib/screening/saved-result";
import { OVERNIGHT_CRITERIA as C } from "@/lib/screening/overnight-criteria";
import { SurfaceCard } from "@/components/common/surface-card";

interface ScreeningStock {
  symbol: string;
  name: string;
  price: number;
  // 저장되지 않는 값이라 저장분에는 없다
  changeRate?: number;
  classification: "normal" | "aggressive" | "exclude";
  weightSuggestion?: number;
  reasons: string[];
  metrics?: {
    volumeRatio: number;
    tailRatio: number;
    freshnessCount: number;
    rsi14?: number | null;
    quantSignal?: boolean;
  };
}

interface ExcludedNoticeItem {
  symbol: string;
  name: string;
  reason: string;
  entryClose?: number;
}

// /latest(저장분)와 ?fresh=1(실시간) 두 응답을 같은 화면에 그린다. source 가 saved 면 저장분이다
interface OvernightResponse {
  ok: boolean;
  source?: "saved";
  empty?: boolean;
  tradeDate?: string | null;
  savedAt?: string | null;
  isToday?: boolean;
  // false = DB 에 저장하지 않았다. 사유는 persistSkippedReason(?fresh=1 은 항상 view_only, 2026-11-05)
  persisted?: boolean;
  persistSkippedReason?: string;
  alreadySaved?: { itemCount: number; savedAt: string };
  kosdaqState?: IndexState;
  kospiState?: IndexState;
  results: {
    normal: ScreeningStock[];
    aggressive: ScreeningStock[];
    exclude: ScreeningStock[];
  };
  excludedNotice?: ExcludedNoticeItem[];
  generatedAt?: string;
  dataSource?: "fresh" | "cache_miss" | "cache";
  dataFetchedAt?: string;
  priceWarning?: "after_hours" | "after_market_close" | null;
  disclaimer: string;
}

// 새로 조회 예상 소요(11/05 실측 16.6초). 진행 표시에만 쓴다
const FRESH_EXPECTED_SECONDS = 17;
// 완료 강조를 유지하는 시간
const FRESH_HIGHLIGHT_MS = 4000;

const DATA_SOURCE_LABEL = { fresh: "새로 조회", cache_miss: "새로 받음", cache: "캐시" } as const;

// 16:00 이후 받은 값 — 막지 않고 알린다. 근거는 rest-client.ts kstAfterHoursPriceWarning
const PRICE_WARNING_LABEL = {
  after_hours: "애프터마켓 중 — 종가 자리에 체결가가 섞여 있습니다. 당일 확정 종가는 다음 날 아침에 정규장 종가로 돌아옵니다",
  after_market_close: "애프터마켓 종료 후 — 종가 자리에 마지막 체결가가 남아 있습니다. 당일 확정 종가는 다음 날 아침에 정규장 종가로 돌아옵니다",
} as const;

function formatAgo(seconds: number): string {
  if (seconds < 60) return `${seconds}초 전`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}분 전`;
  return `${Math.floor(seconds / 3600)}시간 ${Math.floor((seconds % 3600) / 60)}분 전`;
}

interface TrackingSummary {
  total: number;
  stopLoss: number;
  hold: number;
  watching: number;
}

// 처음 진입할 때와 새로 조회 중에 같은 화면을 쓴다. 새로 조회는 진행 표시만 더한다
function OvernightLoadingView({ progress }: { progress?: string }) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <DashboardHeader />
      <main className="container mx-auto px-4 lg:px-8 py-8 md:py-12 max-w-7xl">
        {progress && (
          <p role="status" className="flex items-center gap-2 mb-6 text-sm font-semibold text-slate-700 dark:text-zinc-300">
            <RefreshCw className="w-4 h-4 animate-spin" />
            {progress}
          </p>
        )}
        <div className="animate-pulse">
          <div className="h-8 w-64 max-w-full bg-slate-200 dark:bg-zinc-800 rounded mb-6" />
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
        </div>
      </main>
    </div>
  );
}

function OvernightScreeningContent() {
  const searchParams = useSearchParams();
  const defaultTab = searchParams.get("tab") as "normal" | "aggressive" | "exclude" || "normal";

  const [activeTab, setActiveTab] = useState<"normal" | "aggressive" | "exclude">(defaultTab);
  const [data, setData] = useState<OvernightResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const { market, marketFailed, showMarket } = useMarketState();
  const [trackingSummary, setTrackingSummary] = useState<TrackingSummary | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshFailed, setRefreshFailed] = useState(false);
  const [refreshStartedAt, setRefreshStartedAt] = useState(0);
  const [justRefreshed, setJustRefreshed] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  // 수신 시각의 경과 표시와 새로 조회 진행 표시를 갱신한다
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), refreshing ? 1000 : 15000);
    return () => clearInterval(timer);
  }, [refreshing]);

  useEffect(() => {
    if (!justRefreshed) return;
    const timer = setTimeout(() => setJustRefreshed(false), FRESH_HIGHLIGHT_MS);
    return () => clearTimeout(timer);
  }, [justRefreshed]);

  // 새로 조회 — 진행 중에는 로딩 화면으로 바꾸고, 실패하면 이전 값으로 돌아와 그 사실을 알린다
  async function refreshScreening() {
    const startedAt = Date.now();
    setRefreshStartedAt(startedAt);
    setNow(startedAt);
    setRefreshing(true);
    setRefreshFailed(false);
    setJustRefreshed(false);
    try {
      const res = await fetch("/api/screening/overnight?fresh=1");
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok || !json.results) {
        setRefreshFailed(true);
        return;
      }
      setData(json);
      // 새로 조회 응답의 지수는 선별 결과와 같은 시점이다
      showMarket({ kosdaqState: json.kosdaqState, kospiState: json.kospiState ?? null, fetchedAt: json.dataFetchedAt ?? json.generatedAt });
      setJustRefreshed(true);
    } catch (err) {
      console.error(err);
      setRefreshFailed(true);
    } finally {
      setRefreshing(false);
      setNow(Date.now());
    }
  }

  useEffect(() => {
    async function fetchScreening() {
      try {
        // 진입은 저장분만 읽는다. 실시간 조회는 새로 조회 버튼으로만 나간다(2026-11-05)
        const res = await fetch("/api/screening/overnight/latest");
        const json = await res.json().catch(() => null);
        // 읽기 실패 응답에는 결과가 없다 — 종목을 하나도 그리지 않는다
        if (!res.ok || !json?.ok || !json.results) {
          setFailed(true);
          return;
        }
        setData(json);
      } catch (err) {
        console.error(err);
        setFailed(true);
      } finally {
        setLoading(false);
      }
    }
    fetchScreening();
  }, []);

  // tracking 진입 배지용 — summary만 가볍게 조회(§2). 실패해도 화면 전체에 영향 없도록
  // 조용히 무시한다(배지 자체가 안 뜰 뿐).
  useEffect(() => {
    async function fetchTrackingSummary() {
      try {
        const res = await fetch("/api/screening/tracking");
        if (!res.ok) return;
        const json = await res.json();
        if (json?.ok && json.summary) setTrackingSummary(json.summary);
      } catch {
        // 배지 없이 조용히 무시
      }
    }
    fetchTrackingSummary();
  }, []);

  if (loading) return <OvernightLoadingView />;

  if (refreshing) {
    const elapsed = Math.max(0, Math.floor((now - refreshStartedAt) / 1000));
    return <OvernightLoadingView progress={`새로 받는 중… ${elapsed}초 / 약 ${FRESH_EXPECTED_SECONDS}초`} />;
  }

  if (failed || !data) {
    return (
      <div className="min-h-screen bg-background text-foreground flex flex-col">
        <DashboardHeader />
        <main className="flex-1 container mx-auto px-4 py-12 flex flex-col items-center justify-center text-slate-400 dark:text-zinc-500">
          <XCircle className="w-12 h-12 mb-4 text-red-500" />
          <h2 className="text-xl font-bold mb-2">스크리닝 실패 — 데이터를 가져오지 못했습니다</h2>
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

  const { persisted, persistSkippedReason, alreadySaved, results, excludedNotice, dataSource, dataFetchedAt, priceWarning, disclaimer } = data;
  const currentStocks = results[activeTab];

  // 전체 버킷에서 quantSignal 건수 집계
  const allStocks = [...results.normal, ...results.aggressive, ...results.exclude];
  const quantSignalCount = allStocks.filter(s => s.metrics?.quantSignal === true).length;

  const isSaved = data.source === "saved";
  const notToday = isSaved && !data.empty && !data.isToday;
  const resultTitle = !isSaved
    ? "지금 조회한 선별 결과"
    : data.tradeDate
      ? savedResultTitle(data.tradeDate, data.savedAt)
      : "저장된 선별 결과 없음";
  const fetchedAtMs = dataFetchedAt ? new Date(dataFetchedAt).getTime() : null;
  const fetchedTimeStr = dataFetchedAt
    ? new Date(dataFetchedAt).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })
    : "";

  return (
    <div className="min-h-screen bg-background text-foreground">
      <DashboardHeader />
      
      <main className={`container mx-auto px-4 lg:px-8 py-8 md:py-12 max-w-7xl ${justRefreshed ? "animate-fresh-in" : ""}`}>
        {refreshFailed && (
          <div role="alert" className="mb-6 px-4 py-2.5 rounded-xl border border-red-200 dark:border-red-800/40 bg-red-50 dark:bg-red-950/30 text-sm font-semibold text-red-700 dark:text-red-300">
            새로 받지 못했습니다 — {isSaved ? "저장된 결과를 그대로 표시합니다" : `이전 값(${fetchedTimeStr})을 표시합니다`}
          </div>
        )}

        {/* 장중·휴장일에 열면 직전 거래일 결과가 보인다. 오늘 값으로 읽히지 않게 맨 위에 적는다 */}
        {notToday && data.tradeDate && (
          <div role="note" className="mb-6 px-4 py-2.5 rounded-xl border border-amber-200 dark:border-amber-800/40 bg-amber-50 dark:bg-amber-950/30 text-sm font-semibold text-amber-800 dark:text-amber-300">
            오늘 결과가 아닙니다 — {tradeDateLabel(data.tradeDate)} 저장분입니다. 오늘 결과는 거래일 15:41 저장 뒤에 보입니다
          </div>
        )}

        {priceWarning && (
          <div role="note" className="mb-6 px-4 py-2.5 rounded-xl border border-amber-200 dark:border-amber-800/40 bg-amber-50 dark:bg-amber-950/30 text-sm font-semibold text-amber-800 dark:text-amber-300">
            {PRICE_WARNING_LABEL[priceWarning]}
          </div>
        )}

        {/* 미저장 조회 표시(2026-11-02) — 저장 허용 시간대 밖 실행은 API 가 저장하지 않는다. 문구는 사유별로 다르다.
            persisted 가 없는(구버전) 응답에는 그리지 않는다. */}
        {persisted === false && (
          <div className="mb-6 px-4 py-2.5 rounded-xl border border-slate-300 dark:border-zinc-700 bg-slate-100 dark:bg-zinc-900 text-sm font-semibold text-slate-700 dark:text-zinc-300">
            {persistSkipLabel(persistSkippedReason, alreadySaved?.savedAt).title}
            <span className="ml-2 text-xs font-normal text-slate-500 dark:text-zinc-400">
              {persistSkipLabel(persistSkippedReason, alreadySaved?.savedAt).detail}
            </span>
          </div>
        )}

        {/* Header Section */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-zinc-50">
              오버나이트 관심목록
            </h1>
            {/* 용도 재정의(2026-10-29) — 백테스트에서 스크리너 통과 종목의 초과수익이 확인되지 않았다
                (analysis/hypothesis-log.md 최종 정리). 예측기가 아니라 관심 종목을 추려 보는 도구다. */}
            <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1">
              관심 종목을 추려 보는 도구입니다. 수익을 예측하거나 매매 시점을 알려주지 않습니다 — 백테스트 검증(가설 10건, 2020~2026)에서 초과수익이 확인되지 않았습니다.
            </p>
            <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
              손익 관리 규칙은 검증된 바 없으며 각자 판단으로 정할 것.
            </p>
            {trackingSummary && (
              <Link
                href="/overnight/tracking"
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-indigo-600 dark:text-indigo-400 hover:underline mt-2"
              >
                추적 중 {trackingSummary.total}
                {trackingSummary.stopLoss > 0 && (
                  <span className="inline-flex items-center gap-1 text-rose-600 dark:text-rose-400">
                    <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                    {trackingSummary.stopLoss}
                  </span>
                )}
                <span aria-hidden>→</span>
              </Link>
            )}
          </div>
        </div>

        {/* 지금 시장 상태 — 지수값과 이동평균 대비 괴리율, 배열 상태(정배열/역배열/혼조)를 사실로만 적는다.
            색으로 좋고 나쁨을 나타내지 않는다. reduceWeight 는 API 내부 로직용이라 화면에 쓰지 않는다(2026-10-30).
            저장 컬럼에 지수 상태가 없어 저장분과 따로 받는다. 두 영역의 시점이 달라 시각을 함께 적는다(2026-11-05). */}
        <section aria-label="지금 시장 상태" className="mb-8">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 mb-3">
            <h2 className="text-sm font-bold text-slate-500 dark:text-zinc-400 uppercase tracking-wider">
              지금 시장 상태
            </h2>
            {market && (
              <span className="text-xs text-slate-500 dark:text-zinc-400">
                {kstClock(market.fetchedAt)} 조회{isSaved && " · 아래 선별 결과와 시점이 다릅니다"}
              </span>
            )}
          </div>
          <div className="bg-slate-50 dark:bg-zinc-900/50 border border-slate-200 dark:border-zinc-800 p-5 rounded-2xl flex items-start gap-4">
            <Activity className="w-6 h-6 text-slate-400 dark:text-zinc-500 flex-shrink-0 mt-1" />
            {market ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 flex-1 min-w-0">
                <IndexStateBlock label="코스닥" state={market.kosdaqState} />
                <IndexStateBlock label="코스피" state={market.kospiState} />
              </div>
            ) : (
              <p className="text-sm text-slate-500 dark:text-zinc-400 mt-1">
                {marketFailed ? "지수를 받지 못했습니다" : "지수를 받는 중…"}
              </p>
            )}
          </div>
        </section>

        <ScreeningPipelineGuide />

        {/* 선별 결과 — 기본은 저장분이고, 새로 조회를 누르면 실시간 값으로 바뀐다 */}
        <div className="mb-4">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="flex items-center gap-1.5 text-lg md:text-xl font-extrabold text-slate-900 dark:text-zinc-50">
              <Calendar className="w-5 h-5 text-slate-500 dark:text-zinc-400" />
              {resultTitle}
            </h2>
            {isSaved && !data.empty && (
              <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                data.isToday
                  ? "bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300"
                  : "bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-300"
              }`}>
                {data.isToday ? "오늘" : "오늘 아님"}
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2 mt-1.5 text-xs text-slate-500 dark:text-zinc-400">
            {fetchedAtMs && (
              <span className={justRefreshed ? "px-2 py-1 rounded-lg font-semibold bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 ring-1 ring-emerald-300 dark:ring-emerald-700/60" : ""}>
                {justRefreshed && "새 값 수신 · "}시세 수신 {fetchedTimeStr} ({formatAgo(Math.max(0, Math.floor((now - fetchedAtMs) / 1000)))} · {dataSource ? DATA_SOURCE_LABEL[dataSource] : "캐시"})
              </span>
            )}
            <button
              type="button"
              onClick={refreshScreening}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-300 dark:border-zinc-700 font-semibold text-slate-700 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              새로 조회
            </button>
          </div>
        </div>

        {/* 탭 인터페이스 */}
        <div className="flex overflow-x-auto no-scrollbar border-b border-slate-200 dark:border-zinc-800 mb-8">
          <button
            onClick={() => setActiveTab("normal")}
            className={`shrink-0 whitespace-nowrap py-3 px-6 font-bold text-sm border-b-2 transition-all flex items-center gap-2 ${
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
            className={`shrink-0 whitespace-nowrap py-3 px-6 font-bold text-sm border-b-2 transition-all flex items-center gap-2 ${
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
            className={`shrink-0 whitespace-nowrap py-3 px-6 font-bold text-sm border-b-2 transition-all flex items-center gap-2 ${
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
          {/* 퀀트신호 요약 — 탭이 아닌 정보 배지 */}
          {quantSignalCount > 0 && (
            <div className="ml-auto shrink-0 whitespace-nowrap flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/40 rounded-lg self-center"
              title="RSI 50~60 + 거래량 200~400% 충족 종목 수 (참고용 지표, 매수 추천 아님) · 실험 신호 · 추세 필터 미반영"
            >
              <Zap className="w-3.5 h-3.5 text-amber-500" />
              <span className="text-xs font-bold text-amber-700 dark:text-amber-400">퀀트신호 {quantSignalCount}</span>
            </div>
          )}
        </div>

        {/* 종목 리스트 */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          {currentStocks.length === 0 ? (
            <div className="col-span-full py-16 bg-white dark:bg-zinc-900 rounded-[24px] border border-transparent shadow-sm flex flex-col items-center justify-center text-slate-400 dark:text-zinc-500">
              <Activity className="w-10 h-10 mb-2 opacity-50" />
              <span>{data.empty ? "저장된 선별 결과가 없습니다." : "선정된 종목이 없습니다."}</span>
            </div>
          ) : (
            currentStocks.map(stock => (
              <SurfaceCard 
                key={stock.symbol}
                className="flex flex-col justify-between transition-all hover:shadow-md"
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
                      {stock.changeRate != null && (
                        <p className="text-xs text-slate-400 dark:text-zinc-500 mt-1">
                          전일대비 {stock.changeRate >= 0 ? "+" : ""}{stock.changeRate}%
                        </p>
                      )}
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
                        {stock.metrics?.quantSignal && (
                          <span
                            className="inline-block text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 dark:bg-amber-950/30 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-700/40"
                            title="RSI 50~60 + 거래량 200~400% 충족 (참고용 지표, 매수 추천 아님) · 실험 신호 · 추세 필터 미반영"
                          >
                            ⚡ 퀀트신호
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* 세부 메트릭 (제외 탭이 아닐 때만 렌더링) */}
                  {stock.metrics && (
                    <div className="grid grid-cols-4 gap-2 bg-slate-50 dark:bg-zinc-950 p-3 rounded-xl mb-4 text-center">
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
                      <div>
                        <div className="text-[10px] text-slate-400 dark:text-zinc-500">RSI(14)</div>
                        <div className={`text-xs font-bold ${
                          stock.metrics.rsi14 == null ? "text-slate-300 dark:text-zinc-600"
                            : stock.metrics.rsi14 >= 55 && stock.metrics.rsi14 <= 65 ? "text-amber-500"
                            : stock.metrics.rsi14 > 70 ? "text-rose-500"
                            : "text-slate-500 dark:text-zinc-400"
                        }`}>
                          {stock.metrics.rsi14 != null ? stock.metrics.rsi14.toFixed(1) : "—"}
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
                      {stock.classification === "exclude" && stock.metrics?.quantSignal && (
                        <li className="text-xs text-slate-600 dark:text-zinc-300 flex items-start gap-1.5 leading-relaxed">
                          <span className="text-rose-500 flex-shrink-0 mt-0.5">•</span>
                          RSI·거래량 조건만 충족 (추세 조건 미달)
                        </li>
                      )}
                    </ul>
                  </div>
                </div>

                {/* 상세 링크 */}
                {stock.classification !== "exclude" && (
                  <div className="bg-indigo-50/30 dark:bg-zinc-950 border border-indigo-100/30 dark:border-zinc-800/60 p-3 rounded-xl mt-4 flex items-center justify-end">
                    <Link
                      href={`/stocks/${stock.symbol}`}
                      className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline"
                    >
                      상세분석 ➔
                    </Link>
                  </div>
                )}
              </SurfaceCard>
            ))
          )}
        </div>

        {/* 분석 보류 — 제외 탭 안 최하단, excludedNotice가 있을 때만 */}
        {activeTab === "exclude" && excludedNotice && excludedNotice.length > 0 && (
          <div className="mb-12">
            <div className="flex items-center gap-2 my-6">
              <div className="flex-1 border-t border-dashed border-slate-200 dark:border-zinc-800" />
              <div className="flex items-center gap-1.5 text-slate-400 dark:text-zinc-500 flex-shrink-0">
                <Clock className="w-3.5 h-3.5" />
                <span className="text-xs font-semibold">분석 보류 (데이터 부족)</span>
                <span className="text-[10px] bg-slate-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded-full">
                  ⏳ {excludedNotice.length}건
                </span>
              </div>
              <div className="flex-1 border-t border-dashed border-slate-200 dark:border-zinc-800" />
            </div>
            <p className="text-[11px] text-slate-400 dark:text-zinc-500 mb-4 text-center">
              정배열 판정에 필요한 데이터가 부족해 분석하지 못한 종목입니다. 직접 확인 후 참고하세요.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {excludedNotice.map((item) => (
                <div
                  key={item.symbol}
                  className="flex items-start justify-between gap-3 px-4 py-3 rounded-xl border border-dashed border-slate-200 dark:border-zinc-800 bg-slate-50/30 dark:bg-zinc-900/20"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <Link
                        href={`/stocks/${item.symbol}`}
                        className="font-semibold text-sm text-slate-600 dark:text-zinc-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:underline truncate"
                      >
                        {item.name}
                      </Link>
                      <span className="text-[10px] font-mono text-slate-400 dark:text-zinc-500 bg-slate-100 dark:bg-zinc-800 px-1 py-0.5 rounded flex-shrink-0">
                        {item.symbol}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 dark:text-zinc-500 leading-relaxed">
                      {item.reason}
                    </p>
                  </div>
                  {item.entryClose != null && item.entryClose > 0 && (
                    <div className="flex-shrink-0 text-right">
                      <div className="text-[9px] text-slate-400 dark:text-zinc-500">당일 종가</div>
                      <div className="text-xs font-semibold text-slate-500 dark:text-zinc-400">
                        {item.entryClose.toLocaleString()}원
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 분석 보류가 없는 제외 탭에서 하단 여백 */}
        {!(activeTab === "exclude" && excludedNotice && excludedNotice.length > 0) && (
          <div className="mb-12" />
        )}

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

// 이 종목들이 어떻게 걸러졌나(2026-11-02) — 숫자는 판정 코드와 같은 OVERNIGHT_CRITERIA 에서 읽는다.
// 단계별 건수(퍼널)는 API 응답에 없어 싣지 않는다.
function ScreeningPipelineGuide() {
  const ma = C.main.maPeriods.join("·");
  const rows: [string, string][] = [
    ["사전 제외", `ETF·ETN·파생·스팩 / 등락률 ±${C.prefilter.abnormalMovePct}% 초과 / ${C.prefilter.minPrice.toLocaleString()}원 미만`],
    ["1차 후보", `등락률 +${C.primary.minChangeRate}% 이상 & 거래대금 ${C.primary.minTradingValue / 100_000_000}억 이상 → 회전율 상위 ${C.primary.maxTargets}개`],
    [
      "주 필터",
      `회전율 ${C.main.minTurnoverRate}% 이상 · 일봉·주봉 정배열(${ma}) · 거래량 20일 평균의 ${C.main.minVolumeRatio}% 이상 · 윗꼬리 ${C.main.maxTailRatio}% 이하 · 등락률 +${C.main.excludeChangeRate}% 이상 제외 · 위험종목 제외(투자주의·경고·위험·유의, 거래정지, 정리매매, 단기과열)`,
    ],
    [
      "테마 신선도",
      `4개 조건 중 ${C.freshness.minPass}개 이상 — ${C.freshness.bigCandleWithinDays}일 이내 +${C.freshness.bigCandlePct}% 장대양봉 · 장대양봉 몸통 중간값 위 · 조정기 거래량 ${C.freshness.contractionRatio * 100}% 이하 · 조정기 변동폭 ${C.freshness.contractionRatio * 100}% 이하`,
    ],
    [
      "분류",
      `정석 = 주 필터 + 테마 신선도 통과 / 공격형 = 정배열·윗꼬리 통과, 테마 신선도 미달 또는 거래량 ${C.aggressiveVolumeRatio.min}~${C.aggressiveVolumeRatio.max}% / 나머지는 제외 탭. 이력 ${C.main.minHistoryBars}봉 미만은 분석 보류`,
    ],
  ];
  return (
    <details className="mb-8 group border border-slate-200 dark:border-zinc-800 rounded-2xl">
      <summary className="cursor-pointer select-none px-5 py-3 text-sm font-bold text-slate-600 dark:text-zinc-300">
        이 종목들이 어떻게 걸러졌나
      </summary>
      <dl className="px-5 pb-4 grid grid-cols-1 sm:grid-cols-[6.5rem_1fr] gap-x-4 gap-y-2 text-xs">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="font-semibold text-slate-500 dark:text-zinc-400">{k}</dt>
            <dd className="text-slate-700 dark:text-zinc-300 leading-relaxed">{v}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}

// 지수 하나의 시장 상태 — 값이 없으면(조회 실패) 0 이나 대체 값을 그리지 않는다.
// 이평선이 없으면 지수값만 그린다.
function IndexStateBlock({ label, state }: { label: string; state?: IndexState | null }) {
  if (!state || !(state.value > 0)) {
    return (
      <div className="text-sm text-slate-500 dark:text-zinc-400">{label} 지수 조회 실패</div>
    );
  }
  const gaps = maGaps(state.value, state.maState);
  const arrangement = maArrangement(state.maState);
  return (
    <div className="min-w-0">
      <p className="flex items-baseline gap-2 text-slate-900 dark:text-zinc-50">
        <span className="text-sm font-semibold text-slate-500 dark:text-zinc-400">{label}</span>
        <span className="text-2xl font-extrabold tabular-nums">{state.value.toFixed(2)}</span>
        {arrangement && (
          <span
            className="text-sm font-semibold text-slate-600 dark:text-zinc-300"
            title="이동평균 5·20·60·120일의 순서 — 정배열(5>20>60>120) · 역배열(5<20<60<120) · 그 밖은 혼조"
          >
            {arrangement}
          </span>
        )}
      </p>
      {gaps.length > 0 && (
        <>
          <p className="text-sm text-slate-700 dark:text-zinc-300 tabular-nums mt-1">
            {gaps.map((g, i) => (
              <span key={g.period} title={`${g.period}일 이동평균 ${g.ma.toFixed(2)}`}>
                {i > 0 && <span className="text-slate-400 dark:text-zinc-600">{"  ·  "}</span>}
                {g.period}일 {formatGapPct(g.gapPct)}
              </span>
            ))}
          </p>
          <p className="text-[11px] text-slate-400 dark:text-zinc-500 tabular-nums mt-0.5">
            지수 대비 괴리율 · 이평선 {gaps.map((g) => g.ma.toFixed(2)).join(" / ")}
          </p>
        </>
      )}
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
