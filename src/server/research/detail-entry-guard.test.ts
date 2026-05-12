import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

describe("detail entry rate-limit guard", () => {
  it("keeps stock detail generation DB-first with in-flight dedupe", () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), "src/server/research/model-router.ts"),
      "utf-8",
    );

    expect(source).toContain("getStockSnapshot(symbol)");
    expect(source).toContain("snapshotPromiseCache");
    expect(source).toContain("getRecentCuratedSources(symbol, 60 * 60 * 1000)");
  });
});
