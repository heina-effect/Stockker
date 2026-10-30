import { describe, it, expect } from "vitest";
import { buildBuyPlan, calculateProfitLossRate, parseFormattedPrice } from "./buy-plan-utils";

describe("Buy Plan Utilities", () => {
  describe("calculateProfitLossRate", () => {
    it("should calculate correct profit rate for a positive scenario", () => {
      // User's prompt: "현재가 226,750 / 평단가 50,000 -> 353.5% 검증"
      const currentPrice = 226750;
      const targetPrice = 50000;
      const rate = calculateProfitLossRate(currentPrice, targetPrice);
      expect(rate).toBe(353.5);
    });

    it("should calculate correct loss rate for a negative scenario", () => {
      const currentPrice = 50000;
      const targetPrice = 100000;
      const rate = calculateProfitLossRate(currentPrice, targetPrice);
      expect(rate).toBe(-50.0);
    });

    it("should return 0 when targetPrice is 0 or negative", () => {
      expect(calculateProfitLossRate(10000, 0)).toBe(0);
      expect(calculateProfitLossRate(10000, -1000)).toBe(0);
    });
  });

  describe("parseFormattedPrice", () => {
    it("should parse comma-separated string correctly", () => {
      expect(parseFormattedPrice("1,234,567")).toBe(1234567);
      expect(parseFormattedPrice(" 50,000 원 ")).toBe(50000);
    });

    it("should handle empty or invalid inputs", () => {
      expect(parseFormattedPrice("")).toBe(0);
      expect(parseFormattedPrice("abc")).toBe(0);
    });
  });

  describe("buildBuyPlan", () => {
    it("현재가가 있으면 평단가·현재가·수익률을 채운다", () => {
      const plan = buildBuyPlan(50000, 226750);
      expect(plan).toMatchObject({ targetPrice: 50000, currentPrice: 226750, currentProfitLossRate: 353.5, priceStatus: "ok" });
    });

    it("현재가 조회 실패(null·0·NaN)면 대체 가격 없이 수익률을 비운다", () => {
      for (const p of [null, undefined, 0, Number.NaN]) {
        const plan = buildBuyPlan(50000, p);
        expect(plan).toMatchObject({ targetPrice: 50000, currentPrice: null, currentProfitLossRate: null, priceStatus: "unavailable" });
      }
    });
  });
});
