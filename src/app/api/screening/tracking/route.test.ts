import { beforeEach, describe, expect, it, vi } from "vitest";

// 표 이름별 행을 돌려주는 가짜 Supabase. eq·in·gte 만 실제로 거른다
const db = vi.hoisted(() => ({
  tables: {} as Record<string, any[]>,
  queried: [] as string[],
  fail: new Set<string>(),
}));

vi.mock("@/lib/supabase/client", () => ({
  getSupabaseAdmin: () => ({
    from(table: string) {
      db.queried.push(table);
      const filters: ((row: any) => boolean)[] = [];
      let window: [number, number] = [0, 999];
      const q: any = {
        select: () => q,
        eq: (col: string, v: unknown) => (filters.push((r) => r[col] === v), q),
        in: (col: string, list: unknown[]) => (filters.push((r) => list.includes(r[col])), q),
        gte: (col: string, v: string) => (filters.push((r) => r[col] >= v), q),
        order: () => q,
        range: (from: number, to: number) => ((window = [from, to]), q),
        then(resolve: (v: unknown) => void) {
          if (db.fail.has(table)) return resolve({ data: null, error: { message: `${table} down` } });
          const rows = (db.tables[table] ?? []).filter((r) => filters.every((f) => f(r)));
          resolve({ data: rows.slice(window[0], window[1] + 1), error: null });
        },
      };
      return q;
    },
  }),
}));
vi.mock("@/server/screening/storage", () => ({ formatKSTDateCompact: () => "20261106" }));
vi.mock("@/server/screening/trading-calendar", () => ({
  getTradingDaysBetween: async () => ["20261102", "20261103", "20261104", "20261105", "20261106"],
}));
vi.mock("@/server/screening/trajectory-update", () => ({ TRACKING_WINDOW_DAYS_AFTER: 31 }));

import { GET } from "./route";

const judgment = (symbol: string, date: string, quant_signal: boolean, extra: object = {}) => ({
  symbol, date, quant_signal, judged_at: `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6)}T06:41:00Z`,
  rsi14: 55, vol_ratio_20: 250, volume_basis: "incl_today", ...extra,
});
const traj = (symbol: string, discovery_date: string, trade_date: string, days_after: number, close: number, extra: object = {}) => ({
  symbol, name: `종목${symbol}`, discovery_date, trade_date, days_after, close, is_halted: false, rsi14: 55, vol_ratio_20: 250, ...extra,
});
const series = (symbol: string, closes: number[]) =>
  closes.map((close, i) => traj(symbol, "20261102", ["20261102", "20261103", "20261104", "20261105", "20261106"][i], i, close));

async function read() {
  const res = await GET();
  return { status: res.status, body: await res.json() };
}

describe("GET /api/screening/tracking — A트랙 선정", () => {
  beforeEach(() => {
    db.queried = [];
    db.fail.clear();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    db.tables = {
      overnight_screening_items: [],
      quant_signal_judgments: [
        judgment("000001", "20261102", true),
        judgment("000002", "20261102", false),
        judgment("000003", "20261106", true),
      ],
      stock_trajectory: [
        ...series("000001", [1000, 1010, 1020, 1100, 1090]),
        ...series("000002", [1000, 1010, 1020, 1100, 1090]),
        traj("000003", "20261106", "20261106", 0, 500),
      ],
      a_track_legacy_snapshot_20261106: [],
    };
  });

  it("선정이 판정 기록에서 온다", async () => {
    const { body } = await read();
    expect(db.queried).toContain("quant_signal_judgments");
    expect(body.quantSignalItems.map((i: any) => i.symbol).sort()).toEqual(["000001", "000003"]);
  });

  it("판정 false 는 목록에 없다. 궤적 지표가 조건 안이어도 그렇다", async () => {
    const { body } = await read();
    expect(body.quantSignalItems.some((i: any) => i.symbol === "000002")).toBe(false);
  });

  it("판정 기록이 없으면 지표가 조건 안이어도 목록에 없다", async () => {
    db.tables.quant_signal_judgments = [];
    const { body } = await read();
    expect(body.quantSignalItems).toEqual([]);
  });

  it("지표가 교정돼도 목록과 표시값이 바뀌지 않는다", async () => {
    const before = (await read()).body.quantSignalItems;
    db.tables.stock_trajectory = db.tables.stock_trajectory.map((r) => ({ ...r, rsi14: 99, vol_ratio_20: 9 }));
    const after = (await read()).body.quantSignalItems;
    expect(after).toEqual(before);
    expect(after.find((i: any) => i.symbol === "000001")).toMatchObject({ rsi14: 55, volumeRatio: 250 });
  });

  it("수익률은 궤적의 확정 종가 기준이다", async () => {
    db.tables.quant_signal_judgments[0] = judgment("000001", "20261102", true, { close_at_judgment: 900 });
    const item = (await read()).body.quantSignalItems.find((i: any) => i.symbol === "000001");
    expect(item).toMatchObject({ entryClose: 1000, exitDay3Pct: 10 });
  });

  it("대기 건은 결과 집계에서 빠진다", async () => {
    const { body } = await read();
    expect(body.quantSignalStats).toMatchObject({ totalCount: 2, resultCount: 1, observingExcludedCount: 1 });
    expect(body.quantBreakdown.sensitivity[0]).toMatchObject({ total: 2, values: [10], stats: null });
  });

  it("결과 5건 미만은 통계 없이 온다", async () => {
    const { body } = await read();
    expect(body.quantBreakdown.byBasis[1]).toMatchObject({ total: 2, values: [10], stats: null, netExpectancy: null });
  });

  it("day0 궤적이 없는 판정은 건너뛰고 경고한다", async () => {
    db.tables.quant_signal_judgments.push(judgment("000009", "20261102", true));
    const { body } = await read();
    expect(body.quantSignalItems.some((i: any) => i.symbol === "000009")).toBe(false);
    expect(vi.mocked(console.warn)).toHaveBeenCalledWith(expect.stringContaining("000009"));
  });

  it("중복 신호는 목록에 남고 수익률 집계에서 빠진다", async () => {
    db.tables.quant_signal_judgments = [judgment("000001", "20261102", true), judgment("000001", "20261103", true)];
    db.tables.stock_trajectory = [
      ...series("000001", [1000, 1000, 1020, 1100, 2000]),
      traj("000001", "20261103", "20261103", 0, 1000),
    ];
    const { body } = await read();
    const items = body.quantSignalItems;
    expect(items.map((i: any) => [i.discoveryDate, i.duplicateOf])).toEqual([["20261103", "20261102"], ["20261102", null]]);
    expect(items.map((i: any) => i.exitDay3Pct)).toEqual([100, 10]);
    expect(body.quantSignalStats).toMatchObject({ totalCount: 2, resultCount: 2 });
    expect(body.quantSignalStats.exitDay3).toMatchObject({ n: 1, expectancy: 10 });
    expect(body.quantBreakdown).toMatchObject({ duplicateCount: 1, duplicateResultCount: 1 });
    expect(body.quantBreakdown.sensitivity[0].values).toEqual([10]);
  });

  it("판정 기록을 읽지 못하면 500 이다", async () => {
    db.fail.add("quant_signal_judgments");
    expect((await read()).status).toBe(500);
  });

  describe("재구성 표본", () => {
    const snap = (symbol: string, discovery_date: string, exitDay3Pct: number | null) => ({
      symbol, name: `종목${symbol}`, discovery_date, tracking_item: { exitDay3Pct, exitDay3NetPct: exitDay3Pct == null ? null : exitDay3Pct - 0.26 },
    });

    it("스냅샷에서 오고 판정 기록과 겹치는 건을 뺀다", async () => {
      db.tables.a_track_legacy_snapshot_20261106 = [snap("000001", "20261102", 10), snap("000007", "20260703", 5), snap("000008", "20260704", -3)];
      const { body } = await read();
      expect(body.legacySample.items.map((i: any) => i.symbol)).toEqual(["000007", "000008"]);
      expect(body.legacySample.stats).toMatchObject({ n: 2, winCount: 1, lossCount: 1, expectancy: 1 });
      expect(body.legacySample.netExpectancy).toBe(0.74);
    });

    it("재평가하지 않는다 — 궤적이 달라도 고정값을 그대로 쓰고 헤드라인 집계에 섞이지 않는다", async () => {
      db.tables.a_track_legacy_snapshot_20261106 = [snap("000007", "20261102", 5)];
      db.tables.stock_trajectory.push(...series("000007", [1000, 1000, 1000, 2000, 2000]));
      const { body } = await read();
      expect(body.legacySample.items[0].exitDay3Pct).toBe(5);
      expect(body.quantSignalStats.totalCount).toBe(2);
      expect(body.quantSignalItems.some((i: any) => i.symbol === "000007")).toBe(false);
    });

    it("스냅샷을 읽지 못해도 트래커는 응답한다", async () => {
      db.fail.add("a_track_legacy_snapshot_20261106");
      const { status, body } = await read();
      expect(status).toBe(200);
      expect(body.legacySample).toBeNull();
      expect(body.quantSignalItems).toHaveLength(2);
    });
  });
});
