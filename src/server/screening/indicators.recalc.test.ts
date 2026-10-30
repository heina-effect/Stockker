import { describe, expect, it, vi } from "vitest";
import { recalculateIndicatorsForDiscovery } from "./indicators";
import type { SupabaseAdmin } from "@/lib/supabase/client";

// 재계산 입력 부족 가드(2026-10-30) — 발견일 이전 히스토리 없이 저장된 궤적에서 재계산이
// 스크리닝 시점에 채운 day0 지표를 null로 덮던 문제의 회귀 방지.

function makeRows(n: number, day0Rsi: number | null) {
  return Array.from({ length: n }, (_, i) => ({
    symbol: "079650",
    name: "서산",
    discovery_date: "20261029",
    trade_date: `2026${String(1100 + i).padStart(4, "0")}`,
    days_after: i,
    open: 1000 + i,
    high: 1010 + i,
    low: 990 + i,
    close: 1000 + (i % 3) * 10 + i,
    volume: 10000 + i * 100,
    return_from_entry: 0,
    is_pre_discovery: false,
    rsi14: i === 0 ? day0Rsi : null,
    macd: i === 0 ? 1.5 : null,
    macd_signal: null,
    macd_hist: null,
    bb_upper: null,
    bb_mid: null,
    bb_lower: null,
    bb_pct_b: null,
    ma5: null,
    ma20: null,
    ma60: i === 0 ? 900 : null,
    vol_ratio_5: null,
    vol_ratio_20: i === 0 ? 338.8279 : null,
    stoch_slow_k: null,
    stoch_slow_d: null,
    williams_r: null,
  }));
}

function fakeSupabase(rows: unknown[]) {
  const upsert = vi.fn().mockResolvedValue({ error: null });
  const query = {
    select: () => query,
    eq: () => query,
    order: () => Promise.resolve({ data: rows, error: null }),
    upsert,
  };
  const supabase = { from: () => query } as unknown as SupabaseAdmin;
  return { supabase, upsert };
}

describe("recalculateIndicatorsForDiscovery 입력 부족 가드", () => {
  it("종가 행이 15개 미만이면 재계산·쓰기를 하지 않는다", async () => {
    const { supabase, upsert } = fakeSupabase(makeRows(2, 57.4057));
    const result = await recalculateIndicatorsForDiscovery(supabase, "079650", "20261029");
    expect(result).toEqual({ rowsUpdated: 0, skipped: true });
    expect(upsert).not.toHaveBeenCalled();
  });

  it("길이가 충분해도 계산값이 null인 지표는 기존 day0 값을 유지한다", async () => {
    const { supabase, upsert } = fakeSupabase(makeRows(20, 57.4057));
    await recalculateIndicatorsForDiscovery(supabase, "079650", "20261029");
    const payload = upsert.mock.calls[0][0] as Record<string, unknown>[];
    const day0 = payload.find((r) => r.days_after === 0)!;
    expect(day0.rsi14).toBe(57.4057);
    expect(day0.macd).toBe(1.5);
    expect(day0.ma60).toBe(900);
    expect(day0.vol_ratio_20).toBe(338.8279);
    // 앞쪽 입력이 충분한 행(index 14 이상)은 정상적으로 계산된다
    expect(payload.find((r) => r.days_after === 14)!.rsi14).not.toBeNull();
    // 가격 컬럼은 저장값 그대로
    expect(day0.close).toBe(1000);
  });
});
