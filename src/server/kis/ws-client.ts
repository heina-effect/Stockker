import "server-only";
import WebSocket from "ws";
import { kisConfig } from "./config";
import { getKisApprovalKey } from "./approval";

/**
 * KIS WebSocket Client Wrapper
 * 서버 사이드에서 KIS와 상시 연결을 유지하고 이벤트를 방출합니다.
 */

export type KISWebsocketEvent = {
    type: "trade" | "orderbook" | "index" | "error" | "connected";
    symbol: string;
    data?: unknown;
    message?: string;
};

export class KISWebsocketClient {
    private ws: WebSocket | null = null;
    private approvalKey: string | null = null;
    private status: "idle" | "connecting" | "connected" | "disconnected" = "idle";
    private activeSubscriptions: Set<string> = new Set();
    private eventHandlers: ((event: KISWebsocketEvent) => void)[] = [];

    constructor(private mode: "real" | "mock") {}

    public async connect() {
        if (this.status === "connecting" || this.status === "connected") return;

        this.status = "connecting";
        try {
            this.approvalKey = await getKisApprovalKey();
            const url = this.mode === "real" 
                ? "ws://ops.koreainvestment.com:21000" 
                : "ws://ops.koreainvestment.com:31000";

            this.ws = new WebSocket(url);

            this.ws.on("open", () => {
                this.status = "connected";
                console.log(`[KIS WS] Connected to ${this.mode} server`);
                this.emit({ type: "connected", symbol: "ALL" });
                
                // Re-subscribe to active symbols if needed
                this.activeSubscriptions.forEach(sub => {
                    const [type, symbol] = sub.split(":");
                    this.sendSubscribe(type as "trade" | "orderbook" | "index", symbol);
                });
            });

            this.ws.on("message", (data) => {
                this.handleMessage(data.toString());
            });

            this.ws.on("error", (err) => {
                console.error(`[KIS WS] Error:`, err);
                this.emit({ type: "error", symbol: "ALL", message: err.message });
            });

            this.ws.on("close", () => {
                this.status = "disconnected";
                console.log(`[KIS WS] Disconnected`);
                // Auto-reconnect logic could go here
            });

        } catch (e) {
            this.status = "disconnected";
            console.error(`[KIS WS] Connection failed:`, e);
        }
    }

    public subscribe(type: "trade" | "orderbook" | "index", symbol: string) {
        const key = `${type}:${symbol}`;
        if (this.activeSubscriptions.has(key)) return;

        this.activeSubscriptions.add(key);
        if (this.status === "connected") {
            this.sendSubscribe(type, symbol);
        }
    }

    public unsubscribe(type: "trade" | "orderbook" | "index", symbol: string) {
        const key = `${type}:${symbol}`;
        if (!this.activeSubscriptions.has(key)) return;

        this.activeSubscriptions.delete(key);
        if (this.status === "connected") {
            this.sendUnsubscribe(type, symbol);
        }
    }

    public onEvent(handler: (event: KISWebsocketEvent) => void) {
        this.eventHandlers.push(handler);
    }

    private emit(event: KISWebsocketEvent) {
        this.eventHandlers.forEach(h => h(event));
    }

    private sendSubscribe(type: "trade" | "orderbook" | "index", symbol: string) {
        if (!this.ws || this.status !== "connected") return;
        
        let trId = "";
        if (type === "trade") trId = "H0STCNT0";
        else if (type === "orderbook") trId = "H0STASP0";
        else if (type === "index") trId = "H0STISNM0";

        const payload = {
            header: {
                approval_key: this.approvalKey,
                custtype: kisConfig.customerType,
                tr_type: "1", // Subscribe
                "content-type": "utf-8"
            },
            body: {
                input: {
                    tr_id: trId,
                    tr_key: symbol
                }
            }
        };
        this.ws.send(JSON.stringify(payload));
    }

    private sendUnsubscribe(type: "trade" | "orderbook" | "index", symbol: string) {
        if (!this.ws || this.status !== "connected") return;
        
        let trId = "";
        if (type === "trade") trId = "H0STCNT0";
        else if (type === "orderbook") trId = "H0STASP0";
        else if (type === "index") trId = "H0STISNM0";

        const payload = {
            header: {
                approval_key: this.approvalKey,
                custtype: kisConfig.customerType,
                tr_type: "2", // Unsubscribe
                "content-type": "utf-8"
            },
            body: {
                input: {
                    tr_id: trId,
                    tr_key: symbol
                }
            }
        };
        this.ws.send(JSON.stringify(payload));
    }

    private handleMessage(raw: string) {
        if (raw.startsWith("{")) return;

        const parts = raw.split("|");
        if (parts.length < 4) return;

        const trId = parts[1];
        const symbol = parts[3];
        const bodyStr = parts[parts.length - 1];

        if (trId === "H0STISNM0") {
            // Index data parsing
            // BUSINESS_TIME ^ bstp_nmpr ^ prdy_vrss ^ prdy_ctrt ^ ...
            const bodyParts = bodyStr.split("^");
            this.emit({
                type: "index",
                symbol,
                data: {
                    value: Number(bodyParts[1]),
                    change: Number(bodyParts[2]),
                    changeRate: Number(bodyParts[3]),
                }
            });
            return;
        }

        if (trId === "H0STCNT0") {
            // Trade data parsing (current price)
            const bodyParts = bodyStr.split("^");
            this.emit({ 
                type: "trade", 
                symbol, 
                data: {
                    price: Number(bodyParts[2]),
                    change: Number(bodyParts[3]),
                    changeRate: Number(bodyParts[4]),
                    volume: Number(bodyParts[12]),
                } 
            });
        } else if (trId === "H0STASP0") {
            // Orderbook data
            // We pass raw or simple object
            this.emit({ type: "orderbook", symbol, data: bodyStr });
        }
    }
}
