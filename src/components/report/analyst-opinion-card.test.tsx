import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AnalystOpinionCard } from "./analyst-opinion-card";

let livePrice: number | undefined;

// 픽스처 날짜는 상대값으로 만든다. 카드의 countRecent()가 "오늘 기준 30일 이내"를 세므로
// 고정 날짜를 쓰면 그 날짜가 30일을 넘기는 시점부터 테스트가 저절로 깨진다(실제로 깨졌다).
// vi.setSystemTime 대신 이 방식을 쓴 이유: 이 테스트는 findByText/waitFor로 비동기 갱신을
// 기다리는데, Date까지 가짜로 만들면 폴링이 멈출 수 있다.
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);

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
          updatedAt: new Date().toISOString(),
          _meta: { source: "kis-openapi", kisMode: "real", endpointMode: "real", isMockData: false },
          items: [
            { firmName: "A증권", opinion: "매수", targetPrice: 90000, date: daysAgo(0) },
            { firmName: "B증권", opinion: "중립", targetPrice: 70000, date: daysAgo(1) },
            { firmName: "C증권", opinion: "시장상회", targetPrice: 100000, date: daysAgo(2) },
            { firmName: "D증권", opinion: "매도", targetPrice: 60000, date: daysAgo(3) },
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
