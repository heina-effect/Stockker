import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getKSTPersistWindow, isAfterKSTMarketClose, kstAfterHoursPriceWarning, kstSessionCacheTag } from "./rest-client";

// 저장 허용 시간대(2026-11-02, 11/03·11/05 개정) — 15:40~16:00 만 허용. 15:30~15:40 은 종가 단일가 임의 종료 구간과
// 정기 실행 전이라 차단. 16:00~20:00 애프터마켓, 20:00 이후는 종가 자리에 애프터마켓 마지막 체결가가 남아 차단.
describe("getKSTPersistWindow", () => {
  beforeEach(() => vi.useFakeTimers({ toFake: ["Date"] }));
  afterEach(() => vi.useRealTimers());

  const setKST = (kstTime: string) => {
    const [h, m, s = 0] = kstTime.split(":").map(Number);
    vi.setSystemTime(new Date(Date.UTC(2026, 9, 30, h - 9, m, s))); // 2026-10-30 KST
  };
  const at = (kstTime: string) => {
    setKST(kstTime);
    return getKSTPersistWindow();
  };

  it.each([
    ["15:29:59", { allowed: false, reason: "before_market_close" }],
    ["15:30:00", { allowed: false, reason: "before_scheduled_run" }],
    ["15:30:30", { allowed: false, reason: "before_scheduled_run" }],
    ["15:39:59", { allowed: false, reason: "before_scheduled_run" }],
    ["15:40:00", { allowed: true }],
    ["15:40:01", { allowed: true }],
    ["15:59:59", { allowed: true }],
    ["16:00:00", { allowed: false, reason: "after_hours_session" }],
    ["16:01", { allowed: false, reason: "after_hours_session" }],
    ["17:59", { allowed: false, reason: "after_hours_session" }],
    ["18:01", { allowed: false, reason: "after_hours_session" }],
    ["19:59", { allowed: false, reason: "after_hours_session" }],
    ["20:00:00", { allowed: false, reason: "after_market_close" }],
    ["20:01", { allowed: false, reason: "after_market_close" }],
    ["23:59", { allowed: false, reason: "after_market_close" }],
  ])("KST %s", (t, expected) => {
    expect(at(t)).toEqual(expected);
  });

  it("15:40:00 정각은 허용 경계 안이다", () => {
    expect(at("15:40:00").allowed).toBe(true);
  });

  it("18:00 은 경계가 아니다", () => {
    expect(at("18:00")).toEqual({ allowed: false, reason: "after_hours_session" });
  });

  it("isAfterKSTMarketClose 는 15:30 경계 그대로다", () => {
    setKST("15:29:59");
    expect(isAfterKSTMarketClose()).toBe(false);
    setKST("15:30:00");
    expect(isAfterKSTMarketClose()).toBe(true);
  });

  // 15:30~15:40 조회가 받은 값이 15:40 저장에 캐시로 재사용되면 저장 창 하한이 뜻을 잃는다
  it.each([
    ["15:29:59", "pre"],
    ["15:30:00", "close"],
    ["15:39:59", "close"],
    ["15:40:00", "post"],
    ["15:59:59", "post"],
    ["16:00:00", "ah"],
    ["19:59:59", "ah"],
    ["20:00:00", "eve"],
  ])("캐시 구간 KST %s → %s", (t, tag) => {
    setKST(t);
    expect(kstSessionCacheTag()).toBe(tag);
  });

  it("오전 장중도 before_market_close", () => {
    expect(at("09:00")).toEqual({ allowed: false, reason: "before_market_close" });
  });
});

describe("kstAfterHoursPriceWarning — 종가 자리에 체결가가 섞이는 시각", () => {
  it.each([
    ["15:39:59", "2026-11-05T06:39:59Z", null],
    ["15:59:59", "2026-11-05T06:59:59Z", null],
    ["16:00:00", "2026-11-05T07:00:00Z", "after_hours"],
    ["19:59:59", "2026-11-05T10:59:59Z", "after_hours"],
    ["20:00:00", "2026-11-05T11:00:00Z", "after_market_close"],
    ["23:59:59", "2026-11-05T14:59:59Z", "after_market_close"],
    ["다음 날 08:00", "2026-11-05T23:00:00Z", null],
  ])("%s", (_label, iso, expected) => {
    expect(kstAfterHoursPriceWarning(new Date(iso).getTime())).toBe(expected);
  });
});
