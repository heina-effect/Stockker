import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BuyPricePlanCard } from "./buy-price-plan-card";

const respond = (body: unknown) => {
  global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => body }) as any;
};

async function submit(price: string) {
  render(<BuyPricePlanCard symbol="005930" />);
  fireEvent.change(await screen.findByPlaceholderText("예: 120,000"), { target: { value: price } });
  fireEvent.click(screen.getByRole("button", { name: "수익률 계산" }));
}

describe("BuyPricePlanCard", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it("현재가가 있으면 평단가·현재가·수익률만 보여준다", async () => {
    respond({ ok: true, buyPlan: { targetPrice: 50000, currentPrice: 60000, currentProfitLossRate: 20, priceStatus: "ok", generatedAt: "2026-10-30T00:00:00.000Z" } });
    await submit("50000");
    expect(await screen.findByText("60,000원")).toBeTruthy();
    expect(screen.getByText("+20%")).toBeTruthy();
    expect(screen.queryByText(/가이드|AI/)).toBeNull();
  });

  it("시세 조회 실패면 '현재가 조회 실패'만 보여주고 수익률을 숨긴다", async () => {
    respond({ ok: true, buyPlan: { targetPrice: 50000, currentPrice: null, currentProfitLossRate: null, priceStatus: "unavailable", generatedAt: "2026-10-30T00:00:00.000Z" } });
    await submit("50000");
    expect(await screen.findByText("현재가 조회 실패")).toBeTruthy();
    expect(screen.queryByText("수익률")).toBeNull();
    expect(screen.queryByText(/%$/)).toBeNull();
  });

  it("API 자체가 실패해도 '현재가 조회 실패'로 보여준다", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("network")) as any;
    await submit("50000");
    expect(await screen.findByText("현재가 조회 실패")).toBeTruthy();
    expect(screen.queryByText(/%$/)).toBeNull();
  });
});
