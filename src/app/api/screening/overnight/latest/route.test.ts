import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// storage 는 실제 코드를 쓰고 Supabase 만 가짜로 둔다. KIS 경로는 불리면 드러나도록 spy 로 막는다.
const db = vi.hoisted(() => ({
  records: [] as { date: string; reduce_weight: boolean; kosdaq_value: number; items: any[] }[],
  failLatest: false,
}));
const kis = vi.hoisted(() => ({ call: vi.fn(), index: vi.fn(), rank: vi.fn() }));

vi.mock("@/server/kis/auth", () => ({ callKisApi: kis.call }));
vi.mock("@/server/kis/rest-client", () => ({ getDomesticIndexDaily: kis.index, getDomesticVolumeRank: kis.rank }));
vi.mock("@/lib/supabase/client", () => ({
  getSupabaseAdmin: () => ({
    from(table: string) {
      const filters: { eq?: string; lte?: string } = {};
      const q: any = {
        select: () => q,
        eq: (_: string, v: string) => ((filters.eq = v), q),
        lte: (_: string, v: string) => ((filters.lte = v), q),
        order: () => q,
        limit: () => q,
        maybeSingle: async () => ({ data: db.records.find((r) => r.date === filters.eq) ?? null, error: null }),
        then(resolve: (v: unknown) => void) {
          if (table === "overnight_screening_records") {
            if (db.failLatest) return resolve({ data: null, error: new Error("db down") });
            const rows = db.records.filter((r) => r.date <= filters.lte!).sort((a, b) => b.date.localeCompare(a.date));
            return resolve({ data: rows.map((r) => ({ date: r.date })), error: null });
          }
          const items = db.records.find((r) => r.date === filters.eq)?.items ?? [];
          resolve({ data: items.length ? [{ created_at: "2026-11-04T06:41:18.000Z" }] : [], error: null, count: items.length });
        },
      };
      return q;
    },
  }),
}));

import { GET } from "./route";

const item = (symbol: string, classification: string, extra: object = {}) => ({
  symbol,
  name: `종목${symbol}`,
  classification,
  entry_close: 10000,
  reasons: ["사유"],
  tail_ratio: 1.5,
  volume_ratio: 250,
  turnover_rate: 7,
  freshness_count: 3,
  rsi14: 55,
  quant_signal: true,
  ...extra,
});

describe("GET /api/screening/overnight/latest", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-05T02:00:00.000Z")); // 11/5 11:00 KST, 장중
    db.records = [];
    db.failLatest = false;
    global.fetch = vi.fn() as any;
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  const read = async () => {
    const res = await GET();
    return { status: res.status, body: await res.json() };
  };

  it("KIS 를 부르지 않는다", async () => {
    db.records = [{ date: "20261105", reduce_weight: true, kosdaq_value: 700, items: [item("000001", "normal")] }];
    await read();
    expect(kis.call).not.toHaveBeenCalled();
    expect(kis.index).not.toHaveBeenCalled();
    expect(kis.rank).not.toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("오늘 결과가 있으면 오늘로 표시하고 저장 시각을 담는다", async () => {
    db.records = [{ date: "20261105", reduce_weight: true, kosdaq_value: 700, items: [item("000001", "normal")] }];
    const { body } = await read();
    expect(body).toMatchObject({ ok: true, source: "saved", empty: false, tradeDate: "20261105", isToday: true, savedAt: "2026-11-04T06:41:18.000Z" });
  });

  it("오늘 결과가 없으면 직전 거래일을 돌려주고 어느 날짜인지 밝힌다", async () => {
    db.records = [
      { date: "20261103", reduce_weight: true, kosdaq_value: 700, items: [item("000003", "normal")] },
      { date: "20261104", reduce_weight: true, kosdaq_value: 700, items: [item("000004", "normal")] },
    ];
    const { body } = await read();
    expect(body).toMatchObject({ empty: false, tradeDate: "20261104", today: "20261105", isToday: false });
    expect(body.results.normal.map((s: any) => s.symbol)).toEqual(["000004"]);
  });

  it("저장 결과가 아예 없으면 빈 상태다", async () => {
    const { status, body } = await read();
    expect(status).toBe(200);
    expect(body).toMatchObject({ ok: true, empty: true, tradeDate: null, savedAt: null, isToday: false, excludedNotice: [] });
    expect(body.results).toEqual({ normal: [], aggressive: [], exclude: [] });
  });

  it("읽기 실패를 빈 상태로 돌려주지 않는다", async () => {
    db.failLatest = true;
    const { status, body } = await read();
    expect(status).toBe(503);
    expect(body).toEqual({ ok: false, error: "latest_read_failed" });
  });

  it("분류별로 나누고, 저장되지 않은 값은 만들지 않는다", async () => {
    db.records = [{
      date: "20261105",
      reduce_weight: true,
      kosdaq_value: 700,
      items: [
        item("000001", "normal"),
        item("000002", "aggressive"),
        item("000003", "exclude", { tail_ratio: null, volume_ratio: null, freshness_count: null, rsi14: null, quant_signal: false }),
        item("000004", "excludedNotice", { reasons: ["데이터 부족"] }),
      ],
    }];
    const { body } = await read();
    expect(body.results.normal[0]).toMatchObject({ symbol: "000001", price: 10000, metrics: { volumeRatio: 250, tailRatio: 1.5, freshnessCount: 3, rsi14: 55, quantSignal: true } });
    expect(body.results.normal[0].changeRate).toBeUndefined();
    expect(body.results.aggressive[0].symbol).toBe("000002");
    expect(body.results.exclude[0].metrics).toBeUndefined();
    expect(body.excludedNotice).toEqual([{ symbol: "000004", name: "종목000004", reason: "데이터 부족", entryClose: 10000 }]);
    expect(body.kosdaqState).toBeUndefined();
  });
});
