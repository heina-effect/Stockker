import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SectorAISection } from "./sector-ai-section";
import type { SectorResearchSnapshot } from "@/server/research/snapshots/sector-snapshot-manager";

const baseSnapshot: SectorResearchSnapshot = {
  sector_id: "sec-semiconductor",
  name: "반도체",
  description: "",
  trend_strength: 60,
  ai_summary: "요약",
  representative_symbols: ["005930"],
  related_issues: [
    {
      id: "cluster-0",
      title: "이슈 제목",
      summary: "이슈 요약",
      sentiment: "neutral",
      representativeSource: "Open DART",
      sourceCount: 1,
      timestamp: "2026-05-20T09:00:00+09:00",
    },
    {
      id: "cluster-1",
      title: "날짜 없는 이슈",
      summary: "요약",
      sentiment: "neutral",
      representativeSource: "Khan.co.kr",
      sourceCount: 1,
    },
  ],
  created_at: "2026-05-13T12:00:00+09:00",
  updated_at: "2026-05-21T09:00:00+09:00",
};

describe("SectorAISection issue dates", () => {
  it("shows each issue's date next to its source and the snapshot time in the card header", () => {
    render(<SectorAISection snapshot={baseSnapshot} sectorId="sec-semiconductor" />);

    expect(screen.getByText("스냅샷 기준 2026.05.21")).toBeTruthy();
    expect(screen.getByText(/Open DART/).textContent).toBe("Open DART · 2026.05.20");
  });

  it("shows only the source when an issue has no timestamp", () => {
    render(<SectorAISection snapshot={baseSnapshot} sectorId="sec-semiconductor" />);

    expect(screen.getByText(/Khan\.co\.kr/).textContent).toBe("Khan.co.kr");
  });
});
