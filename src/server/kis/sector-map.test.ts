import { describe, expect, it } from "vitest";
import { SECTOR_UNIVERSE } from "@/data/sectors/taxonomy";
import { resolveKisSectorId } from "./sector-map";

describe("resolveKisSectorId", () => {
  it("returns only canonical sector ids or null", () => {
    const samples = [
      resolveKisSectorId("0013", "전기·전자"),
      resolveKisSectorId("1024", "제약"),
      resolveKisSectorId("0029", "IT 서비스"),
      resolveKisSectorId("0005", "음식료·담배"),
    ];

    for (const sectorId of samples) {
      expect(sectorId === null || Object.prototype.hasOwnProperty.call(SECTOR_UNIVERSE, sectorId)).toBe(true);
    }
  });

  it("does not map generic service industry to platform", () => {
    expect(resolveKisSectorId("1006", "일반서비스")).toBeNull();
    expect(resolveKisSectorId(undefined, "일반서비스")).toBeNull();
  });
});
