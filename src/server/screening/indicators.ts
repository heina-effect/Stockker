import "server-only";

import type { SupabaseAdmin } from "@/lib/supabase/client";

/**
 * 기술지표(RSI/MACD/볼린저밴드/이동평균/거래량비율) 계산.
 *
 * KIS API는 기술지표를 제공하지 않아 OHLCV로 자체 계산한다. MACD/볼린저밴드/이동평균은
 * KIS 공식 샘플(koreainvestment/open-trading-api의 strategy_builder/core/indicators.py)과
 * 동일하게 맞췄다: EMA는 pandas ewm(adjust=False) 방식(재귀, 시작값 시딩), 표준편차는
 * pandas rolling().std() 기본값인 표본표준편차(ddof=1)를 사용한다.
 *
 * RSI만 예외적으로 KIS 샘플(ewm 기반, α=2/(N+1))이 아니라 업계 표준인 Wilder 평활
 * (α=1/N)을 쓴다. 실측 대조(JW신약 067290) 결과 ewm 방식은 TradingView·타 서비스 대비
 * RSI가 9~10p 높게 나와(급등 종목에서 최근 값에 약 2배 가중되는 효과) Wilder 평활로
 * 교체했다. 그 외 지표는 그대로 KIS 샘플 방식을 유지한다.
 *
 * 스토캐스틱 슬로우(15,5,5)·윌리엄스 %R(19)은 고가/저가가 필요해 high/low가 모두 있는
 * 호출에서만 계산하고, 없으면(예: 종가만 넘기는 호출) 전부 null로 남긴다 — 기존 지표
 * 계산에는 영향 없음.
 */

export interface TrajectoryDailyRow {
  tradeDate: string;
  close: number;
  volume: number;
  high?: number;
  low?: number;
}

export interface IndicatorValues {
  rsi14: number | null;
  macd: number | null;
  macdSignal: number | null;
  macdHist: number | null;
  bbUpper: number | null;
  bbMid: number | null;
  bbLower: number | null;
  bbPctB: number | null;
  ma5: number | null;
  ma20: number | null;
  ma60: number | null;
  volRatio5: number | null;
  volRatio20: number | null;
  stochSlowK: number | null;
  stochSlowD: number | null;
  williamsR: number | null;
  isHalted: boolean;
}

function round4(v: number | null): number | null {
  return v === null || !Number.isFinite(v) ? null : Number(v.toFixed(4));
}

// pandas ewm(span=period, adjust=False).mean()과 동일: y[0]=x[0], y[i] = α*x[i] + (1-α)*y[i-1]
function emaAdjustFalse(values: number[], period: number): number[] {
  const alpha = 2 / (period + 1);
  const result = new Array(values.length);
  result[0] = values[0];
  for (let i = 1; i < values.length; i++) {
    result[i] = alpha * values[i] + (1 - alpha) * result[i - 1];
  }
  return result;
}

// pandas rolling(window=period).mean()과 동일: 앞쪽 period-1개는 null
function rollingMean(values: number[], idx: number, period: number): number | null {
  if (idx < period - 1) return null;
  let sum = 0;
  for (let i = idx - period + 1; i <= idx; i++) sum += values[i];
  return sum / period;
}

// pandas rolling(window=period).std()과 동일: 표본표준편차(ddof=1)
function rollingStdSample(values: number[], idx: number, period: number): number | null {
  const mean = rollingMean(values, idx, period);
  if (mean === null || period < 2) return null;
  let sumSq = 0;
  for (let i = idx - period + 1; i <= idx; i++) sumSq += (values[i] - mean) ** 2;
  return Math.sqrt(sumSq / (period - 1));
}

// period 기간 중 최고값/최저값. 앞쪽 period-1개는 null (rollingMean과 동일한 윈도우 규칙)
function rollingMax(values: number[], idx: number, period: number): number | null {
  if (idx < period - 1) return null;
  let max = -Infinity;
  for (let i = idx - period + 1; i <= idx; i++) if (values[i] > max) max = values[i];
  return max;
}
function rollingMin(values: number[], idx: number, period: number): number | null {
  if (idx < period - 1) return null;
  let min = Infinity;
  for (let i = idx - period + 1; i <= idx; i++) if (values[i] < min) min = values[i];
  return min;
}

// null을 포함하는 시계열의 period 기간 단순평균. 윈도우 안에 null이 하나라도 있으면 null
// (스토캐스틱 Slow %K/%D처럼 "지표의 지표"를 평활할 때 사용)
function rollingMeanOfSeries(series: (number | null)[], idx: number, period: number): number | null {
  if (idx < period - 1) return null;
  let sum = 0;
  for (let i = idx - period + 1; i <= idx; i++) {
    const v = series[i];
    if (v === null) return null;
    sum += v;
  }
  return sum / period;
}

// 거래정지(Halt) 감지: 연속 minConsecutiveDays(기본 5일) 이상 종가가 완전히 동일하면
// 해당 연속 구간을 전부 거래정지로 판정한다.
function isHaltedSeries(closes: number[], minConsecutiveDays = 5): boolean[] {
  const n = closes.length;
  const halted = new Array(n).fill(false);
  let sameCount = 1;

  for (let i = 1; i < n; i++) {
    if (closes[i] === closes[i - 1]) {
      sameCount++;
    } else {
      // 종가가 바뀌었을 때, 이전까지 누적된 sameCount가 조건 이상이면 구간 전체를 true로 마킹
      if (sameCount >= minConsecutiveDays) {
        for (let j = i - sameCount; j < i; j++) {
          halted[j] = true;
        }
      }
      sameCount = 1;
    }
  }
  // 배열이 끝났을 때 마지막 구간 체크
  if (sameCount >= minConsecutiveDays) {
    for (let j = n - sameCount; j < n; j++) {
      halted[j] = true;
    }
  }
  return halted;
}

/**
 * (symbol, discovery_date) 하나의 전체 시계열(trade_date 오름차순)에 대해 지표를 계산한다.
 * 데이터가 부족한 구간(RSI는 15봉 미만, MACD는 26봉 미만인 전체 시계열, MA/BB/거래량비율은
 * 각 기간 미만인 초반 행)은 null로 남긴다 — 0으로 채우지 않는다.
 */
export function computeIndicatorSeries(rows: TrajectoryDailyRow[]): IndicatorValues[] {
  const n = rows.length;
  const closes = rows.map((r) => r.close);
  const volumes = rows.map((r) => r.volume);

  // RSI(14): Wilder 평활(α=1/14, 업계 표준 — KIS 샘플의 ewm 방식과 다름, 위 docstring 참고).
  // len < period+1(=15)이면 전체 null. 시딩: 첫 14개 변화폭(인덱스 1~14)의 단순평균이
  // 인덱스 14의 값이 되고, 이후는 (이전값*13 + 이번값)/14로 재귀 갱신한다.
  const rsiSeries: (number | null)[] = new Array(n).fill(null);
  if (n >= 15) {
    const gain = new Array(n).fill(0);
    const loss = new Array(n).fill(0);
    for (let i = 1; i < n; i++) {
      const delta = closes[i] - closes[i - 1];
      if (delta > 0) gain[i] = delta;
      else if (delta < 0) loss[i] = -delta;
    }

    const rsiFromAvg = (avgGain: number, avgLoss: number): number => {
      if (avgGain === 0 && avgLoss === 0) return 50; // 변화 없음
      if (avgLoss === 0) return 99.99; // 0 나누기 방어 (100 대신 클램프)
      const rs = avgGain / avgLoss;
      return 100 - 100 / (1 + rs);
    };

    let avgGain = 0;
    let avgLoss = 0;
    for (let i = 1; i <= 14; i++) {
      avgGain += gain[i];
      avgLoss += loss[i];
    }
    avgGain /= 14;
    avgLoss /= 14;
    rsiSeries[14] = round4(rsiFromAvg(avgGain, avgLoss));

    for (let i = 15; i < n; i++) {
      avgGain = (avgGain * 13 + gain[i]) / 14;
      avgLoss = (avgLoss * 13 + loss[i]) / 14;
      rsiSeries[i] = round4(rsiFromAvg(avgGain, avgLoss));
    }
  }

  // MACD(12,26,9): KIS 샘플의 calc_macd/calc_macd_signal/calc_macd_histogram과 동일.
  // len < slow_period(26)이면 전체 null.
  const macdSeries: (number | null)[] = new Array(n).fill(null);
  const macdSignalSeries: (number | null)[] = new Array(n).fill(null);
  const macdHistSeries: (number | null)[] = new Array(n).fill(null);
  if (n >= 26) {
    const emaFast = emaAdjustFalse(closes, 12);
    const emaSlow = emaAdjustFalse(closes, 26);
    const macdRaw = closes.map((_, i) => emaFast[i] - emaSlow[i]);
    const signalRaw = emaAdjustFalse(macdRaw, 9);
    for (let i = 0; i < n; i++) {
      macdSeries[i] = round4(macdRaw[i]);
      macdSignalSeries[i] = round4(signalRaw[i]);
      macdHistSeries[i] = round4(macdRaw[i] - signalRaw[i]);
    }
  }

  // 스토캐스틱 슬로우(15,5,5) + 윌리엄스 %R(19): 외부 리포트가 제시한 과매도 진입 조건
  // (Slow %K 20이하 AND Williams%R -80이하) 검증용. high/low가 모두 있는 호출에서만 계산.
  //
  // Fast %K = (종가 - N일 최저) / (N일 최고 - N일 최저) * 100, N=15
  // Slow %K = Fast %K의 5일 단순이동평균, Slow %D = Slow %K의 5일 단순이동평균
  // Williams %R = (N일 최고 - 종가) / (N일 최고 - N일 최저) * -100, N=19 (범위 0~-100)
  // 0 나누기 방어: N일 최고==최저(가격 변동 없음)이면 해당 지점은 null.
  const STOCH_PERIOD = 15;
  const STOCH_SMOOTH = 5;
  const WILLIAMS_PERIOD = 19;

  const hasHighLow = n > 0 && rows.every((r) => r.high !== undefined && r.low !== undefined);
  const highs = hasHighLow ? rows.map((r) => r.high as number) : [];
  const lows = hasHighLow ? rows.map((r) => r.low as number) : [];

  const fastKSeries: (number | null)[] = new Array(n).fill(null);
  const williamsSeries: (number | null)[] = new Array(n).fill(null);
  if (hasHighLow) {
    for (let i = 0; i < n; i++) {
      const hh15 = rollingMax(highs, i, STOCH_PERIOD);
      const ll15 = rollingMin(lows, i, STOCH_PERIOD);
      if (hh15 !== null && ll15 !== null && hh15 !== ll15) {
        fastKSeries[i] = ((closes[i] - ll15) / (hh15 - ll15)) * 100;
      }

      const hh19 = rollingMax(highs, i, WILLIAMS_PERIOD);
      const ll19 = rollingMin(lows, i, WILLIAMS_PERIOD);
      if (hh19 !== null && ll19 !== null && hh19 !== ll19) {
        williamsSeries[i] = ((hh19 - closes[i]) / (hh19 - ll19)) * -100;
      }
    }
  }
  const slowKSeries: (number | null)[] = fastKSeries.map((_, i) =>
    rollingMeanOfSeries(fastKSeries, i, STOCH_SMOOTH)
  );
  const slowDSeries: (number | null)[] = slowKSeries.map((_, i) =>
    rollingMeanOfSeries(slowKSeries, i, STOCH_SMOOTH)
  );

  const haltedSeries = isHaltedSeries(closes, 5);

  const result: IndicatorValues[] = [];
  for (let i = 0; i < n; i++) {
    const ma5 = rollingMean(closes, i, 5);
    const ma20 = rollingMean(closes, i, 20);
    const ma60 = rollingMean(closes, i, 60);

    const bbMid = ma20;
    const std20 = rollingStdSample(closes, i, 20);
    const bbUpper = bbMid !== null && std20 !== null ? bbMid + 2.0 * std20 : null;
    const bbLower = bbMid !== null && std20 !== null ? bbMid - 2.0 * std20 : null;
    const bbPctB =
      bbUpper !== null && bbLower !== null && bbUpper - bbLower !== 0
        ? ((closes[i] - bbLower) / (bbUpper - bbLower)) * 100
        : null;

    const volMa5 = rollingMean(volumes, i, 5);
    const volMa20 = rollingMean(volumes, i, 20);
    const volRatio5 = volMa5 !== null && volMa5 !== 0 ? (volumes[i] / volMa5) * 100 : null;
    const volRatio20 = volMa20 !== null && volMa20 !== 0 ? (volumes[i] / volMa20) * 100 : null;

    result.push({
      rsi14: rsiSeries[i],
      macd: macdSeries[i],
      macdSignal: macdSignalSeries[i],
      macdHist: macdHistSeries[i],
      bbUpper: round4(bbUpper),
      bbMid: round4(bbMid),
      bbLower: round4(bbLower),
      bbPctB: round4(bbPctB),
      ma5: round4(ma5),
      ma20: round4(ma20),
      ma60: round4(ma60),
      volRatio5: round4(volRatio5),
      volRatio20: round4(volRatio20),
      stochSlowK: round4(slowKSeries[i]),
      stochSlowD: round4(slowDSeries[i]),
      williamsR: round4(williamsSeries[i]),
      isHalted: haltedSeries[i],
    });
  }

  return result;
}

/**
 * (symbol, discovery_date) 하나의 stock_trajectory 전체 행을 다시 읽어 지표를 재계산하고
 * upsert한다. 지표는 과거 데이터에 의존하므로(RSI/MACD/MA60 등) 새로 추가된 행 하나만으로는
 * 계산할 수 없어 항상 전체 시계열을 기준으로 계산한다.
 *
 * OHLCV 원본 컬럼(open/high/low/close/volume/return_from_entry 등)도 함께 그대로 포함해
 * upsert한다 — 기존 값을 재조회 없이 그대로 되돌려 보내는 것이며, 지표 컬럼 외에는 값을
 * 바꾸지 않는다.
 *
 * skipFilled=true이면 이미 rsi14가 채워진 행은 upsert 대상에서 제외한다(백필 재실행 시
 * 불필요한 쓰기 방지용). 일일 자동 갱신에서는 항상 skipFilled=false로 호출해 전체를 갱신한다.
 */
export async function recalculateIndicatorsForDiscovery(
  supabase: SupabaseAdmin,
  symbol: string,
  discoveryDate: string,
  opts: { skipFilled?: boolean } = {}
): Promise<{ rowsUpdated: number; skipped: boolean }> {
  const { data, error } = await supabase
    .from("stock_trajectory")
    .select(
      "symbol,name,discovery_date,trade_date,days_after,open,high,low,close,volume,return_from_entry,is_pre_discovery,rsi14"
    )
    .eq("symbol", symbol)
    .eq("discovery_date", discoveryDate)
    .order("trade_date", { ascending: true });

  if (error) throw error;

  const rows = (data || []) as any[];
  if (rows.length === 0) return { rowsUpdated: 0, skipped: true };

  const series = computeIndicatorSeries(
    rows.map((r) => ({
      tradeDate: r.trade_date,
      close: Number(r.close || 0),
      volume: Number(r.volume || 0),
      // null/누락 시 undefined로 남겨 스토캐스틱·윌리엄스 계산이 hasHighLow 가드로 건너뛰게 한다
      // (0으로 치환하면 최저가가 0으로 왜곡될 수 있어 위험 — round4 null 처리와 같은 취지).
      high: r.high != null ? Number(r.high) : undefined,
      low: r.low != null ? Number(r.low) : undefined,
    }))
  );

  const payload = rows
    .map((row, i) => ({ row, ind: series[i] }))
    .filter(({ row }) => !(opts.skipFilled && row.rsi14 != null))
    .map(({ row, ind }) => ({
      symbol: row.symbol,
      name: row.name,
      discovery_date: row.discovery_date,
      trade_date: row.trade_date,
      days_after: row.days_after,
      open: row.open,
      high: row.high,
      low: row.low,
      close: row.close,
      volume: row.volume,
      return_from_entry: row.return_from_entry,
      is_pre_discovery: row.is_pre_discovery,
      rsi14: ind.rsi14,
      macd: ind.macd,
      macd_signal: ind.macdSignal,
      macd_hist: ind.macdHist,
      bb_upper: ind.bbUpper,
      bb_mid: ind.bbMid,
      bb_lower: ind.bbLower,
      bb_pct_b: ind.bbPctB,
      ma5: ind.ma5,
      ma20: ind.ma20,
      ma60: ind.ma60,
      vol_ratio_5: ind.volRatio5,
      vol_ratio_20: ind.volRatio20,
      stoch_slow_k: ind.stochSlowK,
      stoch_slow_d: ind.stochSlowD,
      williams_r: ind.williamsR,
      is_halted: ind.isHalted,
    }));

  if (payload.length === 0) return { rowsUpdated: 0, skipped: true };

  const { error: upsertErr } = await supabase
    .from("stock_trajectory")
    .upsert(payload, { onConflict: "symbol,discovery_date,trade_date" });

  if (upsertErr) throw upsertErr;

  return { rowsUpdated: payload.length, skipped: false };
}
