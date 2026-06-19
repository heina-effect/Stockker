import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { SearchHeroCard } from "./search-hero-card";
import { describe, it, expect, beforeEach, vi } from "vitest";

const storageState = {
  recentSearches: ["005930", "000660"] as any[],
  watchlist: ["005930"] as string[],
};

// Mock local storage adapter
vi.mock("@/lib/user-storage/local-adapter", () => ({
  LocalStorageAdapter: {
    getAll: vi.fn(() => ({ ...storageState })),
    addRecentSearch: vi.fn(),
    addToWatchlist: vi.fn((symbol: string) => {
      if (!storageState.watchlist.includes(symbol)) storageState.watchlist = [...storageState.watchlist, symbol];
    }),
  }
}));

describe("SearchHeroCard Regression Test", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    storageState.recentSearches = ["005930", "000660"];
    storageState.watchlist = ["005930"];
  });

  it("should not show recent searches initially (regression prevention)", () => {
    render(<SearchHeroCard />);
    const dropdownText = screen.queryByText("최근 검색");
    expect(dropdownText).toBeNull();
  });

  it("should show recent searches only when input is focused", async () => {
    render(<SearchHeroCard />);
    const input = screen.getByPlaceholderText("삼성전자 또는 005930");
    
    // Focus the input
    fireEvent.focus(input);
    expect(screen.getByText("최근 검색")).toBeTruthy();

    // Blur the input
    fireEvent.blur(input);
    
    // setTimeout in component logic needs to resolve (200ms)
    await waitFor(() => {
      expect(screen.queryByText("최근 검색")).toBeNull();
    }, { timeout: 500 });
  });

  it("adds a searched stock to the watchlist without navigating", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      json: async () => ({
        ok: true,
        results: [{ symbol: "000660", name: "SK하이닉스", type: "stock", market: "KOSPI" }],
      }),
    })));

    render(<SearchHeroCard />);
    const input = screen.getByPlaceholderText("삼성전자 또는 005930");
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "SK" } });

    const addButton = await screen.findByLabelText("SK하이닉스 관심 종목 추가");
    fireEvent.click(addButton);

    expect(storageState.watchlist).toContain("000660");
    vi.unstubAllGlobals();
  });

  it("does not navigate or save recent search when there are no results", async () => {
    const { LocalStorageAdapter } = await import("@/lib/user-storage/local-adapter");
    vi.stubGlobal("fetch", vi.fn(async () => ({
      json: async () => ({
        ok: true,
        results: [],
      }),
    })));

    render(<SearchHeroCard />);
    const input = screen.getByPlaceholderText("삼성전자 또는 005930");
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "ZZZNOPE" } });
    await screen.findByText("검색 결과가 없습니다.");

    fireEvent.submit(input.closest("form")!);

    expect(LocalStorageAdapter.addRecentSearch).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
