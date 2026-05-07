import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { SearchHeroCard } from "./search-hero-card";
import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock local storage adapter
vi.mock("@/lib/user-storage/local-adapter", () => ({
  LocalStorageAdapter: {
    getAll: vi.fn(() => ({ recentSearches: ["005930", "000660"] })),
    addRecentSearch: vi.fn(),
  }
}));

describe("SearchHeroCard Regression Test", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
});
