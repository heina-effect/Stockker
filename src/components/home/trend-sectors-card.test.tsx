import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TrendSectorsCard } from "./trend-sectors-card";

vi.mock("./home-intelligence-provider", () => ({
  useHomeIntelligence: () => ({
    data: {
      trendingSectors: [
        {
          sectorId: "sec-semiconductor",
          name: "반도체",
          whyNow: "HBM 관련 근거가 집중됐습니다.",
          representativeSymbols: ["005930", "000660"],
          sourceCount: 3,
        },
        {
          sectorId: "sec-defense",
          name: "방산",
          whyNow: "invalid",
          representativeSymbols: [],
        },
      ],
    },
    isLoading: false,
    error: null,
  }),
}));

describe("TrendSectorsCard", () => {
  it("renders only canonical sector links", () => {
    render(<TrendSectorsCard />);

    const validLink = screen.getByRole("link", { name: /반도체/ });
    expect(validLink.getAttribute("href")).toBe("/sectors/sec-semiconductor");
    expect(screen.queryByText("방산")).toBeNull();
    expect(screen.getByText("근거 3건")).toBeTruthy();
    expect(screen.getByText("주도주")).toBeTruthy();
  });
});
