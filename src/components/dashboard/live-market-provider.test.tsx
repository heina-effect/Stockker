import { render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LiveMarketProvider } from "./live-market-provider";

let pathname = "/";

vi.mock("next/navigation", () => ({
  usePathname: () => pathname,
}));

class MockEventSource {
  url: string;
  close = vi.fn();
  addEventListener = vi.fn();

  constructor(url: string) {
    this.url = url;
    MockEventSource.instances.push(this);
  }

  static instances: MockEventSource[] = [];
}

describe("LiveMarketProvider route-scoped network flow", () => {
  beforeEach(() => {
    MockEventSource.instances = [];
    global.fetch = vi.fn().mockResolvedValue({
      json: async () => ({
        ok: true,
        quote: { symbol: "000660", price: 1000, change: 10, changeRate: 1, volume: 100, timestamp: "now" },
        orderbook: null,
        source: "live",
      }),
    }) as any;
    vi.stubGlobal("EventSource", MockEventSource as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    pathname = "/";
  });

  it("does not bootstrap Samsung or indices on sector pages", async () => {
    pathname = "/sectors/sec-finance";

    render(
      <LiveMarketProvider>
        <div>sector</div>
      </LiveMarketProvider>
    );

    await new Promise(resolve => setTimeout(resolve, 20));

    expect(fetch).not.toHaveBeenCalled();
    expect(MockEventSource.instances).toHaveLength(0);
  });

  it("bootstraps only the active stock symbol on stock pages", async () => {
    pathname = "/stocks/000660";

    render(
      <LiveMarketProvider>
        <div>stock</div>
      </LiveMarketProvider>
    );

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith("/api/kis/bootstrap?symbol=000660", expect.any(Object));
    });

    expect(fetch).not.toHaveBeenCalledWith("/api/kis/bootstrap?symbol=005930", expect.any(Object));
    expect(fetch).not.toHaveBeenCalledWith("/api/kis/bootstrap?symbol=0001&type=index", expect.any(Object));
    expect(fetch).not.toHaveBeenCalledWith("/api/kis/bootstrap?symbol=1001&type=index", expect.any(Object));
    expect(MockEventSource.instances[0]?.url).toBe("/api/kis/stream?symbol=000660");
  });
});
