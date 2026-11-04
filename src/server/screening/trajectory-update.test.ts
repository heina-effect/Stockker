import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  dailyAround: vi.fn(),
  upsert: vi.fn(),
  items: [] as { symbol: string; name: string; date: string; entry_close: number }[],
  traj: [] as { symbol: string; discovery_date: string; days_after: number; trade_date: string }[],
  calendar: [] as string[],
}));

// 저장 창 판정은 실제 getKSTPersistWindow 를 쓰고 시각만 fake timer 로 움직인다
vi.mock("@/server/kis/rest-client", async () => ({
  getKSTPersistWindow: (await vi.importActual<typeof import("@/server/kis/rest-client")>("@/server/kis/rest-client")).getKSTPersistWindow,
  getDomesticStockDailyAround: h.dailyAround,
}));
vi.mock("@/lib/supabase/client", () => ({
  getSupabaseAdmin: () => ({
    from: (table: string) => ({
      select: () =>
        table === "trajectory_favorites"
          ? Promise.resolve({ data: [], error: null })
          : { gte: () => Promise.resolve({ data: h.items, error: null }) },
      upsert: h.upsert,
    }),
  }),
}));
vi.mock("@/server/screening/storage", () => ({
  formatKSTDateCompact: (d: Date) => new Date(d.getTime() + 9 * 3600e3).toISOString().slice(0, 10).replace(/-/g, ""),
}));
vi.mock("@/server/screening/indicators", () => ({ recalculateIndicatorsForDiscovery: vi.fn() }));
vi.mock("@/server/screening/entry-invariant", () => ({ warnEntryDay0Mismatches: vi.fn() }));
vi.mock("@/server/screening/corporate-actions", () => ({ warnUnknownCorporateActions: vi.fn() }));
vi.mock("@/server/screening/paginate", () => ({ fetchAllRows: async () => h.traj }));
vi.mock("@/server/screening/rate-limit-retry", () => ({ withRateLimitRetry: (fn: () => unknown) => fn() }));
vi.mock("@/server/screening/trading-calendar", () => ({
  ensureTodayInCalendar: async () => ({ isTradingDay: true }),
  getTradingDaysBetween: async () => h.calendar,
}));

import { compareTrajectoryTargets, runDailyTrajectoryUpdate } from "./trajectory-update";

// 처리 순서(2026-11-03): 즐겨찾기 → 마지막 저장일이 오래된 순 → 발굴일이 오래된 순
const g = (discoveryDate: string, lastStored: string | null, favorite = false) => ({ discoveryDate, lastStored, favorite });
const order = (list: ReturnType<typeof g>[]) => [...list].sort(compareTrajectoryTargets);

describe("compareTrajectoryTargets", () => {
  it("마지막 저장일이 오래된 그룹이 먼저 온다(최신 발굴일 우선이 아니다)", () => {
    const fresh = g("20261102", "20261102");
    const lagging = g("20260920", "20261030");
    expect(order([fresh, lagging])).toEqual([lagging, fresh]);
  });

  it("마지막 저장일이 같으면 발굴일이 오래된 그룹이 먼저", () => {
    const a = g("20261001", "20261030");
    const b = g("20260925", "20261030");
    expect(order([a, b])).toEqual([b, a]);
  });

  it("저장된 행이 없는 그룹은 가장 뒤처진 것으로 본다", () => {
    const none = g("20261102", null);
    const some = g("20260920", "20261030");
    expect(order([some, none])).toEqual([none, some]);
  });

  it("즐겨찾기는 저장일과 무관하게 먼저", () => {
    const fav = g("20261102", "20261102", true);
    const lagging = g("20260920", "20261001");
    expect(order([lagging, fav])).toEqual([fav, lagging]);
  });
});

// 실행 중 창 재판정(2026-11-03) — 일봉 조회가 16:00 을 넘기면 그 뒤 그룹의 당일 행은 쓰지 않는다
describe("runDailyTrajectoryUpdate — 실행 중 16:00 을 넘기는 경우", () => {
  const candle = (date: string) => ({ stck_bsop_date: date, stck_oprc: "100", stck_hgpr: "110", stck_lwpr: "90", stck_clpr: "105", acml_vol: "1000" });
  const written = () => h.upsert.mock.calls.map((c) => `${c[0].symbol}:${c[0].trade_date}`);

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    h.upsert.mockResolvedValue({ error: null });
    h.calendar = ["20261029", "20261030", "20261102", "20261103"];
    // 모두 11/03 당일 행이 남았다. C 는 11/02 공백도 있다. 처리 순서: C(11/30 저장) → A → B
    h.items = [
      { symbol: "A", name: "A", date: "20261029", entry_close: 100 },
      { symbol: "B", name: "B", date: "20261030", entry_close: 100 },
      { symbol: "C", name: "C", date: "20261029", entry_close: 100 },
    ];
    h.traj = [
      { symbol: "A", discovery_date: "20261029", days_after: 2, trade_date: "20261102" },
      { symbol: "B", discovery_date: "20261030", days_after: 1, trade_date: "20261102" },
      { symbol: "C", discovery_date: "20261029", days_after: 1, trade_date: "20261030" },
    ];
    h.dailyAround.mockImplementation(async () => {
      vi.setSystemTime(new Date(Date.now() + 20_000)); // 조회마다 20초 경과
      return ["20261029", "20261030", "20261102", "20261103"].map(candle);
    });
    vi.useFakeTimers({ toFake: ["Date"] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("앞쪽 그룹은 당일 행을 쓰고, 창이 닫힌 뒤 그룹은 당일 행만 건너뛴다", async () => {
    vi.setSystemTime(new Date("2026-11-03T06:59:30Z")); // KST 15:59:30 시작
    const r = await runDailyTrajectoryUpdate();
    // C: 15:59:50 에 조회 완료 → 11/02 공백과 11/03 당일 모두 저장
    // A: 16:00:10 에 조회 완료 → 쓰기 직전 재판정으로 당일 행 건너뜀
    // B: 조회 전 재판정에서 이미 닫힘 → 남은 일이 당일뿐이라 KIS 도 부르지 않음
    expect(written()).toEqual(["C:20261102", "C:20261103"]);
    expect(h.dailyAround).toHaveBeenCalledTimes(2);
    expect(r?.todaySkipped).toEqual({ groups: 2, symbols: 2, reason: "after_hours_session" });
  });

  it("창이 닫힌 뒤에도 전일까지의 공백은 계속 메운다", async () => {
    vi.setSystemTime(new Date("2026-11-03T07:00:30Z")); // KST 16:00:30 시작 — 시작부터 닫힘
    const r = await runDailyTrajectoryUpdate();
    expect(written()).toEqual(["C:20261102"]);
    expect(h.dailyAround).toHaveBeenCalledTimes(1);
    // 시작부터 닫혀 있으면 당일은 처음부터 처리 대상이 아니므로 "실행 중 건너뜀"으로 세지 않는다
    expect(r?.todaySkipped.groups).toBe(0);
  });

  it("쓸 거래일이 없는 그룹은 대상에 들어가지 않는다", async () => {
    vi.setSystemTime(new Date("2026-11-03T06:40:00Z")); // KST 15:40
    h.traj = [...h.traj, { symbol: "A", discovery_date: "20261029", days_after: 3, trade_date: "20261103" }];
    const r = await runDailyTrajectoryUpdate();
    expect(r).toMatchObject({ candidates: 2, targets: 2, processed: 2 });
    expect(written()).toEqual(["C:20261102", "C:20261103", "B:20261103"]);
  });
});
