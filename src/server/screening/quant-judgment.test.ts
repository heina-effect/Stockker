import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// 표는 PRIMARY KEY (date, symbol) + ON CONFLICT DO NOTHING 처럼 동작하는 가짜다
const db = vi.hoisted(() => ({
  table: new Map<string, any>(),
  calls: [] as { name: string; options: unknown }[],
  error: null as null | Error,
  configured: true,
}));
vi.mock("@/lib/supabase/client", () => ({
  getSupabaseAdmin: () =>
    db.configured
      ? {
          from: (name: string) => ({
            upsert: async (rows: any[], options: { ignoreDuplicates?: boolean }) => {
              db.calls.push({ name, options });
              if (db.error) return { error: db.error };
              for (const row of rows) {
                const key = `${row.date}:${row.symbol}`;
                if (!db.table.has(key) || !options.ignoreDuplicates) db.table.set(key, row);
              }
              return { error: null };
            },
          }),
        }
      : null,
}));

import { buildQuantJudgmentRows, QUANT_CRITERIA_VERSION, recordQuantJudgments } from "./quant-judgment";

const stock = (symbol: string, quantSignal: boolean) => ({
  symbol,
  metrics: { rsi14: 55, quantSignal, latestIndicator: { volRatio20: 250 }, day0Close: 10000, currentVolume: 123456 },
});

describe("buildQuantJudgmentRows", () => {
  it("판정에 쓴 값과 고정 값을 넣는다", () => {
    expect(buildQuantJudgmentRows("20261106", "2026-11-06T06:41:01.000Z", [stock("000001", true)])).toEqual([{
      date: "20261106",
      symbol: "000001",
      judged_at: "2026-11-06T06:41:01.000Z",
      rsi14: 55,
      vol_ratio_20: 250,
      volume_basis: "incl_today",
      close_at_judgment: 10000,
      volume_at_judgment: 123456,
      quant_signal: true,
      criteria_version: "rsi50-60_vol200-400_wilder",
      source: "live",
    }]);
    expect(QUANT_CRITERIA_VERSION).toBe("rsi50-60_vol200-400_wilder");
  });

  it("true 와 false 를 모두 남긴다", () => {
    const rows = buildQuantJudgmentRows("20261106", "t", [stock("000001", true), stock("000002", false)]);
    expect(rows.map((r) => [r.symbol, r.quant_signal])).toEqual([["000001", true], ["000002", false]]);
  });

  it("지표가 없는 값은 NULL 로 남기고 false 로 친다", () => {
    const [row] = buildQuantJudgmentRows("20261106", "t", [{ symbol: "000001", metrics: { rsi14: null } }]);
    expect(row).toMatchObject({ rsi14: null, vol_ratio_20: null, close_at_judgment: null, volume_at_judgment: null, quant_signal: false });
  });

  it("조회 실패로 지표가 없는 종목은 판정한 것이 아니라 뺀다", () => {
    expect(buildQuantJudgmentRows("20261106", "t", [{ symbol: "000001" }])).toEqual([]);
  });
});

describe("recordQuantJudgments", () => {
  beforeEach(() => {
    db.table.clear();
    db.calls = [];
    db.error = null;
    db.configured = true;
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it("(date, symbol) 충돌을 무시하도록 upsert 한다", async () => {
    await recordQuantJudgments(buildQuantJudgmentRows("20261106", "t", [stock("000001", true)]));
    expect(db.calls).toEqual([{ name: "quant_signal_judgments", options: { onConflict: "date,symbol", ignoreDuplicates: true } }]);
  });

  it("같은 날 두 번째 호출에서 첫 기록이 유지되고 새 종목만 더해진다", async () => {
    await recordQuantJudgments(buildQuantJudgmentRows("20261106", "first", [stock("000001", true)]));
    await recordQuantJudgments(buildQuantJudgmentRows("20261106", "second", [stock("000001", false), stock("000002", true)]));
    expect(db.table.get("20261106:000001")).toMatchObject({ judged_at: "first", quant_signal: true });
    expect(db.table.get("20261106:000002")).toMatchObject({ judged_at: "second" });
  });

  it("기록 실패는 던지지 않고 로그로 남긴다", async () => {
    db.error = new Error("table missing");
    await expect(recordQuantJudgments(buildQuantJudgmentRows("20261106", "t", [stock("000001", true)]))).resolves.toBeUndefined();
    expect(vi.mocked(console.error)).toHaveBeenCalledWith("[Quant Judgment] Record failed:", "table missing");
  });

  it("Supabase 미구성이거나 행이 없으면 부르지 않는다", async () => {
    await recordQuantJudgments([]);
    db.configured = false;
    await recordQuantJudgments(buildQuantJudgmentRows("20261106", "t", [stock("000001", true)]));
    expect(db.calls).toEqual([]);
  });
});
