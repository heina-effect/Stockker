import { act, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { LocalStorageAdapter } from "@/lib/user-storage/local-adapter";
import { RecentViewedCard } from "./recent-viewed-card";

describe("RecentViewedCard", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("lists recently viewed stocks newest first, each linking to its detail page", async () => {
    LocalStorageAdapter.addRecentViewed("005930");
    LocalStorageAdapter.addRecentViewed("000660");

    render(<RecentViewedCard />);

    const links = (await screen.findAllByRole("link")).filter(a => a.getAttribute("href")?.startsWith("/stocks/"));
    expect(links.map(a => a.getAttribute("href"))).toEqual(["/stocks/000660", "/stocks/005930"]);
    expect(screen.getByText("000660")).toBeTruthy();
    expect(screen.getByText("005930")).toBeTruthy();
    expect(screen.queryByText("최근 조회한 종목이 없습니다.")).toBeNull();
  });

  it("shows the empty state when nothing has been viewed", async () => {
    render(<RecentViewedCard />);

    expect(await screen.findByText("최근 조회한 종목이 없습니다.")).toBeTruthy();
    expect(screen.queryAllByRole("link").filter(a => a.getAttribute("href")?.startsWith("/stocks/"))).toHaveLength(0);
  });

  it("updates when a stock is viewed in the same tab", async () => {
    render(<RecentViewedCard />);
    expect(await screen.findByText("최근 조회한 종목이 없습니다.")).toBeTruthy();

    act(() => {
      LocalStorageAdapter.addRecentViewed("035420");
    });

    expect(await screen.findByText("035420")).toBeTruthy();
  });
});
