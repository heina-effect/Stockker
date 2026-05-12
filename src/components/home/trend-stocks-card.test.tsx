import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TrendStocksCard } from "./trend-stocks-card";

vi.mock("./home-intelligence-provider", () => ({
  useHomeIntelligence: () => ({
    data: {
      stocks: [
        {
          symbol: "005930",
          name: "삼성전자",
          reason: "HBM 관련 소스가 집중됐습니다.",
          changeRate: 1.5,
          sourceCount: 4,
        },
      ],
    },
    isLoading: false,
    error: null,
  }),
}));

describe("TrendStocksCard", () => {
  it("renders the entire stock card as a link with grounded source count", () => {
    render(<TrendStocksCard />);

    const link = screen.getByRole("link", { name: "삼성전자 리포트 보기" });
    expect(link.getAttribute("href")).toBe("/stocks/005930");
    expect(screen.getByText("근거 4건")).toBeTruthy();
    expect(screen.queryByText("+1.5%")).toBeNull();
    expect(screen.queryByText("1.5%")).toBeNull();
  });
});
