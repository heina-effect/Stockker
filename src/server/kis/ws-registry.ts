import "server-only";
import { KISWebsocketClient, type KISWebsocketEvent } from "./ws-client";
import { kisConfig } from "./config";

/**
 * Singleton Registry to manage the KIS WebSocket connection across hot-reloads
 * and multiple SSE instances.
 */

declare global {
    var __kis_ws_registry__: KISWebsocketRegistry | undefined;
}

export class KISWebsocketRegistry {
    private client: KISWebsocketClient;
    private symbolRefCount: Map<string, number> = new Map();
    private subscribers: Set<(event: KISWebsocketEvent) => void> = new Set();

    constructor() {
        this.client = new KISWebsocketClient(kisConfig.mode);
        this.client.onEvent((event) => {
            this.subscribers.forEach(sub => sub(event));
        });
    }

    public async register(symbol: string, callback: (event: KISWebsocketEvent) => void) {
        await this.client.connect();

        // Always ensure indices are subscribed if any connection is active
        const indices = ["0001", "1001"];
        indices.forEach(idx => {
            if (!this.symbolRefCount.has(`index:${idx}`)) {
                this.client.subscribe("index", idx);
                this.symbolRefCount.set(`index:${idx}`, 9999); // Stay subscribed
            }
        });

        const count = this.symbolRefCount.get(symbol) || 0;
        if (count === 0) {
            this.client.subscribe("trade", symbol);
            this.client.subscribe("orderbook", symbol);
        }
        this.symbolRefCount.set(symbol, count + 1);
        this.subscribers.add(callback);
    }

    public unregister(symbol: string, callback: (event: KISWebsocketEvent) => void) {
        const count = this.symbolRefCount.get(symbol) || 0;
        if (count <= 1) {
            this.client.unsubscribe("trade", symbol);
            this.client.unsubscribe("orderbook", symbol);
            this.symbolRefCount.delete(symbol);
        } else {
            this.symbolRefCount.set(symbol, count - 1);
        }
        this.subscribers.delete(callback);
    }
}

export const wsRegistry = globalThis.__kis_ws_registry__ ?? (globalThis.__kis_ws_registry__ = new KISWebsocketRegistry());
