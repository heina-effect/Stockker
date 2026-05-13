import { describe, expect, it } from "vitest";
import { getCanonicalSectorForSymbol } from "./sector-utils";

describe("getCanonicalSectorForSymbol", () => {
  it("maps AprilBio and Peptron to canonical bio sectors without KIS fallback", () => {
    expect(getCanonicalSectorForSymbol("397030")?.sectorId).toBe("sec-biotech");
    expect(getCanonicalSectorForSymbol("087010")?.sectorId).toBe("sec-obesity-bio");
  });

  it("maps LS ELECTRIC peers to real LS symbol, not Hanwha", () => {
    const sector = getCanonicalSectorForSymbol("010120");
    expect(sector?.memberSymbols).toContain("006260");
    expect(sector?.memberSymbols).not.toContain("000880");
  });
});
