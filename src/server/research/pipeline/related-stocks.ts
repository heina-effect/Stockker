import { mockRelatedStocks } from "../mock-data";

export async function generateRelatedStocks(symbol: string) {
    // In real app, AI will determine related stocks based on the recent issues.
    return mockRelatedStocks(symbol);
}
