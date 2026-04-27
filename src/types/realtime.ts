export type MarketCode = "KRX" | "NASDAQ" | "INDEX";
export type RealtimeChannel = "trade" | "orderbook" | "index";

export type SocketStatus =
    | "idle"
    | "connecting"
    | "connected"
    | "reconnecting"
    | "disconnected"
    | "error";

export interface StockSubscription {
    symbol: string;
    market: MarketCode;
    channels: RealtimeChannel[];
}

export interface TradeTick {
    type: "trade";
    source: "mock" | "kis";
    symbol: string;
    market: Exclude<MarketCode, "INDEX">;
    price: number;
    change: number;
    changeRate: number;
    volume: number;
    tradeVolume?: number;
    tradeTime: string;
    receivedAt: string;
}

export interface OrderbookLevel {
    askPrice: number;
    bidPrice: number;
    askSize: number;
    bidSize: number;
}

export interface OrderbookTick {
    type: "orderbook";
    source: "mock" | "kis";
    symbol: string;
    market: Exclude<MarketCode, "INDEX">;
    levels: OrderbookLevel[];
    totalAskSize?: number;
    totalBidSize?: number;
    receivedAt: string;
}

export interface IndexTick {
    type: "index";
    source: "mock" | "kis";
    symbol: string;
    market: "INDEX";
    value: number;
    change: number;
    changeRate: number;
    tradeTime: string;
    receivedAt: string;
}

export type RealtimeEvent = TradeTick | OrderbookTick | IndexTick;

export interface RealtimeSnapshot {
    trade?: TradeTick;
    orderbook?: OrderbookTick;
    index?: IndexTick;
}

export type ClientSocketMessage =
    | {
        action: "subscribe";
        items: StockSubscription[];
    }
    | {
        action: "unsubscribe";
        items: StockSubscription[];
    }
    | {
        action: "ping";
    };

export type ServerSocketMessage =
    | {
        type: "connected";
        serverTime: string;
    }
    | {
        type: "subscribed";
        items: StockSubscription[];
    }
    | {
        type: "snapshot";
        events: RealtimeEvent[];
    }
    | {
        type: "event";
        event: RealtimeEvent;
    }
    | {
        type: "error";
        message: string;
        code?: string;
    };