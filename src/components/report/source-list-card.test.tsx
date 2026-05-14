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

  it("uses the paginated source endpoint from first load through load more", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes("page=1")) {
        return {
          ok: true,
          json: async () => ({
            ok: true,
            sources: [1, 2, 3, 4, 5].map(n => source(String(n))),
            total: 6,
            hasMore: true,
          }),
        };
      }

      return {
        ok: true,
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
    expect(fetchMock).toHaveBeenCalledWith("/api/stocks/005930/sources?page=1&limit=5");

    fireEvent.click(screen.getByRole("button", { name: /더 보기/ }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/stocks/005930/sources?page=2&limit=5");
    });
  });

  it("does not display collectedAt as a source publication date", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        ok: true,
        sources: [{
          ...source("1"),
          generatedAt: undefined,
          collectedAt: "2026-05-13T09:30:00.000Z",
        }],
        total: 1,
        hasMore: false,
      }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    render(<SourceListCard symbol="005930" />);

    await waitFor(() => {
      expect(screen.getByText("source 1")).toBeTruthy();
    });
    expect(screen.queryByText("발행일")).toBeNull();
  });
});
