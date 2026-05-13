import { describe, expect, it, vi } from "vitest";
import { formatResearchDate } from "./date-format";

describe("formatResearchDate", () => {
  it("formats non-today dates as yyyy.mm.dd", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-13T12:00:00+09:00"));
    expect(formatResearchDate("2026-04-30T09:00:00+09:00")).toBe("2026.04.30");
    vi.useRealTimers();
  });

  it("formats today dates as time only", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-13T12:00:00+09:00"));
    expect(formatResearchDate("2026-05-13T09:30:00+09:00")).toMatch(/09:30/);
    vi.useRealTimers();
  });
});
