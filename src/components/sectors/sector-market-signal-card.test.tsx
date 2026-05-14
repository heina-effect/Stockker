import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SectorMarketSignalCard } from "./sector-market-signal-card";

describe("SectorMarketSignalCard", () => {
  beforeEach(() => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        ok: true,
        sectorName: "금융",
        industryName: null,
        industryIndex: null,
        avgRepresentativeChangeRate: 1.2,
        whyNow: "",
        representativeQuotes: [
          { symbol: "105560", name: "KB금융", price: 10000, changeRate: 1.2, volume: 1000 },
        ],
      }),
    }) as any;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("hides fallback copy and representative percent rows while showing watch candidates", async () => {
    render(
      <SectorMarketSignalCard
        sectorId="sec-finance"
        watchCandidates={[{ name: "신한지주", reason: "은행주 배당 흐름 확인" }]}
      />
    );

    expect(await screen.findByText("KIS 업종 흐름")).toBeTruthy();
    expect(screen.getByText("관찰 후보")).toBeTruthy();
    expect(screen.getByText("신한지주")).toBeTruthy();
    expect(screen.queryByText(/KIS 업종코드를 확인하지 못해/)).toBeNull();
    expect(screen.queryByText("KB금융")).toBeNull();
  });
});
