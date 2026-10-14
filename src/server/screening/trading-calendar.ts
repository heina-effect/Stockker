import "server-only";

import { getDomesticIndexDaily } from "@/server/kis/rest-client";
import { getSupabaseAdmin } from "@/lib/supabase/client";
import { fetchAllRows } from "@/server/screening/paginate";

/**
 * 거래일 캘린더(trading_calendar) 조회/갱신 헬퍼 — 016 마이그레이션 참고.
 *
 * days_after 계산과 사이클 분리(gapDaysAfter) 양쪽 모두 "두 날짜 사이 실제 거래일 수"가
 * 필요한데, 기존에는 이를 stock_trajectory에 실제로 저장된 행 수로 대신 세고 있어 데이터
 * 공백이 있으면 과소 계산되는 문제가 있었다(Phase 42). 이 모듈은 KIS 코스닥 지수 일봉을
 * 출처로 한 독립적인 거래일 목록을 제공해 그 문제를 근본적으로 해소한다.
 */

const KOSDAQ_INDEX_CODE = "1001";

/**
 * fromDate~toDate(YYYYMMDD, 양끝 포함) 사이의 실제 거래일 목록을 오름차순으로 반환한다.
 *
 * 016 마이그레이션이 아직 적용되지 않았거나(테이블 없음) 조회 중 오류가 나면 예외를 던지지
 * 않고 빈 배열을 반환한다 — 호출부(tracking/route.ts, trajectory-update.ts)가 이미 "캘린더
 * 공백 시 gap=0으로 안전 처리"하는 폴백을 갖고 있어, 이 함수가 503을 던지면 마이그레이션
 * 적용 전까지 전체 API가 깨지는 것보다 빈 배열로 안전하게 저하되는 쪽이 낫다.
 */
export async function getTradingDaysBetween(fromDate: string, toDate: string): Promise<string[]> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return [];
  try {
    const rows = await fetchAllRows<{ trade_date: string }>((from, to) =>
      supabase
        .from("trading_calendar")
        .select("trade_date")
        .gte("trade_date", fromDate)
        .lte("trade_date", toDate)
        .order("trade_date", { ascending: true })
        .range(from, to)
    );
    return rows.map((r) => r.trade_date);
  } catch (e: any) {
    console.warn("[TradingCalendar] 조회 실패(마이그레이션 미적용 가능성) — 빈 배열로 대체:", e?.message || e);
    return [];
  }
}

/**
 * fromDate~toDate 사이의 실제 거래일 수(경과 거래일수, fromDate 자체가 0일차).
 * 캘린더에 두 날짜가 모두 없거나 구간이 비어 있으면 0을 반환한다(호출부에서 별도 처리 필요).
 */
export async function countTradingDaysBetween(fromDate: string, toDate: string): Promise<number> {
  const dates = await getTradingDaysBetween(fromDate, toDate);
  return Math.max(0, dates.length - 1);
}

/**
 * 코스닥 지수 일봉을 fromDate~toDate 범위로 페이지네이션 조회해 trading_calendar에 upsert한다.
 * 소급 백필(backfill-trading-calendar 라우트)과 아래 ensureTodayInCalendar가 공유한다.
 */
export async function backfillTradingCalendar(
  fromDate: string,
  toDate: string
): Promise<{ upserted: number; dates: string[] }> {
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error("Supabase 미구성");

  // 기본값(130/4)은 거시필터의 120일 MA용 튜닝값이라 연간 전체(~240거래일) 소급엔 부족해
  // 넉넉한 값으로 직접 지정한다(50봉/페이지 기준 8페이지 ≈ 400거래일 여유).
  const candles = await getDomesticIndexDaily(KOSDAQ_INDEX_CODE, { anchorDate: toDate, targetCount: 260, maxPages: 8 });
  const dates = [...new Set(candles.map((c: any) => String(c.stck_bsop_date || "")).filter(Boolean))]
    .filter((d) => d >= fromDate && d <= toDate)
    .sort();

  if (dates.length === 0) return { upserted: 0, dates: [] };

  const rows = dates.map((trade_date) => ({ trade_date, source: "kosdaq_index" }));
  const { error } = await supabase.from("trading_calendar").upsert(rows, { onConflict: "trade_date" });
  if (error) throw error;

  return { upserted: rows.length, dates };
}

/**
 * 오늘(todayKey)이 캘린더에 이미 있으면 그대로 true. 없으면 지수 일봉을 가볍게 1회(1페이지,
 * 최대 1봉)만 조회해 오늘이 실제 거래일인지 확인하고, 거래일이면 upsert한다 — 하루에 종목별
 * 여러 번 호출돼도 지수 조회는 최초 1회만 발생한다(이후 호출은 "이미 있음"으로 즉시 반환).
 */
export async function ensureTodayInCalendar(todayKey: string): Promise<{ isTradingDay: boolean }> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { isTradingDay: false };

  try {
    const { data: existing, error: selectErr } = await supabase
      .from("trading_calendar")
      .select("trade_date")
      .eq("trade_date", todayKey)
      .maybeSingle();
    if (selectErr) throw selectErr;
    if (existing) return { isTradingDay: true };

    const candles = await getDomesticIndexDaily(KOSDAQ_INDEX_CODE, {
      anchorDate: todayKey,
      targetCount: 1,
      maxPages: 1,
    });
    const isTradingDay = candles.some((c: any) => String(c.stck_bsop_date || "") === todayKey);
    if (isTradingDay) {
      const { error: upsertErr } = await supabase
        .from("trading_calendar")
        .upsert({ trade_date: todayKey, source: "kosdaq_index" }, { onConflict: "trade_date" });
      if (upsertErr) throw upsertErr;
    }
    return { isTradingDay };
  } catch (e: any) {
    console.warn("[TradingCalendar] 오늘자 갱신 실패(마이그레이션 미적용 가능성):", e?.message || e);
    return { isTradingDay: false };
  }
}
