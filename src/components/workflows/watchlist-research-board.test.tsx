import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { WatchlistResearchBoard } from "./watchlist-research-board";

const storageState = vi.hoisted(() => ({
  watchlist: ["005930"],
}));

vi.mock("@/lib/user-storage/local-adapter", () => ({
  LocalStorageAdapter: {
    getAll: vi.fn(() => ({ watchlist: storageState.watchlist })),
  },
}));

describe("WatchlistResearchBoard", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    storageState.watchlist = ["005930"];
  });

  it("renders saved watchlist items and fetches report data", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      json: async () => ({
        ok: true,
        report: {
          aiHeadline: "근거 기반 요약",
          aiSummary: "관심 종목 리서치가 표시됩니다.",
        },
      }),
    })));

    render(<WatchlistResearchBoard />);

    expect(screen.getByText("삼성전자")).toBeTruthy();
    expect(screen.getByText("리포트 준비 중...")).toBeTruthy();

    await waitFor(() => {
      expect(screen.getByText("근거 기반 요약")).toBeTruthy();
    });
    expect(fetch).toHaveBeenCalledWith("/api/stocks/005930/report");
  });

  it("keeps a visible preparing state when report data is unavailable", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      json: async () => ({ ok: false }),
    })));

    render(<WatchlistResearchBoard />);

    await waitFor(() => {
      expect(screen.getByText(/리포트 준비 중입니다/)).toBeTruthy();
    });
  });
});
