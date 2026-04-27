import { NextRequest, NextResponse } from "next/server";
import { 
  getDomesticStockQuote, 
  getDomesticStockOrderbook 
} from "@/server/kis/rest-client";
import { kisConfig } from "@/server/kis/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Bootstrap API
 * 주식 상세 화면 진입 시 초기 데이터(현재가, 호가)를 제공합니다.
 */
export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const symbol = searchParams.get("symbol");
    const type = searchParams.get("type"); // 'stock' (default) or 'index'

    if (!symbol) {
        return NextResponse.json({ ok: false, error: "Symbol is required" }, { status: 400 });
    }

    try {
        if (type === "index") {
            const { getDomesticIndex } = await import("@/server/kis/rest-client");
            try {
                const index = await getDomesticIndex(symbol);
                return NextResponse.json({
                    ok: true,
                    symbol,
                    source: "live",
                    index,
                });
            } catch (e: unknown) {
                const msg = e instanceof Error ? e.message : String(e);
                console.warn(`[Bootstrap] Index ${symbol} failed API. Reason:`, msg);
                return NextResponse.json({
                    ok: true, // Allow UI to render with mock fallback
                    symbol,
                    error: msg,
                    source: "mock-fallback",
                    index: {
                        name: symbol === "0001" ? "KOSPI" : "KOSDAQ",
                        value: symbol === "0001" ? 2580.45 : 865.12, // More realistic fallback
                        change: symbol === "0001" ? 15.20 : -2.30,
                        changeRate: symbol === "0001" ? 0.59 : -0.26,
                    }
                });
            }
        }

        // Fetch snapshot data sequentially to avoid EGW00201
        const quote = await getDomesticStockQuote(symbol);
        
        // Wait a bit before the next call to KIS API
        await new Promise(resolve => setTimeout(resolve, 800));
        
        const orderbook = await getDomesticStockOrderbook(symbol);


        return NextResponse.json({
            ok: true,
            symbol,
            source: "live",
            mode: kisConfig.mode,
            quote,
            orderbook,
            fetchedAt: new Date().toISOString()
        });
    } catch (e) {
        console.error(`[Bootstrap] Error for ${symbol}:`, e);
        // Provide consistent mock data even on fatal errors to prevent UI breakage
        return NextResponse.json({
            ok: true,
            symbol,
            source: "mock-fallback",
            error: "실시간 데이터 통신 지연 (Rate Limit 등)",
            quote: {
                symbol,
                name: "연결 대기 중",
                price: 0, // No longer hardcoding 70000
                change: 0,
                changeRate: 0,
                volume: 0,
                high: 0,
                low: 0,
                open: 0,
                timestamp: new Date().toISOString()
            },
            orderbook: {
                symbol,
                levels: Array(10).fill({ askPrice: 70100, askSize: 100, bidPrice: 69900, bidSize: 100 }),
                totalAskSize: 1000,
                totalBidSize: 1000,
                timestamp: new Date().toISOString()
            },
            fetchedAt: new Date().toISOString()
        });
    }
}
