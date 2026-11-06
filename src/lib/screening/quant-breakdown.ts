// 퀀트 신호 3일차 결과의 집계(2026-11-06). 표본이 작아 헤드라인에는 건수만 쓰고, 이 분해는 접기 안에만 둔다.
// 수치는 응답마다 항목에서 계산한다. 결과가 더 들어오면 값이 바뀌므로 어디에도 적어 두지 않는다.

// 이 건수 미만은 통계를 내지 않고 개별 수익률만 보인다
export const MIN_STAT_RESULTS = 5;

export interface ExitStats {
  n: number;
  winCount: number;
  lossCount: number;
  winRatePct: number | null;
  profitFactor: number;
  expectancy: number;
  kellyPct: number | null;
}

// 청산 규칙별 성과 집계 — 어떤 규칙이든 "거래당 수익률 배열" 하나로 환원해 같은 산식을 쓴다.
//   승률     = (수익률 > 0 인 건수) / n          ← ±10% 임계값은 승패 판정에 쓰지 않는다
//   손익비   = 승 수익 합 / |패 손실 합|
//   기대값   = (승 수익 합 - 패 손실 합) / n     ( = 거래당 평균 수익률)
//   Kelly    = W - (1-W)/R,  W=승률, R=평균승/평균패 (음수면 "베팅하지 말라"는 뜻)
export function computeExitStats(values: number[]): ExitStats {
  const n = values.length;
  if (n === 0) {
    return { n: 0, winCount: 0, lossCount: 0, winRatePct: null, profitFactor: 0, expectancy: 0, kellyPct: null };
  }
  const wins = values.filter((v) => v > 0);
  const losses = values.filter((v) => v < 0);
  const grossProfit = wins.reduce((a, b) => a + b, 0);
  const grossLoss = losses.reduce((a, b) => a + Math.abs(b), 0);
  const winRate = wins.length / n;
  const profitFactor = grossLoss > 0 ? Number((grossProfit / grossLoss).toFixed(2)) : grossProfit > 0 ? 99.99 : 0;
  const expectancy = Number(((grossProfit - grossLoss) / n).toFixed(2));
  // Kelly는 평균승/평균패 비율(R)이 필요하므로 승·패가 모두 1건 이상일 때만 정의된다.
  let kellyPct: number | null = null;
  if (wins.length > 0 && losses.length > 0) {
    const avgWin = grossProfit / wins.length;
    const avgLoss = grossLoss / losses.length;
    const payoffRatio = avgWin / avgLoss;
    kellyPct = Number(((winRate - (1 - winRate) / payoffRatio) * 100).toFixed(1));
  }
  return {
    n,
    winCount: wins.length,
    lossCount: n - wins.length, // 0%는 패로 집계(종전 관례 유지)
    winRatePct: Number((winRate * 100).toFixed(1)),
    profitFactor,
    expectancy,
    kellyPct,
  };
}

export interface QuantBreakdownRow {
  label: string;
  total: number; // 이 구간의 건수(대기 포함). 최고·최저 제외 줄은 결과 건수와 같다
  values: number[]; // 3일차 수익률
  stats: ExitStats | null; // null = 결과 5건 미만, 통계 불가
  netExpectancy: number | null; // 왕복 비용 차감 기대값
}

function row(label: string, total: number, values: number[], costPct: number): QuantBreakdownRow {
  if (values.length < MIN_STAT_RESULTS) return { label, total, values, stats: null, netExpectancy: null };
  const net = values.map((v) => Number((v - costPct).toFixed(2)));
  return { label, total, values, stats: computeExitStats(values), netExpectancy: computeExitStats(net).expectancy };
}

export interface QuantBreakdownInput {
  exitDay3Pct: number | null;
  volumeBasis: string;
  judgedAt: string;
  duplicateOf?: string | null;
}

// 같은 종목이 보유 구간 안에 또 신호를 내면 관측 구간이 겹쳐 독립 표본이 아니다. 발굴일 순으로 훑어, 마지막으로
// 집계에 센 건의 3일차가 지나지 않았으면 중복으로 친다. 지났으면 다시 세므로 연속 신호는 보유 구간이 끝날 때마다
// 새로 센다. 거래일 캘린더로 세고, 3일차 당일의 재신호는 아직 지나지 않은 것으로 본다.
// 돌려주는 값은 "symbol::발굴일" → 그 건이 겹친 집계 건의 발굴일이다.
export function findDuplicateSignals(
  items: { symbol: string; discoveryDate: string }[],
  tradingDays: string[],
  holdDays: number
): Map<string, string> {
  const duplicates = new Map<string, string>();
  const lastCounted = new Map<string, string>();
  for (const { symbol, discoveryDate } of [...items].sort((a, b) => a.discoveryDate.localeCompare(b.discoveryDate))) {
    const counted = lastCounted.get(symbol);
    // 당일이 아직 캘린더에 없어도 어긋나지 않도록 사이의 거래일만 세고 당일을 더한다
    const elapsed = counted ? tradingDays.filter((d) => d > counted && d < discoveryDate).length + 1 : null;
    if (counted && elapsed !== null && elapsed <= holdDays) duplicates.set(`${symbol}::${discoveryDate}`, counted);
    else lastCounted.set(symbol, discoveryDate);
  }
  return duplicates;
}

const TIME_BUCKETS = ["15:30 이전", "15:30~15:40", "15:40~16:00", "16시 이후"] as const;

export function judgedTimeBucket(judgedAt: string): (typeof TIME_BUCKETS)[number] {
  const clock = new Date(judgedAt).toLocaleTimeString("en-GB", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", hour12: false });
  if (clock < "15:30") return "15:30 이전";
  if (clock < "15:40") return "15:30~15:40";
  if (clock < "16:00") return "15:40~16:00";
  return "16시 이후";
}

export function buildQuantBreakdown(items: QuantBreakdownInput[], costPct: number) {
  const valuesOf = (list: QuantBreakdownInput[]) =>
    list.flatMap((i) => (i.exitDay3Pct != null ? [i.exitDay3Pct] : []));
  const group = (label: string, list: QuantBreakdownInput[]) => row(label, list.length, valuesOf(list), costPct);
  // 표의 모든 줄은 중복을 뺀 집계다. 중복을 넣은 값은 비교용 한 줄로만 낸다
  const counted = items.filter((i) => !i.duplicateOf);
  const duplicates = items.filter((i) => i.duplicateOf);
  const sorted = valuesOf(counted).sort((a, b) => a - b);

  return {
    duplicateCount: duplicates.length,
    duplicateResultCount: valuesOf(duplicates).length,
    withDuplicates: group("전체(중복 포함)", items),
    sensitivity: [
      row("전체", counted.length, sorted, costPct),
      row("최고 1건 제외", sorted.length - 1, sorted.slice(0, -1), costPct),
      row("최저 1건 제외", sorted.length - 1, sorted.slice(1), costPct),
      row("둘 다 제외", sorted.length - 2, sorted.slice(1, -1), costPct),
    ],
    byBasis: [
      group("당일 제외(excl_today)", counted.filter((i) => i.volumeBasis === "excl_today")),
      group("당일 포함(incl_today)", counted.filter((i) => i.volumeBasis === "incl_today")),
    ],
    byTime: TIME_BUCKETS.map((bucket) => group(bucket, counted.filter((i) => judgedTimeBucket(i.judgedAt) === bucket))),
  };
}

export type QuantBreakdown = ReturnType<typeof buildQuantBreakdown>;
