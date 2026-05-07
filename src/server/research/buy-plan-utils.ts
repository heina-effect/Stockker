export function calculateProfitLossRate(currentPrice: number, targetPrice: number): number {
  if (targetPrice <= 0) return 0;
  const rate = ((currentPrice - targetPrice) / targetPrice) * 100;
  return parseFloat(rate.toFixed(2));
}

export function parseFormattedPrice(displayValue: string): number {
  if (!displayValue) return 0;
  const rawNum = displayValue.replace(/[^0-9-]/g, "");
  const parsed = parseInt(rawNum, 10);
  return isNaN(parsed) ? 0 : parsed;
}
