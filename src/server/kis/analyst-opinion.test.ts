import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const callKisApi = vi.fn();
let kisMode: "real" | "mock" = "real";

vi.mock("./auth", () => ({
  callKisApi: (...args: unknown[]) => callKisApi(...args),
}));

vi.mock("./config", () => ({
  kisConfig: {
    get mode() {
      return kisMode;
    },
  },
}));

vi.mock("./cache", () => ({
  withDedupeAndCache: (_key: string, _ttl: number, fn: () => unknown) => fn(),
}));

describe("getStockAnalystOpinions", () => {
  beforeEach(() => {
    callKisApi.mockReset();
    kisMode = "real";
  });

  it("uses current KIS opinion TRs and normalizes KIS field names", async () => {
    callKisApi
      .mockResolvedValueOnce({
        rt_cd: "0",
        msg1: "OK",
        output: [
          {
            stck_bsop_date: "20260513",
            invt_opnn: "매수",
            rgbf_invt_opnn: "중립",
            hts_goal_prc: "95000",
          },
        ],
      })
      .mockResolvedValueOnce({
        rt_cd: "0",
        msg1: "OK",
        output: [],
      });

    const { getStockAnalystOpinions } = await import("./analyst-opinion");
    const result = await getStockAnalystOpinions("005930");

    expect(callKisApi).toHaveBeenCalledWith(
      expect.stringContaining("/uapi/domestic-stock/v1/quotations/invest-opinion?"),
      expect.objectContaining({ trId: "FHKST663300C0" })
    );
    expect(callKisApi).toHaveBeenCalledWith(
      expect.stringContaining("FID_COND_SCR_DIV_CODE=16633"),
      expect.objectContaining({ trId: "FHKST663300C0" })
    );
    expect(callKisApi).toHaveBeenCalledWith(
      expect.stringContaining("/uapi/domestic-stock/v1/quotations/invest-opbysec?"),
      expect.objectContaining({ trId: "FHKST663400C0" })
    );
    expect(callKisApi).toHaveBeenCalledWith(
      expect.stringContaining("FID_COND_SCR_DIV_CODE=16634"),
      expect.objectContaining({ trId: "FHKST663400C0" })
    );
    expect(result.items).toEqual([
      {
        firmName: "KIS 투자의견",
        opinion: "매수",
        targetPrice: 95000,
        date: "2026-05-13",
        prevOpinion: "중립",
        prevTargetPrice: undefined,
      },
    ]);
    expect(result.avgTargetPrice).toBe(95000);
  });

  it("still calls opinion APIs in mock KIS mode but marks the response as real KIS data", async () => {
    kisMode = "mock";
    callKisApi
      .mockResolvedValueOnce({
        rt_cd: "0",
        msg1: "OK",
        output: [
          {
            stck_bsop_date: "20260513",
            invt_opnn: "매수",
            hts_goal_prc: "95000",
          },
        ],
      })
      .mockResolvedValueOnce({
        rt_cd: "0",
        msg1: "OK",
        output: [],
      });

    const { getStockAnalystOpinions } = await import("./analyst-opinion");
    const result = await getStockAnalystOpinions("005930");

    expect(callKisApi).toHaveBeenCalledTimes(2);
    expect(result.items).toHaveLength(1);
    expect(result._meta).toEqual(expect.objectContaining({
      source: "kis-openapi",
      kisMode: "mock",
      isMockData: false,
    }));
  });
});
