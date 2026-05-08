import { describe, it, expect, vi } from "vitest";
import { fetchGNews } from "./gnews-provider";
import { fetchNewsApi } from "./newsapi-provider";

global.fetch = vi.fn();

describe("News Providers", () => {
  it("GNews provider should normalize articles correctly", async () => {
    process.env.GNEWS_API_KEY = "test";
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        articles: [
          {
            title: "Test GNews",
            description: "Desc",
            url: "http://gnews.com",
            publishedAt: "2026-05-08T00:00:00Z",
            source: { name: "GNews Source" }
          }
        ]
      })
    });

    const results = await fetchGNews({ symbol: "005930" });
    expect(results.length).toBe(1);
    expect(results[0].title).toBe("Test GNews");
    expect(results[0].provider).toBe("GNews Source");
    expect(results[0].rawTextForEmbedding).toBe("Test GNews Desc");
  });

  it("NewsAPI provider should handle missing key gracefully", async () => {
    delete process.env.NEWSAPI_KEY;
    const results = await fetchNewsApi({ symbol: "005930" });
    expect(results.length).toBe(0);
  });
});
