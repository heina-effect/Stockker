import { NextResponse } from "next/server";
import {
  formatKSTDateCompact,
  getLatestScreeningResult,
  getScreeningSavedInfo,
  type ScreeningResultItem,
} from "@/server/screening/storage";
import { OVERNIGHT_DISCLAIMER } from "@/lib/screening/saved-result";

export const dynamic = "force-dynamic";

// 화면 열람 경로(2026-11-05). 저장된 결과만 읽는다 — KIS 를 부르지 않고 캐시도 건드리지 않는다.
// 실행 경로는 GET /api/screening/overnight 그대로다.
// 저장 컬럼에 없는 값은 만들지 않는다. 등락률은 저장되지 않아 응답에 없고, 지수 상태는 market-state 가 따로 준다.

function toStock(item: ScreeningResultItem) {
  const { tailRatio, volumeRatio, freshnessCount } = item;
  return {
    symbol: item.symbol,
    name: item.name,
    price: item.entryClose,
    classification: item.classification,
    reasons: item.reasons,
    // 조회 실패로 제외된 종목은 지표가 없다
    ...(tailRatio == null || volumeRatio == null || freshnessCount == null
      ? {}
      : { metrics: { volumeRatio, tailRatio, freshnessCount, rsi14: item.rsi14 ?? null, quantSignal: item.quantSignal === true } }),
  };
}

export async function GET() {
  const today = formatKSTDateCompact(new Date());
  try {
    const record = await getLatestScreeningResult(today);
    const base = { ok: true, source: "saved", today, disclaimer: OVERNIGHT_DISCLAIMER };
    if (!record) {
      return NextResponse.json({
        ...base,
        empty: true,
        tradeDate: null,
        savedAt: null,
        isToday: false,
        results: { normal: [], aggressive: [], exclude: [] },
        excludedNotice: [],
      });
    }

    const savedInfo = await getScreeningSavedInfo(record.date);
    const byClass = (classification: ScreeningResultItem["classification"]) =>
      record.items.filter((item) => item.classification === classification);
    return NextResponse.json({
      ...base,
      empty: false,
      tradeDate: record.date,
      savedAt: savedInfo?.savedAt ?? null,
      isToday: record.date === today,
      results: {
        normal: byClass("normal").map(toStock),
        aggressive: byClass("aggressive").map(toStock),
        exclude: byClass("exclude").map(toStock),
      },
      excludedNotice: byClass("excludedNotice").map((item) => ({
        symbol: item.symbol,
        name: item.name,
        reason: item.reasons[0] ?? "",
        entryClose: item.entryClose,
      })),
    });
  } catch (e) {
    // 읽기 실패를 빈 상태로 돌려주지 않는다 — "저장 결과 없음"과 "읽지 못함"은 다르다
    const detail = (e as Error)?.message || String(e);
    console.error("[Overnight Latest API] Read failed:", detail);
    return NextResponse.json({ ok: false, error: "latest_read_failed" }, { status: 503 });
  }
}
