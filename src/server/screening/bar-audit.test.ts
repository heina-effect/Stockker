import { describe, expect, it } from "vitest";
import { classifyStoredBar, isSameDayPersistWindowSave } from "./bar-audit";

// 대조 판정(2026-11-03) — 당일 15:30~16:00 저장분의 거래량 부족은 정상으로 분류한다. 과거 행 기준이라 11/05 저장 창 하한(15:40)을 따라가지 않는다.
const kis = { open: 100, high: 110, low: 95, close: 105, volume: 1000 };
const row = (kstHHMM: string, over: Partial<typeof kis> = {}, kstDate = "2026-11-02") => ({
  ...kis, ...over, trade_date: "20261102",
  created_at: new Date(`${kstDate}T${kstHHMM}:00+09:00`).toISOString(),
});

describe("isSameDayPersistWindowSave", () => {
  it.each([
    ["15:29", false],
    ["15:30", true],
    ["15:39", true],
    ["15:59", true],
    ["16:00", false],
    ["20:30", false],
  ])("거래일 당일 KST %s 저장 → %s", (t, expected) => {
    expect(isSameDayPersistWindowSave(row(t).created_at, "20261102")).toBe(expected);
  });

  it("다음 날 저장은 당일 저장이 아니다", () => {
    expect(isSameDayPersistWindowSave(row("15:40", {}, "2026-11-03").created_at, "20261102")).toBe(false);
  });
});

describe("classifyStoredBar", () => {
  it("전부 같으면 match", () => {
    expect(classifyStoredBar(row("15:40"), kis)).toBe("match");
  });

  it("당일 15:40 저장, 거래량만 작으면 정상(regular_session_volume)", () => {
    expect(classifyStoredBar(row("15:40", { volume: 900 }), kis)).toBe("regular_session_volume");
  });

  it("거래량이 확정값보다 크면 정상 경우가 아니다", () => {
    expect(classifyStoredBar(row("15:40", { volume: 1100 }), kis)).toBe("volume_mismatch");
  });

  it.each(["15:20", "16:18"])("당일 %s 저장(허용 구간 밖)의 거래량 부족은 불일치", (t) => {
    expect(classifyStoredBar(row(t, { volume: 900 }), kis)).toBe("volume_mismatch");
  });

  it("다음 날 저장분의 거래량 부족은 불일치", () => {
    expect(classifyStoredBar(row("15:40", { volume: 900 }, "2026-11-03"), kis)).toBe("volume_mismatch");
  });

  it("가격이 하나라도 다르면 거래량과 관계없이 price_mismatch", () => {
    expect(classifyStoredBar(row("15:40", { close: 104, volume: 900 }), kis)).toBe("price_mismatch");
    expect(classifyStoredBar(row("15:40", { high: 111 }), kis)).toBe("price_mismatch");
  });
});
