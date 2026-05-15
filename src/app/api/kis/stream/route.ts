import { NextRequest } from "next/server";
import { wsRegistry } from "@/server/kis/ws-registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * SSE (Server-Sent Events) Bridge
 * 브라우저 클라이언트에 KIS 실시간 데이터를 중계합니다.
 */
export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const symbol = searchParams.get("symbol");

    if (!symbol) {
        return new Response("Symbol is required", { status: 400 });
    }

    const responseStream = new TransformStream();
    const writer = responseStream.writable.getWriter();
    const encoder = new TextEncoder();

    const sendEvent = (event: string, data: any) => {
        const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
        writer.write(encoder.encode(message)).catch(() => {});
    };

    // Callback to handle events from registry
    const onKISWebsocketEvent = (event: any) => {
        // Broadcast all events to the client. The client can filter if it wants.
        // Include symbol in the data so client knows which stock/index it is.
        const payload = { 
          ... (event.data || { message: event.message }),
          symbol: event.symbol 
        };
        sendEvent(event.type, payload);
    };

    // Register with singleton registry
    wsRegistry.register(symbol, onKISWebsocketEvent);

    // Initial heartbeat
    sendEvent("status", { message: "connected", symbol });

    // Handle client disconnect
    req.signal.onabort = () => {
        wsRegistry.unregister(symbol, onKISWebsocketEvent);
        clearInterval(heartbeat);
        writer.close().catch(() => {});
    };

    // Heartbeat to keep connection alive
    const heartbeat = setInterval(() => {
        sendEvent("ping", { time: new Date().toISOString() });
    }, 15000);

    return new Response(responseStream.readable, {
        headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache, no-transform",
            "Connection": "keep-alive",
        },
    });
}
