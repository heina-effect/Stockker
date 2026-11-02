import { describe, expect, it, vi } from "vitest";
import { findEntryDay0Mismatches, warnEntryDay0Mismatches } from "./entry-invariant";

// 불변식(2026-11-02): entry_close = day0 종가.
describe("findEntryDay0Mismatches", () => {
  const day0 = [
    { symbol: "000001", discovery_date: "20261030", close: 10000 },
    { symbol: "000002", discovery_date: "20261030", close: "5000" },
  ];

  it("같으면 빈 배열(숫자·문자열 혼재 허용)", () => {
    expect(findEntryDay0Mismatches([{ symbol: "000001", date: "20261030", entry_close: "10000" }, { symbol: "000002", date: "20261030", entry_close: 5000 }], day0)).toEqual([]);
  });

  it("다르면 잡는다", () => {
    expect(findEntryDay0Mismatches([{ symbol: "000001", date: "20261030", entry_close: 9950 }], day0)).toEqual([
      { symbol: "000001", date: "20261030", entryClose: 9950, day0Close: 10000 },
    ]);
  });

  it("entry_close 가 비었는데 day0 가 있으면 불일치", () => {
    expect(findEntryDay0Mismatches([{ symbol: "000001", date: "20261030", entry_close: null }], day0)).toHaveLength(1);
    expect(findEntryDay0Mismatches([{ symbol: "000001", date: "20261030", entry_close: 0 }], day0)).toHaveLength(1);
  });

  it("day0 행이 없으면 비교하지 않는다(발견일·종목이 다른 행과 섞지 않음)", () => {
    expect(findEntryDay0Mismatches([{ symbol: "000001", date: "20261029", entry_close: 1 }, { symbol: "000003", date: "20261030", entry_close: 1 }], day0)).toEqual([]);
  });
});

describe("warnEntryDay0Mismatches", () => {
  function fakeSupabase(items: any[], day0: any[], fail = false) {
    const q = (data: any[]) => {
      const chain: any = { select: () => chain, in: () => chain, eq: () => chain, then: (r: any) => r(fail ? { data: null, error: new Error("down") } : { data, error: null }) };
      return chain;
    };
    return { from: (t: string) => q(t === "overnight_screening_items" ? items : day0) } as any;
  }

  it("불일치마다 경고를 남기고 결과를 돌려준다", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const r = await warnEntryDay0Mismatches(
      fakeSupabase([{ symbol: "000001", date: "20261030", entry_close: 9950 }], [{ symbol: "000001", discovery_date: "20261030", close: 10000 }]),
      [{ symbol: "000001", date: "20261030" }],
      "test"
    );
    expect(r).toHaveLength(1);
    expect(warn.mock.calls.some((c) => String(c[0]).includes("entry_close 9950 ≠ day0 종가 10000"))).toBe(true);
    warn.mockRestore();
  });

  it("조회 실패는 삼키고 경고만", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await expect(warnEntryDay0Mismatches(fakeSupabase([], [], true), [{ symbol: "000001", date: "20261030" }], "test")).resolves.toEqual([]);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
