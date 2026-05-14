import { describe, expect, it } from "vitest";
import { getSectorById, isSectorId, resolveSectorId } from "./taxonomy";

describe("sector taxonomy canonical helpers", () => {
  it("accepts valid canonical sector ids", () => {
    expect(isSectorId("sec-semiconductor")).toBe(true);
    expect(getSectorById("sec-semiconductor")?.name).toBe("반도체");
  });

  it("maps display names and aliases to canonical ids", () => {
    expect(resolveSectorId("반도체")).toBe("sec-semiconductor");
    expect(resolveSectorId("HBM")).toBe("sec-semiconductor");
    expect(resolveSectorId("전기차배터리")).toBe("sec-battery");
  });

  it("rejects unmapped sector ids instead of inventing routes", () => {
    expect(resolveSectorId("sec-not-real")).toBeNull();
    expect(resolveSectorId("없는섹터")).toBeNull();
    expect(getSectorById("sec-not-real")).toBeNull();
  });

  it("keeps LS ELECTRIC out of the shipping sector", () => {
    const shipping = getSectorById("sec-shipping");
    expect(shipping?.memberSymbols).not.toContain("010120");
    expect(shipping?.memberSymbols).toEqual(expect.arrayContaining(["011200", "028670", "005880"]));
  });
});
