import { beforeEach, describe, expect, it, vi } from "vitest";

const upsert = vi.fn();
let existingRow: Record<string, unknown> | null = null;
let clusters: Record<string, unknown>[] = [];
let summaryResult: Record<string, unknown> = { summary: "요약", trendStrength: 60, leaders: [], laggards: [], watchCandidates: [] };

vi.mock("@/lib/supabase/client", () => ({
  getSupabaseAdmin: () => ({
    from: () => ({
      upsert: (...args: unknown[]) => {
        upsert(...args);
        return Promise.resolve({ error: null });
      },
      select: () => ({
        eq: () => ({
          maybeSingle: () => Promise.resolve({ data: existingRow, error: null }),
        }),
      }),
    }),
  }),
}));

vi.mock("@/lib/stocks/db-registry", () => ({
  getDBSectorUniverse: async () => ({
    "sec-test": { sectorId: "sec-test", name: "테스트", description: "", representativeSymbols: ["000001"], memberSymbols: ["000001"] },
  }),
}));

vi.mock("@/server/research/model-router", () => ({
  generateIssues: async () => ({ clusters, sources: [] }),
}));

vi.mock("@/server/ai/orchestrator", () => ({
  aiSummarizeSector: async () => summaryResult,
}));

const issue = { id: "c1", title: "이슈", summary: "s", sentiment: "neutral", representativeSource: "Open DART", sourceCount: 1, timestamp: "2026-11-09T15:00:00.000Z" };
const oldRow = { sector_id: "sec-test", related_issues: [issue], ai_summary: "이전 요약", updated_at: "2026-05-21T15:17:38.735Z" };

describe("generateSectorSnapshot", () => {
  beforeEach(() => {
    upsert.mockReset();
    existingRow = null;
    clusters = [];
    summaryResult = { summary: "요약", trendStrength: 60, leaders: [], laggards: [], watchCandidates: [] };
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  it("does not overwrite an existing snapshot with a result that has zero issues", async () => {
    existingRow = oldRow;
    summaryResult = { summary: "해당 섹터에 대한 충분한 최신 데이터가 없습니다.", trendStrength: 50, failed: true };

    const { generateSectorSnapshot } = await import("./sector-snapshot-manager");
    const result = await generateSectorSnapshot("sec-test");

    expect(upsert).not.toHaveBeenCalled();
    expect(result).toEqual(oldRow);
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining("sector=sec-test reason=no_issues"));
  });

  it("saves a zero-issue result when no snapshot exists yet (first generation)", async () => {
    existingRow = null;

    const { generateSectorSnapshot } = await import("./sector-snapshot-manager");
    await generateSectorSnapshot("sec-test");

    expect(upsert).toHaveBeenCalledTimes(1);
    expect(upsert.mock.calls[0][0]).toEqual(expect.objectContaining({ sector_id: "sec-test", related_issues: [] }));
  });

  it("does not overwrite an existing snapshot when the AI summary failed", async () => {
    existingRow = oldRow;
    clusters = [issue];
    summaryResult = { summary: "해당 섹터에 대한 분석 중 오류가 발생했습니다.", trendStrength: 50, failed: true };

    const { generateSectorSnapshot } = await import("./sector-snapshot-manager");
    await generateSectorSnapshot("sec-test");

    expect(upsert).not.toHaveBeenCalled();
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining("reason=summary_failed"));
  });

  it("overwrites an existing snapshot with a successful result even if watch candidates are empty", async () => {
    existingRow = oldRow;
    clusters = [issue];

    const { generateSectorSnapshot } = await import("./sector-snapshot-manager");
    await generateSectorSnapshot("sec-test");

    expect(upsert).toHaveBeenCalledTimes(1);
    expect(upsert.mock.calls[0][0]).toEqual(expect.objectContaining({ ai_summary: "요약", watch_candidates: [] }));
  });
});
