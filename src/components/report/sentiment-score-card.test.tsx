import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SentimentScoreCard } from "./sentiment-score-card";

describe("SentimentScoreCard", () => {
  beforeEach(() => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        ok: true,
        sentiment: {
          score: 93,
          label: "긍정",
          trend: "up",
          generatedAt: "2026-05-14T06:00:00.000Z",
          positiveFactors: [
            "1분기 영업이익 18.4% 증가 및 전력기기 시장 호풍 (Q1 operating profit up 18.4%)",
          ],
          negativeFactors: [
            "원자재 가격 변동 가능성 (Raw material price volatility)",
          ],
          basisSources: [],
        },
      }),
    }) as any;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("hides English parenthetical copies from factor text", async () => {
    render(<SentimentScoreCard symbol="010120" />);

    expect(await screen.findByText("주요 호재")).toBeTruthy();
    expect(screen.getByText("주요 악재")).toBeTruthy();
    expect(screen.getByText("1분기 영업이익 18.4% 증가 및 전력기기 시장 호풍")).toBeTruthy();
    expect(screen.getByText("원자재 가격 변동 가능성")).toBeTruthy();
    expect(screen.queryByText(/Positive|Negative|operating profit|Raw material/)).toBeNull();
  });
});
