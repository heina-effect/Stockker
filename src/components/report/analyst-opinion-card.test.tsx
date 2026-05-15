import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AnalystOpinionCard } from "./analyst-opinion-card";

let livePrice: number | undefined;

vi.mock("@/components/dashboard/live-market-provider", () => ({
  useOptionalLiveMarket: () => livePrice
    ? { marketStore: { "005930": { quote: { price: livePrice } } } }
    : null,
}));

describe("AnalystOpinionCard", () => {
  beforeEach(() => {
    livePrice = undefined;
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        ok: true,
        data: {
          avgTargetPrice: 80000,
          updatedAt: "2026-05-14T00:00:00.000Z",
          _meta: { source: "kis-openapi", kisMode: "real", endpointMode: "real", isMockData: false },
          items: [
            { firmName: "A증권", opinion: "매수", targetPrice: 90000, date: "2026-05-14" },
            { firmName: "B증권", opinion: "중립", targetPrice: 70000, date: "2026-05-13" },
            { firmName: "C증권", opinion: "시장상회", targetPrice: 100000, date: "2026-05-12" },
            { firmName: "D증권", opinion: "매도", targetPrice: 60000, date: "2026-05-11" },
          ],
        },
      }),
    }) as any;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows summary metrics, opinion badges, and paginates three rows at a time", async () => {
    livePrice = 50000;

    render(<AnalystOpinionCard symbol="005930" />);

    expect(await screen.findByText("평균")).toBeTruthy();
    expect(screen.getByText("최고")).toBeTruthy();
    expect(screen.getByText("최근 30일 4건")).toBeTruthy();
    expect(screen.getByText("+60.0%")).toBeTruthy();
    expect(screen.getByText("+100.0%")).toBeTruthy();
    expect(screen.queryByText("KIS real · 실제 응답")).toBeNull();

    expect(screen.getByText("A증권")).toBeTruthy();
    expect(screen.getByText("B증권")).toBeTruthy();
    expect(screen.getByText("C증권")).toBeTruthy();
    expect(screen.queryByText("D증권")).toBeNull();
    expect(screen.getByText("매수").className).toContain("rounded-full");

    fireEvent.click(screen.getByRole("button", { name: "다음" }));

    await waitFor(() => {
      expect(screen.getByText("D증권")).toBeTruthy();
    });
    expect(screen.queryByText("A증권")).toBeNull();
  });

  it("uses live quote price for upside calculations", async () => {
    livePrice = 291500;

    render(<AnalystOpinionCard symbol="005930" />);

    expect(await screen.findByText("현재가 대비")).toBeTruthy();
    expect(screen.getByText("-72.6%")).toBeTruthy();
    expect(screen.getByText("-65.7%")).toBeTruthy();
  });
});
