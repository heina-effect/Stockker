import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// 실패 경로는 가짜 결과 없이 ok:false 와 사유만 돌려주고 DB 에 저장하지 않아야 한다(2026-10-30).
const h = vi.hoisted(() => ({
  configured: true,
  indexDaily: vi.fn(),
  volumeRank: vi.fn(),
  stockDaily: vi.fn(),
  searchMaster: vi.fn(),
  save: vi.fn(),
  trajectory: vi.fn(),
  upsert: vi.fn(),
  invariant: vi.fn(),
  supabase: null as null | { from: (t: string) => { upsert: (...a: unknown[]) => unknown } },
}));

vi.mock("@/server/kis/config", () => ({
  kisConfig: { get quote() { return { configured: h.configured }; }, cronSecret: undefined },
}));
// 저장 시간대 판정은 실제 getKSTPersistWindow 를 그대로 쓰고 시각만 fake timer 로 움직인다
vi.mock("@/server/kis/rest-client", async () => ({
  getKSTPersistWindow: (await vi.importActual<typeof import("@/server/kis/rest-client")>("@/server/kis/rest-client")).getKSTPersistWindow,
  getDomesticIndexDaily: h.indexDaily,
  getDomesticVolumeRank: h.volumeRank,
  getDomesticStockDaily: h.stockDaily,
  getDomesticStockWeekly: h.stockDaily,
  getDomesticStockDetail: h.stockDaily,
}));
vi.mock("@/lib/stocks/search-master", () => ({ getSearchMaster: h.searchMaster }));
vi.mock("@/server/screening/storage", () => ({
  saveScreeningResult: h.save,
  formatKSTDateCompact: () => "20261030",
}));
vi.mock("@/server/screening/trajectory-update", () => ({ runDailyTrajectoryUpdate: h.trajectory }));
vi.mock("@/lib/supabase/client", () => ({ getSupabaseAdmin: () => h.supabase }));
vi.mock("@/server/screening/entry-invariant", () => ({ warnEntryDay0Mismatches: h.invariant }));
vi.mock("@/server/screening/rate-limit-retry", () => ({
  withRateLimitRetry: (fn: () => unknown) => fn(),
  isRateLimitError: () => false,
}));

import { GET } from "./route";

async function call() {
  const res = await GET(new Request("http://localhost/api/screening/overnight"));
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

// 저장 시간대 제한(2026-11-02) — 15:30 이전·16:00~20:00 에는 조회·응답만 하고 DB 에 쓰지 않는다.
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
    h.supabase = { from: () => ({ upsert: h.upsert }) };
    vi.useFakeTimers({ toFake: ["Date"] });
  });

  afterEach(() => {
    vi.useRealTimers();
    h.supabase = null;
  });

  it("KST 15:29 에는 스크리닝 저장·day0 궤적·궤적 갱신을 모두 건너뛰고 결과는 응답한다", async () => {
    vi.setSystemTime(new Date("2026-10-30T06:29:00Z")); // KST 15:29
    const r = await call();
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ ok: true, persisted: false, persistSkippedReason: "before_market_close" });
    expect(r.body.results).toBeDefined();
    expect(h.save).not.toHaveBeenCalled();
    expect(h.upsert).not.toHaveBeenCalled();
    expect(h.trajectory).not.toHaveBeenCalled();
  });

  it("KST 16:01 애프터마켓 중에는 after_hours_session 으로 건너뛴다", async () => {
    vi.setSystemTime(new Date("2026-10-30T07:01:00Z")); // KST 16:01
    const r = await call();
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ ok: true, persisted: false, persistSkippedReason: "after_hours_session" });
    expect(r.body.results).toBeDefined();
    expect(h.save).not.toHaveBeenCalled();
    expect(h.upsert).not.toHaveBeenCalled();
    expect(h.trajectory).not.toHaveBeenCalled();
  });

  it.each([
    ["15:40", "2026-10-30T06:40:00Z"],
    ["20:01", "2026-10-30T11:01:00Z"],
  ])("KST %s 에는 저장한다", async (_, iso) => {
    vi.setSystemTime(new Date(iso));
    const r = await call();
    expect(r.body).toMatchObject({ ok: true, persisted: true });
    expect(r.body.persistSkippedReason).toBeUndefined();
    expect(h.save).toHaveBeenCalledTimes(1);
    expect(h.upsert).toHaveBeenCalledTimes(1);
    expect(h.trajectory).toHaveBeenCalledTimes(1);
  });

  // 불변식(2026-11-02): 같은 실행이 저장하는 스크리닝 항목 entry_close 와 day0 종가는 같은 값이다.
  it("저장하는 entry_close 와 day0 종가가 같고, 저장 직후 불변식 검사를 부른다", async () => {
    vi.setSystemTime(new Date("2026-10-30T06:40:00Z")); // KST 15:40
    await call();
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
