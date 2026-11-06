import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// 실패 경로는 가짜 결과 없이 ok:false 와 사유만 돌려주고 DB 에 저장하지 않아야 한다(2026-10-30).
const h = vi.hoisted(() => ({
  configured: true,
  indexDaily: vi.fn(),
  volumeRank: vi.fn(),
  stockDaily: vi.fn(),
  searchMaster: vi.fn(),
  save: vi.fn(),
  savedInfo: vi.fn(),
  forceLog: vi.fn(),
  trajectory: vi.fn(),
  upsert: vi.fn(),
  invariant: vi.fn(),
  recordJudgments: vi.fn(),
  stockDetail: null as null | ((...args: unknown[]) => unknown),
  supabase: null as null | { from: (t: string) => { upsert: (...a: unknown[]) => unknown } },
}));

vi.mock("@/server/kis/config", () => ({
  kisConfig: { get quote() { return { configured: h.configured }; }, cronSecret: undefined },
}));
// 저장 시간대 판정은 실제 getKSTPersistWindow 를 그대로 쓰고 시각만 fake timer 로 움직인다
vi.mock("@/server/kis/rest-client", async () => ({
  getKSTPersistWindow: (await vi.importActual<typeof import("@/server/kis/rest-client")>("@/server/kis/rest-client")).getKSTPersistWindow,
  kstAfterHoursPriceWarning: (await vi.importActual<typeof import("@/server/kis/rest-client")>("@/server/kis/rest-client")).kstAfterHoursPriceWarning,
  getDomesticIndexDaily: h.indexDaily,
  getDomesticVolumeRank: h.volumeRank,
  getDomesticStockDaily: h.stockDaily,
  getDomesticStockWeekly: h.stockDaily,
  getDomesticStockDetail: (...args: unknown[]) => (h.stockDetail ?? h.stockDaily)(...args),
}));
vi.mock("@/lib/stocks/search-master", () => ({ getSearchMaster: h.searchMaster }));
vi.mock("@/server/screening/storage", () => ({
  saveScreeningResult: async (...args: unknown[]) => (await h.save(...args)) ?? { supabaseSaved: true },
  getScreeningSavedInfo: h.savedInfo,
  logForceOverwrite: h.forceLog,
  formatKSTDateCompact: () => "20261030",
}));
vi.mock("@/server/screening/quant-judgment", async (importActual) => ({
  ...(await importActual<typeof import("@/server/screening/quant-judgment")>()),
  recordQuantJudgments: h.recordJudgments,
}));
vi.mock("@/server/screening/trajectory-update", () => ({ runDailyTrajectoryUpdate: h.trajectory }));
vi.mock("@/lib/supabase/client", () => ({ getSupabaseAdmin: () => h.supabase }));
vi.mock("@/server/screening/entry-invariant", () => ({ warnEntryDay0Mismatches: h.invariant }));
vi.mock("@/server/screening/rate-limit-retry", () => ({
  withRateLimitRetry: (fn: () => unknown) => fn(),
  isRateLimitError: () => false,
}));

import { GET } from "./route";
import { evictCacheByPattern, withDedupeAndCache } from "@/server/kis/cache";

async function call(query = "") {
  const res = await GET(new Request(`http://localhost/api/screening/overnight${query}`));
  return { status: res.status, body: await res.json() };
}

function expectFailure(r: { status: number; body: any }, reason: string) {
  expect(r.status).toBe(503);
  expect(r.body).toMatchObject({ ok: false, error: "screening_failed", reason });
  // 종목 목록·지수값을 하나도 싣지 않는다
  expect(r.body.results).toBeUndefined();
  expect(r.body.kosdaqState).toBeUndefined();
  expect(h.save).not.toHaveBeenCalled();
  expect(h.trajectory).not.toHaveBeenCalled();
}

describe("GET /api/screening/overnight — 실패 경로", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "log").mockImplementation(() => {});
    h.configured = true;
    h.indexDaily.mockResolvedValue([]);
    h.volumeRank.mockResolvedValue([]);
    h.searchMaster.mockReturnValue([]);
  });

  it("시세 자격증명이 없으면 no_quote_credentials", async () => {
    h.configured = false;
    expectFailure(await call(), "no_quote_credentials");
  });

  it("거래량 순위가 비면 volume_rank_empty", async () => {
    expectFailure(await call(), "volume_rank_empty");
  });

  it("거래량 순위 조회가 실패해도 volume_rank_empty", async () => {
    h.volumeRank.mockRejectedValue(new Error("KIS down"));
    expectFailure(await call(), "volume_rank_empty");
  });

  it("분석에 성공한 종목이 0개면 no_symbols_analyzed", async () => {
    h.volumeRank.mockResolvedValue([{ mksc_shrn_iscd: "000001", hts_kor_isnm: "테스트", stck_prpr: "10000", vol_tnrt: "10" }]);
    h.stockDaily.mockRejectedValue(new Error("candle fetch failed"));
    expectFailure(await call(), "no_symbols_analyzed");
  });

  it("예기치 못한 예외는 critical_error", async () => {
    h.volumeRank.mockResolvedValue([{ mksc_shrn_iscd: "000001", hts_kor_isnm: "테스트" }]);
    h.searchMaster.mockImplementation(() => { throw new Error("master broken"); });
    expectFailure(await call(), "critical_error");
  });

  it("실패는 서버 로그에 SCREENING FAILED 로 남는다", async () => {
    h.configured = false;
    await call();
    expect(vi.mocked(console.error).mock.calls.some((c) => String(c[0]).includes("SCREENING FAILED reason=no_quote_credentials"))).toBe(true);
  });
});

// 저장 시간대 제한(2026-11-02, 11/05 개정) — 15:40~16:00 밖에서는 조회·응답만 하고 DB 에 쓰지 않는다.
describe("GET /api/screening/overnight — 장중 저장 차단", () => {
  // 130봉 일봉/주봉 — 분석 성공(analyzedSymbols ≥ 1)까지만 가면 된다
  const candles = Array.from({ length: 130 }, (_, i) => ({
    stck_bsop_date: String(20261030 - i),
    stck_clpr: "10000", stck_oprc: "10000", stck_hgpr: "10100", stck_lwpr: "9900", acml_vol: "1000",
  }));

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "log").mockImplementation(() => {});
    h.configured = true;
    h.indexDaily.mockResolvedValue([]);
    h.volumeRank.mockResolvedValue([{ mksc_shrn_iscd: "000001", hts_kor_isnm: "테스트", stck_prpr: "10000", prdy_ctrt: "5", acml_tr_pbmn: "2000000000", vol_tnrt: "10" }]);
    h.stockDaily.mockResolvedValue(candles);
    h.searchMaster.mockReturnValue([]);
    h.upsert.mockResolvedValue({ error: null });
    h.savedInfo.mockResolvedValue(null);
    h.forceLog.mockResolvedValue(undefined);
    h.supabase = { from: () => ({ upsert: h.upsert }) };
    vi.useFakeTimers({ toFake: ["Date"] });
  });

  afterEach(() => {
    vi.useRealTimers();
    h.supabase = null;
  });

  it("KST 15:29 에는 스크리닝 저장·day0 궤적·궤적 갱신을 모두 건너뛰고 결과는 응답한다", async () => {
    vi.setSystemTime(new Date("2026-10-30T06:29:00Z")); // KST 15:29
    const r = await call("?save=1");
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ ok: true, persisted: false, persistSkippedReason: "before_market_close" });
    expect(r.body.results).toBeDefined();
    expect(h.save).not.toHaveBeenCalled();
    expect(h.upsert).not.toHaveBeenCalled();
    expect(h.trajectory).not.toHaveBeenCalled();
  });

  it.each([
    ["15:30:00", "2026-10-30T06:30:00Z", "before_scheduled_run"],
    ["15:39:59", "2026-10-30T06:39:59Z", "before_scheduled_run"],
    ["16:01", "2026-10-30T07:01:00Z", "after_hours_session"],
    ["20:01", "2026-10-30T11:01:00Z", "after_market_close"],
  ])("KST %s 에는 %s 로 건너뛴다", async (_, iso, reason) => {
    vi.setSystemTime(new Date(iso));
    const r = await call("?save=1");
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ ok: true, persisted: false, persistSkippedReason: reason });
    expect(r.body.results).toBeDefined();
    expect(h.save).not.toHaveBeenCalled();
    expect(h.upsert).not.toHaveBeenCalled();
    expect(h.trajectory).not.toHaveBeenCalled();
  });

  it.each([
    ["15:40:00", "2026-10-30T06:40:00Z"],
    ["15:59:59", "2026-10-30T06:59:59Z"],
  ])("KST %s 에는 저장한다", async (_, iso) => {
    vi.setSystemTime(new Date(iso));
    const r = await call("?save=1");
    expect(r.body).toMatchObject({ ok: true, persisted: true });
    expect(r.body.persistSkippedReason).toBeUndefined();
    expect(h.save).toHaveBeenCalledTimes(1);
    expect(h.upsert).toHaveBeenCalledTimes(1);
    expect(h.trajectory).toHaveBeenCalledTimes(1);
  });

  describe("판정 기록(2026-11-06)", () => {
    const stockRow = (symbol: string) => ({ mksc_shrn_iscd: symbol, hts_kor_isnm: `종목${symbol}`, stck_prpr: "10000", prdy_ctrt: "5", acml_tr_pbmn: "2000000000", vol_tnrt: "10" });
    const recorded = () => h.recordJudgments.mock.calls[0]?.[0] as { symbol: string; quant_signal: boolean; source: string }[];

    beforeEach(() => vi.setSystemTime(new Date("2026-10-30T06:41:00Z")));

    it("저장에 성공하면 기록한다", async () => {
      await call("?save=1");
      expect(h.recordJudgments).toHaveBeenCalledTimes(1);
      expect(recorded()).toEqual([expect.objectContaining({ symbol: "000001", date: "20261030", source: "live", volume_basis: "incl_today", close_at_judgment: 10000, volume_at_judgment: 1000, judged_at: "2026-10-30T06:41:00.000Z" })]);
    });

    // 행 생성의 true·false 는 quant-judgment.test.ts 에서 본다. 여기서는 미달 종목도 빠지지 않는지 본다
    it("판정 미달 종목도 넘긴다", async () => {
      h.volumeRank.mockResolvedValue([stockRow("000001"), stockRow("000002")]);
      await call("?save=1");
      expect(recorded().map((r) => [r.symbol, r.quant_signal])).toEqual([["000001", false], ["000002", false]]);
    });

    it("Supabase 저장이 실패하면 기록하지 않는다", async () => {
      h.save.mockResolvedValueOnce({ supabaseSaved: false });
      const r = await call("?save=1");
      expect(r.body.persisted).toBe(true);
      expect(h.recordJudgments).not.toHaveBeenCalled();
    });

    it("저장 함수가 던지면 기록하지 않는다", async () => {
      h.save.mockRejectedValueOnce(new Error("boom"));
      await call("?save=1");
      expect(h.recordJudgments).not.toHaveBeenCalled();
    });

    it.each([
      ["조회 전용", "", "2026-10-30T06:41:00Z"],
      ["이미 저장됨", "?save=1", "2026-10-30T06:41:00Z"],
      ["15:39 저장 창 전", "?save=1", "2026-10-30T06:39:00Z"],
      ["16:00 저장 창 뒤", "?save=1", "2026-10-30T07:00:00Z"],
    ])("%s 이면 기록하지 않는다", async (label, query, iso) => {
      vi.setSystemTime(new Date(iso));
      if (label === "이미 저장됨") h.savedInfo.mockResolvedValue({ itemCount: 8, savedAt: "2026-10-30T06:40:18Z" });
      await call(query);
      expect(h.save).not.toHaveBeenCalled();
      expect(h.recordJudgments).not.toHaveBeenCalled();
    });

    it("excludedNotice 는 기록하지 않는다", async () => {
      h.volumeRank.mockResolvedValue([stockRow("000001"), stockRow("000002")]);
      h.stockDaily.mockImplementation(async (symbol: string) => (symbol === "000002" ? candles.slice(0, 50) : candles));
      h.stockDetail = async () => ({ vol_tnrt: "10" });
      const r = await call("?save=1");
      h.stockDetail = null;
      expect(r.body.excludedNotice.map((n: { symbol: string }) => n.symbol)).toEqual(["000002"]);
      expect(recorded().map((j) => j.symbol)).toEqual(["000001"]);
    });
  });

  // 실행 중 창 재판정(2026-11-03) — 종목 일봉을 받는 동안 시각이 창 경계를 넘으면 저장하지 않는다
  it.each([
    ["15:29:50 시작 → 15:30 을 넘김", "2026-10-30T06:29:50Z", "before_market_close", false],
    ["15:39:50 시작 → 15:40 을 넘김", "2026-10-30T06:39:50Z", "before_scheduled_run", false],
    ["15:59:50 시작 → 16:00 을 넘김", "2026-10-30T06:59:50Z", "after_hours_session", true],
  ])("%s 이면 저장하지 않고 저장 안 한 건수를 응답한다", async (_, iso, reason, closedDuringRun) => {
    vi.setSystemTime(new Date(iso));
    h.stockDaily.mockImplementation(async () => {
      vi.setSystemTime(new Date(Date.now() + 10_000)); // 조회마다 10초 경과
      return candles;
    });
    const r = await call("?save=1");
    expect(r.body).toMatchObject({ ok: true, persisted: false, persistSkippedReason: reason });
    expect(r.body.unsaved).toMatchObject({ closedDuringRun });
    expect(r.body.unsaved.items).toBeGreaterThan(0);
    expect(r.body.unsaved.day0).toBeGreaterThan(0);
    expect(h.save).not.toHaveBeenCalled();
    expect(h.upsert).not.toHaveBeenCalled();
    expect(h.trajectory).not.toHaveBeenCalled();
  });

  // 명시적 저장(2026-11-05) — 저장은 ?save=1 이 있을 때만 시도한다. 하위 호환은 두지 않는다.
  describe("명시적 저장", () => {
    const expectViewOnly = (r: { status: number; body: any }) => {
      expect(r.status).toBe(200);
      expect(r.body).toMatchObject({ ok: true, persisted: false, persistSkippedReason: "view_only" });
      expect(r.body.unsaved).toMatchObject({ closedDuringRun: false });
      expect(r.body.results).toBeDefined();
      expect(h.savedInfo).not.toHaveBeenCalled();
      expect(h.forceLog).not.toHaveBeenCalled();
      expect(h.save).not.toHaveBeenCalled();
      expect(h.upsert).not.toHaveBeenCalled();
      expect(h.trajectory).not.toHaveBeenCalled();
    };

    it.each([
      ["파라미터 없음", ""],
      ["force 단독", "?force=true"],
      ["save 값이 1이 아님", "?save=true"],
      ["save=0", "?save=0&force=true"],
    ])("저장 창 안에서도 %s 은 조회만 한다", async (_, query) => {
      vi.setSystemTime(new Date("2026-10-30T06:45:00Z")); // KST 15:45
      expectViewOnly(await call(query));
    });

    it.each([
      ["13:00", "2026-10-30T04:00:00Z"],
      ["15:35", "2026-10-30T06:35:00Z"],
      ["17:00", "2026-10-30T08:00:00Z"],
    ])("창 밖 KST %s 도 파라미터가 없으면 사유는 view_only 다", async (_, iso) => {
      vi.setSystemTime(new Date(iso));
      expectViewOnly(await call());
    });

    it("조회 도중 창이 닫혀도 저장 요청이 없었으면 실행 중 닫힘이 아니다", async () => {
      vi.setSystemTime(new Date("2026-10-30T06:59:50Z"));
      h.stockDaily.mockImplementation(async () => {
        vi.setSystemTime(new Date(Date.now() + 10_000));
        return candles;
      });
      expectViewOnly(await call());
    });
  });

  // ?fresh=1(2026-11-05) — 시세 함수를 실제 캐시 위에 올려 라우트 경유로 확인한다
  describe("새로 조회", () => {
    let kisFetches = 0;

    beforeEach(() => {
      kisFetches = 0;
      evictCacheByPattern(/^route_test_/);
      h.stockDaily.mockImplementation(() =>
        withDedupeAndCache("route_test_daily", 26 * 60 * 60 * 1000, async () => {
          kisFetches++;
          return candles;
        })
      );
      vi.setSystemTime(new Date("2026-10-30T04:00:00Z")); // KST 13:00
    });

    it("fresh=1 은 캐시를 읽지 않고 새로 받는다", async () => {
      await call();
      const cachedFetches = kisFetches;
      const r = await call("?fresh=1");
      expect(r.body).toMatchObject({ ok: true, dataSource: "fresh", persisted: false, persistSkippedReason: "view_only" });
      expect(kisFetches).toBeGreaterThan(cachedFetches);
    });

    it("fresh=1 호출 후 캐시에 값이 들어가지 않는다", async () => {
      await call("?fresh=1");
      const afterFresh = kisFetches;
      expect(afterFresh).toBeGreaterThan(0);
      await call(); // 캐시가 비어 있으면 이 호출이 처음으로 채운다
      expect(kisFetches).toBe(afterFresh + 1);
      await call();
      expect(kisFetches).toBe(afterFresh + 1);
    });

    it("캐시가 비어 있으면 새로 받았다고 알리고, 받은 시각을 돌려준다", async () => {
      const r = await call();
      expect(r.body).toMatchObject({ dataSource: "cache_miss", dataFetchedAt: "2026-10-30T04:00:00.000Z", priceWarning: null });
    });

    it("응답 값을 받은 뒤의 궤적 갱신은 수신 시각과 출처에 넣지 않는다", async () => {
      vi.setSystemTime(new Date("2026-10-30T06:41:00Z")); // KST 15:41
      h.trajectory.mockImplementationOnce(async () => {
        vi.setSystemTime(new Date("2026-10-30T06:42:00Z"));
        return { processed: 0, skipped: 0, targets: 0, candidates: 0 };
      });
      const r = await call("?save=1");
      expect(r.body).toMatchObject({ persisted: true, dataSource: "cache_miss", dataFetchedAt: "2026-10-30T06:41:00.000Z" });
    });

    it.each([
      ["15:45", "2026-10-30T06:45:00Z", null],
      ["16:05", "2026-10-30T07:05:00Z", "after_hours"],
      ["20:30", "2026-10-30T11:30:00Z", "after_market_close"],
    ])("%s 에 받은 값의 종가 경고", async (_label, iso, expected) => {
      vi.setSystemTime(new Date(iso));
      const r = await call("?fresh=1");
      expect(r.body).toMatchObject({ ok: true, dataSource: "fresh", priceWarning: expected });
    });

    it("fresh 없는 호출은 캐시를 쓰고, 값을 처음 받은 시각을 알려준다", async () => {
      await call();
      expect(kisFetches).toBe(1);
      vi.setSystemTime(new Date("2026-10-30T05:00:00Z")); // 1시간 뒤
      const r = await call();
      expect(kisFetches).toBe(1);
      expect(r.body).toMatchObject({ dataSource: "cache", dataFetchedAt: "2026-10-30T04:00:00.000Z", generatedAt: "2026-10-30T05:00:00.000Z" });
    });

    it.each([["?fresh=true"], ["?fresh=0"]])("%s 는 무시하고 캐시를 쓴다", async (query) => {
      await call();
      vi.setSystemTime(new Date("2026-10-30T04:00:01Z"));
      const r = await call(query);
      expect(r.body.dataSource).toBe("cache");
      expect(kisFetches).toBe(1);
    });

    it.each([["?fresh=1&save=1"], ["?save=1&fresh=1&force=true"]])("%s 는 저장 창 안에서도 KIS 호출 없이 거부한다", async (query) => {
      vi.setSystemTime(new Date("2026-10-30T06:45:00Z")); // KST 15:45
      const r = await call(query);
      expect(r.status).toBe(400);
      expect(r.body).toMatchObject({ ok: false, persisted: false, persistSkippedReason: "fresh_with_save" });
      expect(r.body.results).toBeUndefined();
      expect(h.indexDaily).not.toHaveBeenCalled();
      expect(h.volumeRank).not.toHaveBeenCalled();
      expect(h.save).not.toHaveBeenCalled();
      expect(h.upsert).not.toHaveBeenCalled();
      expect(h.trajectory).not.toHaveBeenCalled();
    });

    it("정기 실행(?save=1)은 캐시 경로로 저장한다", async () => {
      vi.setSystemTime(new Date("2026-10-30T06:40:01Z")); // KST 15:40:01
      const r = await call("?save=1");
      expect(r.body).toMatchObject({ ok: true, persisted: true, dataSource: "cache_miss" });
      expect(h.save).toHaveBeenCalledTimes(1);
    });
  });

  // 첫 저장 보호(2026-11-05) — 재실행이 15:40 저장을 지우고 궤적까지 지우지 못하게 한다.
  describe("첫 저장 보호", () => {
    const saved = { itemCount: 8, savedAt: "2026-10-30T06:40:18.000Z" };
    const expectNoWrites = () => {
      expect(h.save).not.toHaveBeenCalled();
      expect(h.upsert).not.toHaveBeenCalled();
      expect(h.trajectory).not.toHaveBeenCalled();
    };

    beforeEach(() => vi.setSystemTime(new Date("2026-10-30T06:57:00Z"))); // KST 15:57

    it("그날 저장이 없으면 저장하고, 덮어쓰기 기록은 남기지 않는다", async () => {
      const r = await call("?save=1");
      expect(r.body).toMatchObject({ ok: true, persisted: true });
      expect(r.body.alreadySaved).toBeUndefined();
      expect(h.savedInfo).toHaveBeenCalledWith("20261030");
      expect(h.forceLog).not.toHaveBeenCalled();
      expect(h.save).toHaveBeenCalledTimes(1);
      expect(h.upsert).toHaveBeenCalledTimes(1);
      expect(h.trajectory).toHaveBeenCalledTimes(1);
    });

    it("그날 저장이 있으면 쓰지 않고 저장 시각을 응답하며 결과는 그대로 준다", async () => {
      h.savedInfo.mockResolvedValue(saved);
      const r = await call("?save=1");
      expect(r.status).toBe(200);
      expect(r.body).toMatchObject({ ok: true, persisted: false, persistSkippedReason: "already_saved", alreadySaved: saved });
      expect(r.body.unsaved).toMatchObject({ closedDuringRun: false });
      expect(r.body.results).toBeDefined();
      expectNoWrites();
    });

    it("force 면 덮어쓰기 전에 기록을 남기고 저장한다", async () => {
      h.savedInfo.mockResolvedValue(saved);
      const r = await call("?save=1&force=true");
      expect(r.body).toMatchObject({ ok: true, persisted: true, alreadySaved: saved });
      expect(r.body.persistSkippedReason).toBeUndefined();
      expect(h.forceLog).toHaveBeenCalledTimes(1);
      expect(h.forceLog.mock.calls[0][0]).toBe("20261030");
      expect(h.forceLog.mock.calls[0][1]).toEqual(h.save.mock.calls[0][0].items.map((i: { symbol: string }) => i.symbol));
      expect(h.forceLog.mock.invocationCallOrder[0]).toBeLessThan(h.save.mock.invocationCallOrder[0]);
      expect(h.upsert).toHaveBeenCalledTimes(1);
      expect(h.trajectory).toHaveBeenCalledTimes(1);
    });

    it("force 라도 덮어쓰기 기록에 실패하면 쓰지 않는다", async () => {
      h.savedInfo.mockResolvedValue(saved);
      h.forceLog.mockRejectedValue(new Error("db down"));
      const r = await call("?save=1&force=true");
      expect(r.body).toMatchObject({ ok: true, persisted: false, persistSkippedReason: "force_log_failed" });
      expectNoWrites();
    });

    it("저장 여부를 확인하지 못하면 쓰지 않는다", async () => {
      h.savedInfo.mockRejectedValue(new Error("db down"));
      for (const query of ["?save=1", "?save=1&force=true"]) {
        const r = await call(query);
        expect(r.body).toMatchObject({ ok: true, persisted: false, persistSkippedReason: "save_check_failed" });
      }
      expectNoWrites();
    });

    it("저장 창 밖에서는 force 여도 쓰지 않고 저장 여부도 조회하지 않는다", async () => {
      vi.setSystemTime(new Date("2026-10-30T07:01:00Z")); // KST 16:01
      for (const query of ["?save=1", "?save=1&force=true"]) {
        const r = await call(query);
        expect(r.body).toMatchObject({ ok: true, persisted: false, persistSkippedReason: "after_hours_session" });
      }
      expect(h.savedInfo).not.toHaveBeenCalled();
      expect(h.forceLog).not.toHaveBeenCalled();
      expectNoWrites();
    });
  });

  // 불변식(2026-11-02): 같은 실행이 저장하는 스크리닝 항목 entry_close 와 day0 종가는 같은 값이다.
  it("저장하는 entry_close 와 day0 종가가 같고, 저장 직후 불변식 검사를 부른다", async () => {
    vi.setSystemTime(new Date("2026-10-30T06:40:00Z")); // KST 15:40
    await call("?save=1");
    const items = h.save.mock.calls[0][0].items as { symbol: string; entryClose: number }[];
    const day0 = h.upsert.mock.calls[0][0] as { symbol: string; close: number; days_after: number }[];
    expect(day0.length).toBeGreaterThan(0);
    for (const row of day0) {
      expect(row.days_after).toBe(0);
      expect(items.find((i) => i.symbol === row.symbol)?.entryClose).toBe(row.close);
    }
    expect(h.invariant).toHaveBeenCalledTimes(1);
    expect(h.invariant.mock.calls[0][1]).toEqual(day0.map((r) => ({ symbol: r.symbol, date: "20261030" })));
  });
});
