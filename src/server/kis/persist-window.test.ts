import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getKSTPersistWindow } from "./rest-client";

// 저장 허용 시간대(2026-11-02, 11/03 개정) — 15:30~16:00 만 허용. 16:00~20:00 애프터마켓, 20:00 이후는
// 종가 자리에 애프터마켓 마지막 체결가가 남아 차단. 경계 앞뒤 1분씩.
describe("getKSTPersistWindow", () => {
  beforeEach(() => vi.useFakeTimers({ toFake: ["Date"] }));
  afterEach(() => vi.useRealTimers());

  const at = (kstHHMM: string) => {
    const [h, m] = kstHHMM.split(":").map(Number);
    vi.setSystemTime(new Date(Date.UTC(2026, 9, 30, h - 9, m))); // 2026-10-30 KST
    return getKSTPersistWindow();
  };

  it.each([
    ["15:29", { allowed: false, reason: "before_market_close" }],
    ["15:31", { allowed: true }],
    ["15:59", { allowed: true }],
    ["16:01", { allowed: false, reason: "after_hours_session" }],
    ["17:59", { allowed: false, reason: "after_hours_session" }],
    ["18:01", { allowed: false, reason: "after_hours_session" }],
    ["19:59", { allowed: false, reason: "after_hours_session" }],
    ["20:01", { allowed: false, reason: "after_market_close" }],
    ["23:59", { allowed: false, reason: "after_market_close" }],
  ])("KST %s", (t, expected) => {
    expect(at(t)).toEqual(expected);
  });

  it("경계 정각: 15:30 허용, 16:00·20:00 차단", () => {
    expect(at("15:30").allowed).toBe(true);
    expect(at("16:00")).toEqual({ allowed: false, reason: "after_hours_session" });
    expect(at("18:00")).toEqual({ allowed: false, reason: "after_hours_session" });
    expect(at("20:00")).toEqual({ allowed: false, reason: "after_market_close" });
  });

  it("오전 장중도 before_market_close", () => {
    expect(at("09:00")).toEqual({ allowed: false, reason: "before_market_close" });
  });
});
