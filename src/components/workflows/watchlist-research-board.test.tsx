import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { WatchlistResearchBoard } from "./watchlist-research-board";

const storageState = {
  watchlist: ["005930"],
};

vi.mock("@/lib/user-storage/local-adapter", () => ({
  LocalStorageAdapter: {
    getAll: vi.fn(() => ({ watchlist: storageState.watchlist })),
  },
}));

describe("WatchlistResearchBoard", () => {
  beforeEach(() => {
    storageState.watchlist = ["005930"];
    vi.restoreAllMocks();
  });

  it("renders saved watchlist items using the summary API", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      json: async () => ({
        ok: true,
        items: [{
          symbol: "005930",
          name: "삼성전자",
          sector: { name: "반도체" },
          quote: { price: 70000, change: 500, changeRate: 0.7 },
          aiHeadline: "AI 요약",
          aiSummary: "관심종목 리서치 요약입니다.",
          reportFreshness: "recent",
          sentiment: { score: 64, label: "긍정", trend: "up" },
          issues: [{ id: "i1", title: "핵심 이슈", summary: "요약", sourceCount: 2 }],
          counts: { issueCount: 1, sourceCount: 3, disclosureCount: 1, newsCount: 2 },
          opinion: { avgTargetPrice: 80000, recentOpinionCount: 2, latestOpinion: "매수" },
        }],
      }),
    })));

    render(<WatchlistResearchBoard />);

    await waitFor(() => {
      expect(screen.getByText("AI 요약")).toBeTruthy();
    });
    expect(screen.getByText("반도체")).toBeTruthy();
    expect(screen.getByText("핵심 이슈")).toBeTruthy();
    expect(fetch).toHaveBeenCalledWith("/api/watchlist/summary?symbols=005930");
    vi.unstubAllGlobals();
  });
});
