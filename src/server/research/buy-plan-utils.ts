import type { BuyPricePlan } from "@/types/research";

export function calculateProfitLossRate(currentPrice: number, targetPrice: number): number {
  if (targetPrice <= 0) return 0;
  const rate = ((currentPrice - targetPrice) / targetPrice) * 100;
  return parseFloat(rate.toFixed(2));
}

/** 평단가 + 현재가(없으면 null) → BuyPricePlan. 현재가가 유효하지 않으면 수익률을 만들지 않는다. */
export function buildBuyPlan(averagePrice: number, currentPrice: number | null | undefined): BuyPricePlan {
  const ok = typeof currentPrice === "number" && Number.isFinite(currentPrice) && currentPrice > 0;
  return {
    targetPrice: averagePrice,
    currentPrice: ok ? currentPrice : null,
    currentProfitLossRate: ok ? calculateProfitLossRate(currentPrice, averagePrice) : null,
    priceStatus: ok ? "ok" : "unavailable",
    generatedAt: new Date().toISOString(),
  };
}

export function parseFormattedPrice(displayValue: string): number {
  if (!displayValue) return 0;
  const rawNum = displayValue.replace(/[^0-9-]/g, "");
  const parsed = parseInt(rawNum, 10);
  return isNaN(parsed) ? 0 : parsed;
}
