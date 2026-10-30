import { beforeEach, describe, expect, it, vi } from "vitest";

// 실패 경로는 가짜 결과 없이 ok:false 와 사유만 돌려주고 DB 에 저장하지 않아야 한다(2026-10-30).
const h = vi.hoisted(() => ({
  configured: true,
  indexDaily: vi.fn(),
  volumeRank: vi.fn(),
  stockDaily: vi.fn(),
  searchMaster: vi.fn(),
  save: vi.fn(),
  trajectory: vi.fn(),
}));

vi.mock("@/server/kis/config", () => ({
  kisConfig: { get quote() { return { configured: h.configured }; }, cronSecret: undefined },
}));
vi.mock("@/server/kis/rest-client", () => ({
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
vi.mock("@/lib/supabase/client", () => ({ getSupabaseAdmin: () => null }));
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
