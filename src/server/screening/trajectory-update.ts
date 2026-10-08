import "server-only";

import { getDomesticStockDailyAround } from "@/server/kis/rest-client";
import { getSupabaseAdmin } from "@/lib/supabase/client";
import { formatKSTDateCompact } from "@/server/screening/storage";
import { recalculateIndicatorsForDiscovery } from "@/server/screening/indicators";
import { fetchAllRows } from "@/server/screening/paginate";
import { withRateLimitRetry } from "@/server/screening/rate-limit-retry";

/**
 * 발굴 종목 궤적(stock_trajectory) 일일 자동 갱신.
 *
 * /api/screening/overnight 실행 완료 직후 호출된다. overnight_screening_items에서
 * 발굴일 기준 32영업일 이내(days_after 0~31)인 종목의 오늘 일봉을 조회해
 * stock_trajectory에 upsert한다. 실패해도 오버나이트 스크리닝 응답을 막지 않도록
 * 호출부에서 독립적으로 try-catch 처리한다(이 함수 내부는 throw 가능).
 *
 * 가격 기준: getDomesticStockDailyAround(비수정주가)를 사용한다. backfill-trajectory와
 * 동일 기준이며, 오버나이트 스크리닝이 쓰는 getDomesticStockDaily(수정주가)와는 다르다 —
 * 궤적 시계열 안에서 가격 기준이 섞이지 않도록 의도적으로 분리했다. 오버나이트 스크리닝
 * 쪽은 절대 이 기준으로 바꾸지 않는다(동결 대상).
 */

// 2026-09-11: tracking/route.ts의 추적 종료 재설계(0~10 판단유효/11~30 결과관찰/30초과 종료,
// CYCLE_RESET_DAYS_AFTER=30)와 정렬 — "결과 관찰(11~30영업일)" 구간도 현재가가 계속 갱신되도록
// 창을 15→32영업일로 넓혔다(30을 살짝 넘겨야 "완전 종료" 상태로도 최소 1회 전환 관측 가능).
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

  // (symbol, discovery_date)별 현재 최대 days_after 및 오늘자 행 존재 여부
  const maxDaysAfterMap = new Map<string, number>();
  const hasTodayRow = new Set<string>();
  for (const row of trajRows) {
    const key = `${row.symbol}::${row.discovery_date}`;
    const cur = maxDaysAfterMap.get(key);
    if (cur === undefined || row.days_after > cur) maxDaysAfterMap.set(key, row.days_after);
    if (String(row.trade_date) === todayKey) hasTodayRow.add(key);
  }

  const favoriteKeys = new Set(
    ((favRes.data || []) as any[]).map((r) => `${r.symbol}::${r.discovery_date}`)
  );

  // 추적 대상 후보: 15영업일 미만 & 오늘자 미처리
  const seen = new Set<string>();
  const candidates: TargetCandidate[] = [];
  for (const item of (screeningRes.data || []) as any[]) {
    const key = `${item.symbol}::${item.date}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (hasTodayRow.has(key)) continue; // 이미 오늘자 처리됨(중복 호출 방지)

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
      // getDomesticStockDaily(수정주가)가 아니라 getDomesticStockDailyAround(비수정주가)를 쓴다.
      // backfill-trajectory가 이미 비수정주가로 5,300여 행을 저장해뒀으므로, 같은 종목의 궤적
      // 시계열 안에서 가격 기준이 혼재되지 않도록(배당락·액면분할 등 조정 이벤트가 있으면
      // 이평선/볼린저/MACD가 오염됨) 이 파일도 동일 기준으로 통일한다. anchorDate는 오늘 날짜를
      // 넘기면 함수 내부에서 "오늘"로 캡되어 최신 봉까지 페이지네이션된다.
      const candles = await withRateLimitRetry(() => getDomesticStockDailyAround(target.symbol, todayKey));
      const todayCandle = (candles || []).find((c: any) => String(c.stck_bsop_date) === todayKey);
      if (!todayCandle) {
        // 오늘 확정된 일봉이 아직 없음 (휴장일 또는 데이터 미확정)
        skipped++;
        continue;
      }

      const key = `${target.symbol}::${target.discoveryDate}`;
      const newDaysAfter = (maxDaysAfterMap.get(key) ?? -1) + 1;
      const close = Number(todayCandle.stck_clpr || 0);
      const returnFromEntry =
        target.entryClose > 0 ? Number((((close - target.entryClose) / target.entryClose) * 100).toFixed(2)) : 0;

      const { error: upsertErr } = await supabase.from("stock_trajectory").upsert(
        {
          symbol: target.symbol,
          name: target.name,
          discovery_date: target.discoveryDate,
          trade_date: todayKey,
          days_after: newDaysAfter,
          open: Number(todayCandle.stck_oprc || 0),
          high: Number(todayCandle.stck_hgpr || 0),
          low: Number(todayCandle.stck_lwpr || 0),
          close,
          volume: Number(todayCandle.acml_vol || 0),
          return_from_entry: returnFromEntry,
        },
        { onConflict: "symbol,discovery_date,trade_date" }
      );
      if (upsertErr) throw upsertErr;
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
    `[Trajectory Update] 처리 ${processed}건 / 건너뜀 ${skipped}건 / 대상 ${targets.length}건 (전체 후보 ${candidates.length}건) / 소요 ${durationMs}ms`
  );
}
