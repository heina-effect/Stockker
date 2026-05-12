import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SourceListCard } from "./source-list-card";

function source(id: string) {
  return {
    id,
    sourceType: "news",
    title: `source ${id}`,
    provider: "News",
    collectedAt: new Date().toISOString(),
    generatedAt: new Date().toISOString(),
    url: `https://example.com/${id}`,
  };
}

describe("SourceListCard pagination", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("keeps the paginated source endpoint for load more", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes("/issues")) {
        return {
          json: async () => ({
            ok: true,
            sources: [1, 2, 3, 4, 5, 6].map(n => source(String(n))),
          }),
        };
      }

      return {
        json: async () => ({
          ok: true,
          sources: [source("6")],
          hasMore: false,
        }),
      };
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<SourceListCard symbol="005930" />);

    await waitFor(() => {
      expect(screen.getByText("source 1")).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("button", { name: /더 보기/ }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/stocks/005930/sources?page=2&limit=5");
    });
  });
});
