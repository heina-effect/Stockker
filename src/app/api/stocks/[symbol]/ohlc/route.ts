import { NextRequest, NextResponse } from "next/server";
import { getDomesticStockDaily, getDomesticStockIntraday } from "@/server/kis/rest-client";

export const runtime = "nodejs";

export async function GET(req: NextRequest, { params }: { params: Promise<{ symbol: string }> }) {
    const symbol = (await params).symbol;
    const { searchParams } = new URL(req.url);
    const mode = searchParams.get("mode") || "intraday";

    if (!symbol) {
        return NextResponse.json({ ok: false, error: "Symbol required" }, { status: 400 });
    }

    try {
        if (mode === "intraday") {
            const kisData = await getDomesticStockIntraday(symbol, "153000"); // Request from market close backwards
            
            if (!Array.isArray(kisData) || kisData.length === 0) {
                throw new Error("No data returned from KIS intraday API");
            }
            
            const chart = kisData.map(item => {
                // KIS returns time as "HHMMSS", we want "HH:MM"
                const timeStr = item.stck_cntg_hour;
                const hhmm = timeStr ? `${timeStr.substring(0, 2)}:${timeStr.substring(2, 4)}` : "00:00";
                
                return {
                    time: hhmm,
                    open: Number(item.stck_oprc),
                    high: Number(item.stck_hgpr),
                    low: Number(item.stck_lwpr),
                    close: Number(item.stck_prpr),
                    volume: Number(item.cntg_vol)
                };
            }).reverse(); // KIS returns latest first, we need chronological order

            return NextResponse.json({
                ok: true,
                symbol,
                mode: "intraday",
                chart: chart,
                source: "live"
            });
        }
        
        if (mode === "daily") {
            const kisData = await getDomesticStockDaily(symbol);
            
            if (!Array.isArray(kisData) || kisData.length === 0) {
                throw new Error("No data returned from KIS daily API");
            }
            
            const chart = kisData.map(item => {
                // Return YYYYMMDD as MM-DD or handle in client
                const dateStr = item.stck_bsop_date;
                const mmdd = dateStr ? `${dateStr.substring(4, 6)}/${dateStr.substring(6, 8)}` : "";
                
                return {
                    time: mmdd,
                    open: Number(item.stck_oprc),
                    high: Number(item.stck_hgpr),
                    low: Number(item.stck_lwpr),
                    close: Number(item.stck_clpr),
                    volume: Number(item.acml_vol)
                };
            }).reverse();

            return NextResponse.json({
                ok: true,
                symbol,
                mode: "daily",
                chart: chart,
                source: "live"
            });
        }
        
        return NextResponse.json({ ok: false, error: "Unsupported mode" }, { status: 400 });
    } catch (e) {
        console.error(`[OHLC] Failed for ${symbol} (${mode}):`, e);
        return NextResponse.json({ ok: false, error: String(e), source: "error" }, { status: 500 });
    }
}
