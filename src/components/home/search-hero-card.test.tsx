import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { SearchHeroCard } from "./search-hero-card";
import { describe, it, expect, beforeEach, vi } from "vitest";

const routerPush = vi.hoisted(() => vi.fn());
const storageState = vi.hoisted(() => ({
  watchlist: ["005930"] as string[],
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: routerPush }),
}));

// Mock local storage adapter
vi.mock("@/lib/user-storage/local-adapter", () => ({
  LocalStorageAdapter: {
    getAll: vi.fn(() => ({
      recentSearches: [{ symbol: "005930", name: "삼성전자" }],
      watchlist: storageState.watchlist,
    })),
    addRecentSearch: vi.fn(),
    addToWatchlist: vi.fn((symbol: string) => {
      if (!storageState.watchlist.includes(symbol)) storageState.watchlist = [...storageState.watchlist, symbol];
    }),
  }
}));

describe("SearchHeroCard Regression Test", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    storageState.watchlist = ["005930"];
    routerPush.mockClear();
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
      ok: true,
      json: async () => ({
        ok: true,
        results: [{ symbol: "000660", name: "SK하이닉스", type: "stock", market: "KOSPI" }],
      }),
    })));

    render(<SearchHeroCard />);
    const input = screen.getByPlaceholderText("삼성전자 또는 005930");
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "SK" } });

    await waitFor(() => {
      expect(screen.getByText("SK하이닉스")).toBeTruthy();
    });

    fireEvent.click(screen.getByLabelText("SK하이닉스 관심 종목 추가"));

    expect(storageState.watchlist).toContain("000660");
    expect(routerPush).not.toHaveBeenCalled();
  });
});
