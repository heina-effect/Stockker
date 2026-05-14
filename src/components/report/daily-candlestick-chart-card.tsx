"use client";

import { useLiveMarket } from "@/components/dashboard/live-market-provider";
import { ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { FreshnessLabel } from "./freshness-label";
import { formatNumber } from "@/lib/utils";
import { useState, useEffect } from "react";
import { LocalStorageAdapter } from "@/lib/user-storage/local-adapter";
import { AlertCircle } from "lucide-react";

// 당일(Intraday) NXT 운영시간(08:00~20:00) 빈 그리드 생성기
function generateFullDayIntradayGrid() {
  const buckets = [];
  const startHour = 8;
  const endHour = 20;

  for (let h = startHour; h < endHour; h++) {
    for (let m = 0; m < 60; m += 10) {
      const timeStr = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
      buckets.push({
        time: timeStr,
        open: null,
        high: null,
        low: null,
        close: null,
        volume: null,
      });
    }
  }
  return buckets;
}

// The mock generators have been removed to prefer real data from the KIS API using the /api/stocks/[symbol]/ohlc route
import { aggregateToOHLC, calculateMA, shouldAppendLiveDailyCandle } from "@/lib/stocks/chart-utils";

interface CandlestickShapeProps {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  payload?: any;
  value?: number[];
}

const CandlestickShape = (props: CandlestickShapeProps) => {
  const { x = 0, y = 0, width = 0, height = 0, payload, value } = props;
  const fill = payload?.isUp ? "#ef4444" : "#3b82f6";
  
  if (!value || value.length < 2) return <rect x={x} y={y} width={width} height={1} fill={fill} />;
  
  const minBody = value[0];
  const maxBody = value[1];
  const bodyDiff = maxBody - minBody;
  
  const safeHeight = Math.max(height, 1);
  const pxPerUnit = bodyDiff > 0 ? safeHeight / bodyDiff : 0;
  
  const highY = pxPerUnit > 0 ? y - (payload.high - maxBody) * pxPerUnit : y - 5;
  const lowY = pxPerUnit > 0 ? y + safeHeight + (minBody - payload.low) * pxPerUnit : y + 5;
  const centerX = x + width / 2;

  return (
    <g>
      <line x1={centerX} y1={highY} x2={centerX} y2={lowY} stroke={fill} strokeWidth={1} />
      <rect x={x} y={y} width={width} height={safeHeight} fill={fill} rx={1} />
    </g>
  );
};

export function DailyCandlestickChartCard({ symbol }: { symbol: string }) {
  const { marketStore } = useLiveMarket();
  const state = marketStore[symbol];
  const [chartMode, setChartMode] = useState<"daily" | "intraday">("daily");
  const [baseData, setBaseData] = useState<any[]>([]);
  const [isFetching, setIsFetching] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    // chartMode or symbol changes => refetch real OHLC
    const fetchOHLC = async () => {
      setIsFetching(true);
      setErrorMsg(null);
      try {
        const res = await fetch(`/api/stocks/${symbol}/ohlc?mode=${chartMode}`);
        const data = await res.json();
        if (data.ok && data.chart) {
          // pre-process logic specific to chart render
          const processed = data.chart.map((d: any) => ({
            ...d,
            isUp: d.close >= d.open,
            body: [Math.min(d.open, d.close), Math.max(d.open, d.close)]
          }));
          setBaseData(processed);
        } else {
          setErrorMsg(data.error || "Failed to fetch data");
          setBaseData([]);
        }
      } catch (err) {
        setErrorMsg("Network error");
        setBaseData([]);
      } finally {
        setIsFetching(false);
      }
    };
    fetchOHLC();
  }, [symbol, chartMode]);

  const toggleMode = (mode: "daily" | "intraday") => {
    setChartMode(mode);
    const prefs = LocalStorageAdapter.getAll().preferences;
    LocalStorageAdapter.setAll({ preferences: { ...prefs, chartMode: mode }});
  };

  const isLoading = (!state || state.source === "connecting") || isFetching;

  if (isLoading) {
    return (
      <div className="bg-white dark:bg-zinc-900 rounded-[24px] p-6 shadow-sm border border-transparent h-[400px] flex items-center justify-center animate-pulse">
        데이터 로드 중...
      </div>
    );
  }

  let chartData: any[] = [];

  if (chartMode === "daily") {
    // daily mode: just use baseData, append live day tick if we have live quote
    chartData = [...baseData];
    if (state?.quote && chartData.length > 0) {
      const q = state.quote;
      const lastHist = chartData[chartData.length - 1];
      
      // Scaling Guard: If the live price is extremely different from historical (> 2x or < 0.5x),
      // it's likely a data source error or fallback (like 0). Skip it to protect Y-axis.
      const isPricePlausible = q.price > 0 && 
                              (q.price / lastHist.close > 0.5) && 
                              (q.price / lastHist.close < 2.0);

      if (isPricePlausible && shouldAppendLiveDailyCandle(lastHist)) {
        const todayCurrent: any = {
          time: "오늘",
          open: q.open || q.price,
          high: Math.max(q.high || q.price, q.price),
          low: Math.min(q.low || q.price, q.price),
          close: q.price,
          volume: q.volume || 0,
        };
        todayCurrent.isUp = todayCurrent.close >= todayCurrent.open;
        todayCurrent.body = [Math.min(todayCurrent.open, todayCurrent.close), Math.max(todayCurrent.open, todayCurrent.close)];
        chartData.push(todayCurrent);
      } else {
        // price=0: SSE 연결 전 초기값 (정상) → debug만
        // price>0 but scale 이상: 데이터 오류 가능 → warn
        if (q.price > 0) {
          console.warn(`[ChartScale] Implausible live price ${q.price} (Hist: ${lastHist.close}) — skipping`);
        } else {
          console.debug(`[ChartScale] price=0 skipped (SSE connecting)`);
        }
      }
    }
  } else {
    // intraday mode: 08:00 ~ 20:00 grid 
    const fullDayGrid = generateFullDayIntradayGrid();
    
    // Merge real fetched baseData onto the grid
    chartData = fullDayGrid.map(gridItem => {
         const realItem = baseData.find(d => d.time === gridItem.time);
         if (realItem) {
             return { ...realItem };
         }
         return gridItem;
    });

    // Handle live updates from marketStore state.chart
    if (state?.chart && state.chart.length > 0) {
      const realBuckets = aggregateToOHLC(state.chart);
      
      chartData = chartData.map(item => {
        const liveBucket = realBuckets.find(rb => rb.time === item.time);
        if (liveBucket) {
           return {
             ...item,
             time: item.time,
             open: item.open !== null ? item.open : liveBucket.open,
             high: Math.max(item.high || 0, liveBucket.high),
             low: item.low !== null ? Math.min(item.low, liveBucket.low) : liveBucket.low,
             close: liveBucket.close,
             volume: (item.volume || 0) + (liveBucket.volume || 0),
             isUp: liveBucket.close >= (item.open !== null ? item.open : liveBucket.open),
             body: [
                 Math.min(item.open !== null ? item.open : liveBucket.open, liveBucket.close), 
                 Math.max(item.open !== null ? item.open : liveBucket.open, liveBucket.close)
             ]
           };
        }
        return item;
      });
    }
  }

  // 2. MA 공통 계산 적용
  chartData = calculateMA(chartData, 5);
  chartData = calculateMA(chartData, 20);

  // Adjust domain for display, filtering out nulls
  const validData = chartData.filter(d => d.low !== null && d.low !== undefined);
  const minPrice = validData.length > 0 ? Math.min(...validData.map(d => Number(d.low))) : 0;
  const maxPrice = validData.length > 0 ? Math.max(...validData.map(d => Number(d.high))) : 100;
  
  // 기준 도메인 스케일 안정화
  const domainMin = validData.length > 0 ? Math.max(0, minPrice - Math.abs(minPrice * 0.01)) : 0;
  const domainMax = validData.length > 0 ? maxPrice + Math.abs(maxPrice * 0.01) : 100;

  // 헤더/라벨 시맨틱 분기
  const title = chartMode === "daily" ? "일봉 차트" : "당일 시세 흐름";
  const subtitle = chartMode === "daily" ? "최근 3개월 · 1봉=1거래일" : "오늘 장중 · 10분봉 기준";
  const ma5Label = chartMode === "daily" ? "MA5" : "10분봉 MA5";
  const ma20Label = chartMode === "daily" ? "MA20" : "10분봉 MA20";
  const timeLabel = chartMode === "daily" ? "일자" : "시각";

  return (
    <div className="bg-white dark:bg-zinc-900 rounded-[24px] p-6 shadow-sm border border-transparent flex flex-col h-[400px]">
      <div className="flex items-center justify-between mb-2">
        <div className="flex flex-col">
           <div className="flex items-center gap-3">
             <h3 className="font-bold text-slate-900 dark:text-zinc-50">{title}</h3>
             <div className="flex bg-slate-100 dark:bg-zinc-800 rounded-lg p-0.5">
               <button onClick={() => toggleMode('daily')} className={`text-[10px] px-2 py-1 rounded-md font-medium transition-colors ${chartMode === 'daily' ? 'bg-white dark:bg-zinc-700 shadow-sm text-slate-900 dark:text-white' : 'text-slate-500 hover:text-slate-700'}`}>일봉</button>
               {process.env.NEXT_PUBLIC_ENABLE_INTRADAY_CHART === '1' && (
                 <button onClick={() => toggleMode('intraday')} className={`text-[10px] px-2 py-1 rounded-md font-medium transition-colors ${chartMode === 'intraday' ? 'bg-white dark:bg-zinc-700 shadow-sm text-slate-900 dark:text-white' : 'text-slate-500 hover:text-slate-700'}`}>당일</button>
               )}
             </div>
           </div>
           
           <div className="text-[10px] text-slate-400 flex items-center gap-3 mt-2">
             <span className="flex items-center gap-1 font-medium bg-slate-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded text-slate-500">{subtitle}</span>
             <span className="flex items-center gap-1"><span className="w-2 h-0.5 bg-yellow-500"></span> {ma5Label}</span>
             <span className="flex items-center gap-1"><span className="w-2 h-0.5 bg-purple-500"></span> {ma20Label}</span>
           </div>
        </div>
        <FreshnessLabel type="price" state={state.source === "live" ? "live" : state.source === "mock-fallback" ? "error" : "stale"} timestamp={new Date(state.lastUpdated || 0).toISOString()} />
      </div>

      {errorMsg && (
         <div className="flex-1 flex flex-col items-center justify-center text-red-400 dark:text-red-500 gap-2 mt-4">
           <AlertCircle className="w-8 h-8 opacity-50" />
           <p className="text-sm">데이터를 불러오는 중 문제가 발생했습니다: {errorMsg}</p>
         </div>
      )}
      {!errorMsg && validData.length === 0 && !isFetching ? (
         <div className="flex-1 flex flex-col items-center justify-center text-slate-400 dark:text-zinc-600 gap-2 mt-4">
           <AlertCircle className="w-8 h-8 opacity-50" />
           <p className="text-sm">당일 분봉 차트 데이터가 아직 집계되지 않았습니다.</p>
         </div>
      ) : (
        <div className="flex-1 w-full relative mt-4" style={{ minHeight: 0 }}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} margin={{ top: 10, right: 30, left: 10, bottom: 0 }} barCategoryGap="15%">
              <XAxis 
                dataKey="time" 
                tick={{ fontSize: 10 }} 
                tickLine={false} 
                axisLine={false} 
                minTickGap={60}
                interval="preserveStartEnd"
              />
              <YAxis domain={[domainMin, domainMax]} orientation="right" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={(val) => Math.round(val).toLocaleString()} />
              <Tooltip 
                cursor={{ fill: 'rgba(100,100,100,0.1)' }}
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const data = payload[0].payload;
                    if (data.open === null) return null;
                    const diffColor = data.isUp ? "text-red-500" : "text-blue-500";
                    return (
                      <div className="bg-white dark:bg-zinc-900 border shadow-lg rounded-xl p-4 text-xs flex flex-col gap-1 min-w-[140px] z-50">
                        <span className="text-slate-400 font-mono mb-1">{timeLabel}: {data.time}</span>
                        <div className="flex justify-between"><span className="text-slate-500">시가</span><span className="font-mono font-medium">{formatNumber(Math.round(data.open))}</span></div>
                        <div className="flex justify-between"><span className="text-slate-500">고가</span><span className="font-mono text-red-500 font-medium">{formatNumber(Math.round(data.high))}</span></div>
                        <div className="flex justify-between"><span className="text-slate-500">저가</span><span className="font-mono text-blue-500 font-medium">{formatNumber(Math.round(data.low))}</span></div>
                        <div className="flex justify-between border-t pt-1"><span className="text-slate-900 dark:text-slate-100 font-bold">종가</span><span className={`font-mono font-bold ${diffColor}`}>{formatNumber(Math.round(data.close))}</span></div>
                        {data.volume !== null && data.volume !== undefined && (
                          <div className="flex justify-between"><span className="text-slate-500">거래량</span><span className="font-mono font-medium">{formatNumber(data.volume)}</span></div>
                        )}
                        
                        <div className="flex justify-between border-t border-slate-100 dark:border-zinc-800 mt-2 pt-2">
                          <span className="text-yellow-600 dark:text-yellow-500">{ma5Label}</span>
                          <span className="font-mono">{data.ma5 ? formatNumber(Math.round(data.ma5)) : '-'}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-purple-600 dark:text-purple-500">{ma20Label}</span>
                          <span className="font-mono">{data.ma20 ? formatNumber(Math.round(data.ma20)) : '-'}</span>
                        </div>
                      </div>
                    );
                  }
                  return null;
                }} 
              />
              
              <Line type="monotone" dataKey="ma5" stroke="#eab308" strokeWidth={1.5} dot={false} isAnimationActive={false} />
              <Line type="monotone" dataKey="ma20" stroke="#a855f7" strokeWidth={1.5} dot={false} isAnimationActive={false} />
              <Bar dataKey="body" shape={<CandlestickShape />} isAnimationActive={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
