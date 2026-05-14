import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { HomeIntelligenceProvider, useHomeIntelligence } from "./home-intelligence-provider";

function Probe() {
  const { data, isLoading, isRefreshing } = useHomeIntelligence();
  return (
    <div>
      <span data-testid="loading">{String(isLoading)}</span>
      <span data-testid="refreshing">{String(isRefreshing)}</span>
      <span>{data?.issues?.[0]?.title ?? "no-data"}</span>
    </div>
  );
}

describe("HomeIntelligenceProvider stale-first cache", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("renders cached intelligence before background refresh completes", async () => {
    localStorage.setItem("stockker_home_intelligence_v1", JSON.stringify({
      intelligence: { issues: [{ title: "캐시 이슈" }] },
      cachedAt: "2026-05-13T00:00:00.000Z",
    }));

    vi.stubGlobal("fetch", vi.fn(async () => {
      await new Promise(resolve => setTimeout(resolve, 20));
      return {
        ok: true,
        json: async () => ({ intelligence: { issues: [{ title: "새 이슈" }] } }),
      };
    }));

    render(
      <HomeIntelligenceProvider>
        <Probe />
      </HomeIntelligenceProvider>
    );

    await waitFor(() => {
      expect(screen.getByText("캐시 이슈")).toBeTruthy();
      expect(screen.getByTestId("loading").textContent).toBe("false");
    });

    await waitFor(() => {
      expect(screen.getByText("새 이슈")).toBeTruthy();
    });
  });
});
