import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

describe("intraday hidden policy", () => {
  it("defaults to daily mode and hides intraday unless explicitly enabled", () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), "src/components/report/daily-candlestick-chart-card.tsx"),
      "utf-8",
    );

    expect(source).toContain('useState<"daily" | "intraday">("daily")');
    expect(source).toContain("NEXT_PUBLIC_ENABLE_INTRADAY_CHART === '1'");
  });
});
