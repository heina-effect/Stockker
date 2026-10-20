import "server-only";

import { getDomesticStockDailyAround, isAfterKSTMarketClose } from "@/server/kis/rest-client";
import { getSupabaseAdmin } from "@/lib/supabase/client";
import { formatKSTDateCompact } from "@/server/screening/storage";
import { recalculateIndicatorsForDiscovery } from "@/server/screening/indicators";
import { fetchAllRows } from "@/server/screening/paginate";
import { withRateLimitRetry } from "@/server/screening/rate-limit-retry";
import { ensureTodayInCalendar, getTradingDaysBetween } from "@/server/screening/trading-calendar";

/**
 * 발굴 종목 궤적(stock_trajectory) 일일 자동 갱신.
 *
 * /api/screening/overnight 실행 완료 직후 호출된다. overnight_screening_items에서
 * 발굴일 기준 32영업일 이내(days_after 0~31)인 종목의 일봉을 조회해 stock_trajectory에
 * upsert한다. 실패해도 오버나이트 스크리닝 응답을 막지 않도록 호출부에서 독립적으로
 * try-catch 처리한다(이 함수 내부는 throw 가능).
 *
 * 가격 기준: getDomesticStockDailyAround(비수정주가)를 사용한다. backfill-trajectory와
 * 동일 기준이며, 오버나이트 스크리닝이 쓰는 getDomesticStockDaily(수정주가)와는 다르다 —
 * 궤적 시계열 안에서 가격 기준이 섞이지 않도록 의도적으로 분리했다. 오버나이트 스크리닝
 * 쪽은 절대 이 기준으로 바꾸지 않는다(동결 대상).
 *
 * days_after 계산(Phase 42 5단계): 기존 "직전 최대값 + 1" 카운터는 스크리닝 실행이 하루라도
 * 빠지면 실제 거래일보다 적게 기록되는 문제가 있었다. trading_calendar(거래일 캘린더)에서
 * 발굴일~처리 대상일 사이의 실제 거래일 목록을 가져와 그 안에서의 인덱스로 계산하도록
 * 바꿔, 공백이 생겨도 라벨이 어긋나지 않게 한다. 또한 "오늘 1행만" upsert하던 방식을
 * "마지막 저장일 다음날부터 처리 대상일까지 전부" upsert로 넓혀, 데이터 공백 자체도 함께
 * 메운다(단, KIS 응답에 해당 날짜 캔들이 없으면 그 날짜만 건너뛴다).
 *
 * 15:30 KST 마감 가드: 장중(15:30 이전) 실행 시 당일 종가는 미확정 값이라(Phase 42 10/8
 * 실험으로 확인), 당일 몫은 쓰지 않고 그 이전까지의 공백만 처리한다. 당일 처리는 다음날
 * 이후 실행에서 자연스럽게 따라잡힌다.
 */

const TRACKING_WINDOW_DAYS_AFTER = 32; // 추적 유지 구간: days_after 0 ~ 31
const MAX_TARGETS = 60;
const LOOKBACK_CALENDAR_DAYS = 55; // 32영업일을 넉넉히 포함하는 캘린더일 여유분

// YYYYMMDD + days → YYYYMMDD (KST 기준, UTC 자정 연산으로 충분. backfill-trajectory/route.ts와 동일 로직)
function addDaysToYYYYMMDD(dateStr: string, days: number): string {
  const y = Number(dateStr.slice(0, 4));
  const m = Number(dateStr.slice(4, 6)) - 1;
  const d = Number(dateStr.slice(6, 8));
  const dt = new Date(Date.UTC(y, m, d + days));
  const yyyy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yyyy}${mm}${dd}`;
}

interface TargetCandidate {
  symbol: string;
  name: string;
  discoveryDate: string;
  entryClose: number;
}

export async function runDailyTrajectoryUpdate(): Promise<void> {
  const startedAt = Date.now();
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    console.warn("[Trajectory Update] Supabase 미구성 — 건너뜀");
    return;
  }

  const todayKey = formatKSTDateCompact(new Date());
  const lookbackKey = addDaysToYYYYMMDD(todayKey, -LOOKBACK_CALENDAR_DAYS);

  // 거래일 캘린더 하루 1회 갱신(지수 일봉 1회 호출, 이미 오늘자가 있으면 호출 자체를 생략).
  let todayIsTradingDay = false;
  try {
    const calendarResult = await ensureTodayInCalendar(todayKey);
    todayIsTradingDay = calendarResult.isTradingDay;
  } catch (e: any) {
    console.warn("[Trajectory Update] 거래일 캘린더 갱신 실패(오늘자는 미확정으로 취급):", e?.message || e);
  }

  // 15:30 이전이거나 오늘이 거래일이 아니면, 이번 실행에서는 "오늘"을 처리 대상에 포함하지
  // 않는다 — 캘린더에서 오늘보다 이전의 가장 최근 거래일까지만 따라잡는다.
  const includeToday = isAfterKSTMarketClose() && todayIsTradingDay;
  const recentTradingDays = await getTradingDaysBetween(lookbackKey, todayKey);
  const effectiveToday = includeToday
    ? todayKey
    : [...recentTradingDays].filter((d) => d < todayKey).pop() ?? lookbackKey;

  const [screeningRes, favRes] = await Promise.all([
    supabase.from("overnight_screening_items").select("symbol,name,date,entry_close").gte("date", lookbackKey),
    supabase.from("trajectory_favorites").select("symbol,discovery_date"),
  ]);

  if (screeningRes.error) throw screeningRes.error;
  if (favRes.error) throw favRes.error;

  // PostgREST 기본 응답 상한(1,000행)에 걸려 결과가 조용히 잘리지 않도록 range() 페이지네이션으로
  // 전체를 확보한다. lookback 윈도우 안의 stock_trajectory 행이 1,000건을 넘으면(실제로 넘었었다 —
  // 손상 사례 확인됨) maxDaysAfterMap이 일부 종목만 누락돼 days_after가 0부터 재시작하는 버그가 있었다.
  const trajRows = await fetchAllRows<{ symbol: string; discovery_date: string; days_after: number; trade_date: string }>(
    (from, to) =>
      supabase
        .from("stock_trajectory")
        .select("symbol,discovery_date,days_after,trade_date")
        .gte("discovery_date", lookbackKey)
        .order("symbol", { ascending: true })
        .order("discovery_date", { ascending: true })
        .order("trade_date", { ascending: true })
        .range(from, to)
  );
  console.log(`[Trajectory Update] stock_trajectory 조회 ${trajRows.length}건 (discovery_date >= ${lookbackKey})`);

  // (symbol, discovery_date)별 현재 최대 days_after(후보 1차 필터용, 기존 카운터 값 그대로
  // 재사용 가능 — 정밀한 윈도우 초과 판정은 처리 루프 안에서 캘린더 기준으로 다시 확인한다)
  // 및 마지막으로 저장된 trade_date(처리 재개 시작점).
  const maxDaysAfterMap = new Map<string, number>();
  const lastStoredTradeDateMap = new Map<string, string>();
  for (const row of trajRows) {
    const key = `${row.symbol}::${row.discovery_date}`;
    const cur = maxDaysAfterMap.get(key);
    if (cur === undefined || row.days_after > cur) maxDaysAfterMap.set(key, row.days_after);
    const curDate = lastStoredTradeDateMap.get(key);
    if (!curDate || row.trade_date > curDate) lastStoredTradeDateMap.set(key, row.trade_date);
  }

  const favoriteKeys = new Set(
    ((favRes.data || []) as any[]).map((r) => `${r.symbol}::${r.discovery_date}`)
  );

  // 추적 대상 후보: 기존 저장값 기준 32영업일 미만 & 처리 대상일 기준 미완료
  const seen = new Set<string>();
  const candidates: TargetCandidate[] = [];
  for (const item of (screeningRes.data || []) as any[]) {
    const key = `${item.symbol}::${item.date}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const lastStored = lastStoredTradeDateMap.get(key);
    if (lastStored && lastStored >= effectiveToday) continue; // 이미 처리 대상일까지 완료

    const maxDaysAfter = maxDaysAfterMap.get(key) ?? -1;
    if (maxDaysAfter >= TRACKING_WINDOW_DAYS_AFTER - 1) continue; // 32영업일(days_after 0~31) 도달, 추적 종료

    candidates.push({
      symbol: item.symbol,
      name: item.name,
      discoveryDate: item.date,
      entryClose: Number(item.entry_close || 0),
    });
  }

  // 우선순위: 즐겨찾기 무조건 포함 → 발굴일 최신순. 상한 초과분은 이번 회차 제외(다음날 재시도)
  candidates.sort((a, b) => {
    const aFav = favoriteKeys.has(`${a.symbol}::${a.discoveryDate}`);
    const bFav = favoriteKeys.has(`${b.symbol}::${b.discoveryDate}`);
    if (aFav !== bFav) return aFav ? -1 : 1;
    return b.discoveryDate.localeCompare(a.discoveryDate);
  });
  const targets = candidates.slice(0, MAX_TARGETS);

  let processed = 0;
  let skipped = 0;

  for (const target of targets) {
    try {
      const key = `${target.symbol}::${target.discoveryDate}`;
      const lastStored = lastStoredTradeDateMap.get(key) ?? null;

      // 발굴일~effectiveToday 사이 실제 거래일 목록(캘린더 기준). lookbackKey가
      // TRACKING_WINDOW_DAYS_AFTER를 넉넉히 포함하므로, 모든 후보의 discoveryDate는 이
      // 배열에 포함돼 있다고 가정한다(벗어나면 스킵).
      const tradingDaysForTarget = recentTradingDays.filter((d) => d >= target.discoveryDate);
      const discIndex = tradingDaysForTarget.indexOf(target.discoveryDate);
      if (discIndex === -1) {
        // 캘린더가 아직 발굴일까지 못 채워졌거나(초기 상태) 발굴일 자체가 거래일로 안 잡힘
        skipped++;
        continue;
      }

      const toProcess = tradingDaysForTarget.filter(
        (d) => d > (lastStored ?? "00000000") && d <= effectiveToday
      );
      if (toProcess.length === 0) {
        skipped++;
        continue;
      }

      // getDomesticStockDailyAround(비수정주가)를 쓴다. backfill-trajectory와 동일 기준이며,
      // 응답 배열 안에 공백 구간 캔들이 이미 포함돼 있어(150봉 페이지네이션) 이 한 번의 호출로
      // toProcess 전체를 채울 수 있다 — 날짜별 추가 호출 불필요.
      const candles = await withRateLimitRetry(() => getDomesticStockDailyAround(target.symbol, todayKey));
      const candleByDate = new Map<string, any>(
        (candles || []).map((c: any) => [String(c.stck_bsop_date), c])
      );

      let wroteAny = false;
      for (const tradeDate of toProcess) {
        const daysAfter = tradingDaysForTarget.indexOf(tradeDate) - discIndex;
        if (daysAfter > TRACKING_WINDOW_DAYS_AFTER - 1) break; // 윈도우 초과분은 쓰지 않음(추적 종료)

        const candle = candleByDate.get(tradeDate);
        if (!candle) continue; // 이 날짜 캔들이 응답에 없음(이례적) — 다음 날짜로 계속

        const close = Number(candle.stck_clpr || 0);
        const returnFromEntry =
          target.entryClose > 0 ? Number((((close - target.entryClose) / target.entryClose) * 100).toFixed(2)) : 0;

        const { error: upsertErr } = await supabase.from("stock_trajectory").upsert(
          {
            symbol: target.symbol,
            name: target.name,
            discovery_date: target.discoveryDate,
            trade_date: tradeDate,
            days_after: daysAfter,
            open: Number(candle.stck_oprc || 0),
            high: Number(candle.stck_hgpr || 0),
            low: Number(candle.stck_lwpr || 0),
            close,
            volume: Number(candle.acml_vol || 0),
            return_from_entry: returnFromEntry,
          },
          { onConflict: "symbol,discovery_date,trade_date" }
        );
        if (upsertErr) throw upsertErr;
        wroteAny = true;
      }

      if (!wroteAny) {
        skipped++;
        continue;
      }
      processed++;

      // 지표는 과거 데이터에 의존하므로(RSI/MACD/MA60 등) 새 행만으로 계산할 수 없어
      // 전체 시계열을 재계산한다. 실패해도 오늘자 OHLCV 저장 자체는 이미 완료된 상태이므로
      // 이 실패가 processed/skipped 집계에 영향을 주지 않도록 별도로 처리한다.
      try {
        await recalculateIndicatorsForDiscovery(supabase, target.symbol, target.discoveryDate, {
          skipFilled: false,
        });
      } catch (indErr: any) {
        console.warn(
          `[Trajectory Update] 지표 재계산 실패 ${target.symbol}(${target.discoveryDate}):`,
          indErr?.message || indErr
        );
      }
    } catch (e: any) {
      skipped++;
      console.warn(`[Trajectory Update] ${target.symbol}(${target.discoveryDate}) 처리 실패:`, e?.message || e);
    }
  }

  const durationMs = Date.now() - startedAt;
  console.log(
    `[Trajectory Update] 처리 ${processed}건 / 건너뜀 ${skipped}건 / 대상 ${targets.length}건 (전체 후보 ${candidates.length}건) / ` +
    `effectiveToday=${effectiveToday}(오늘자 포함=${includeToday}) / 소요 ${durationMs}ms`
  );
}
