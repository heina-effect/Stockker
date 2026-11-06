import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const kis = vi.hoisted(() => ({ index: vi.fn(), scopes: [] as { bypass: boolean }[] }));
vi.mock("@/server/kis/rest-client", () => ({ getDomesticIndexDaily: kis.index }));
vi.mock("@/server/kis/cache", async (importActual) => {
  const actual = await importActual<typeof import("@/server/kis/cache")>();
  return {
    ...actual,
    runInCacheScope: (scope: { bypass: boolean }, fn: () => unknown) => {
      kis.scopes.push(scope);
      return fn();
    },
  };
});

const candles = (count: number, value = 700) => Array.from({ length: count }, () => ({ bstp_nmix_prpr: String(value) }));

// 응답 재사용 상태가 모듈에 있어 시험마다 새로 읽는다
async function get() {
  vi.resetModules();
  const { GET } = await import("./route");
  return GET;
}

describe("GET /api/screening/overnight/market-state", () => {
  beforeEach(() => {
    kis.index.mockReset();
    kis.scopes.length = 0;
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("코스닥·코스피 두 지수만 캐시를 우회해 받는다", async () => {
    kis.index.mockResolvedValue(candles(130));
    const GET = await get();
    const body = await (await GET()).json();
    expect(kis.index.mock.calls.map((c) => c[0])).toEqual(["1001", "0001"]);
    expect(kis.scopes).toEqual([expect.objectContaining({ bypass: true })]);
    expect(body).toMatchObject({ ok: true, kosdaqState: { value: 700, maState: { ma5: 700, ma120: 700 } }, kospiState: { value: 700 } });
    expect(body.fetchedAt).toBeTruthy();
  });

  it("120봉 미만이면 지수값만 준다", async () => {
    kis.index.mockResolvedValue(candles(50));
    const GET = await get();
    const body = await (await GET()).json();
    expect(body.kosdaqState).toEqual({ value: 700, maState: null });
  });

  it("한쪽만 실패하면 다른 쪽은 준다", async () => {
    kis.index.mockImplementation(async (code: string) => {
      if (code === "0001") throw new Error("boom");
      return candles(130);
    });
    const GET = await get();
    const res = await GET();
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.kospiState).toBeNull();
    expect(body.kosdaqState.value).toBe(700);
  });

  it("둘 다 실패하면 503 이고 다음 호출은 다시 받는다", async () => {
    kis.index.mockRejectedValue(new Error("boom"));
    const GET = await get();
    const res = await GET();
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ ok: false, error: "market_state_failed" });
    await GET();
    expect(kis.index).toHaveBeenCalledTimes(4);
  });

  it("성공 응답은 60초 동안 재사용하고 그 뒤 다시 받는다", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-05T09:00:00.000Z"));
    kis.index.mockResolvedValue(candles(130));
    const GET = await get();
    await GET();
    vi.setSystemTime(new Date("2026-11-05T09:00:59.000Z"));
    await GET();
    expect(kis.index).toHaveBeenCalledTimes(2);
    vi.setSystemTime(new Date("2026-11-05T09:01:01.000Z"));
    await GET();
    expect(kis.index).toHaveBeenCalledTimes(4);
  });
});
