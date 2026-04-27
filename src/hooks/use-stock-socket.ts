"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type {
    IndexTick,
    OrderbookTick,
    RealtimeChannel,
    RealtimeEvent,
    RealtimeSnapshot,
    ServerSocketMessage,
    SocketStatus,
    StockSubscription,
    TradeTick,
} from "@/types/realtime";

const DEFAULT_RECONNECT_INTERVAL_MS = 2_000;
const DEFAULT_MAX_RECONNECT_ATTEMPTS = 20;

function subscriptionId(item: Pick<StockSubscription, "symbol" | "market">) {
    return `${item.market}:${item.symbol}`;
}

function dedupeChannels(channels: RealtimeChannel[]) {
    return Array.from(new Set(channels)).sort();
}

function mergeSubscriptions(items: StockSubscription[]): StockSubscription[] {
    const map = new Map<string, StockSubscription>();

    for (const item of items) {
        const key = subscriptionId(item);
        const prev = map.get(key);

        if (!prev) {
            map.set(key, {
                ...item,
                channels: dedupeChannels(item.channels),
            });
            continue;
        }

        map.set(key, {
            ...prev,
            channels: dedupeChannels([...prev.channels, ...item.channels]),
        });
    }

    return Array.from(map.values()).sort((a, b) =>
        subscriptionId(a).localeCompare(subscriptionId(b))
    );
}

function subtractSubscriptions(
    base: StockSubscription[],
    removing: StockSubscription[]
): StockSubscription[] {
    const removalMap = new Map(
        mergeSubscriptions(removing).map((item) => [
            subscriptionId(item),
            new Set(item.channels),
        ])
    );

    const next: StockSubscription[] = [];

    for (const item of mergeSubscriptions(base)) {
        const removalChannels = removalMap.get(subscriptionId(item));

        if (!removalChannels) {
            next.push(item);
            continue;
        }

        const remainingChannels = item.channels.filter(
            (channel) => !removalChannels.has(channel)
        );

        if (remainingChannels.length > 0) {
            next.push({
                ...item,
                channels: remainingChannels,
            });
        }
    }

    return next;
}

function eventId(event: RealtimeEvent) {
    return `${event.market}:${event.symbol}`;
}

function defaultSocketUrl(endpoint?: string) {
    if (endpoint) return endpoint;

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    return `${protocol}//${window.location.host}/api/realtime/stock`;
}

function isSocketOpen(socket: WebSocket | null): socket is WebSocket {
    return socket !== null && socket.readyState === WebSocket.OPEN;
}

export interface UseStockSocketOptions {
    endpoint?: string;
    autoConnect?: boolean;
    reconnect?: boolean;
    reconnectIntervalMs?: number;
    maxReconnectAttempts?: number;
    initialSubscriptions?: StockSubscription[];
    onEvent?: (event: RealtimeEvent) => void;
    onTrade?: (tick: TradeTick) => void;
    onOrderbook?: (tick: OrderbookTick) => void;
    onIndex?: (tick: IndexTick) => void;
}

export interface UseStockSocketResult {
    status: SocketStatus;
    isConnected: boolean;
    error: string | null;
    lastEventAt: number | null;
    subscriptions: StockSubscription[];
    snapshots: Record<string, RealtimeSnapshot>;
    connect: () => void;
    disconnect: () => void;
    subscribe: (items: StockSubscription | StockSubscription[]) => void;
    unsubscribe: (items: StockSubscription | StockSubscription[]) => void;
    replaceSubscriptions: (items: StockSubscription[]) => void;
    getSnapshot: (
        symbol: string,
        market?: StockSubscription["market"]
    ) => RealtimeSnapshot | undefined;
}

export function useStockSocket(
    options: UseStockSocketOptions = {}
): UseStockSocketResult {
    const {
        endpoint,
        autoConnect = true,
        reconnect = true,
        reconnectIntervalMs = DEFAULT_RECONNECT_INTERVAL_MS,
        maxReconnectAttempts = DEFAULT_MAX_RECONNECT_ATTEMPTS,
        initialSubscriptions = [],
        onEvent,
        onTrade,
        onOrderbook,
        onIndex,
    } = options;

    const [status, setStatus] = useState<SocketStatus>("idle");
    const [error, setError] = useState<string | null>(null);
    const [lastEventAt, setLastEventAt] = useState<number | null>(null);
    const [subscriptions, setSubscriptions] = useState<StockSubscription[]>(
        mergeSubscriptions(initialSubscriptions)
    );
    const [snapshots, setSnapshots] = useState<Record<string, RealtimeSnapshot>>(
        {}
    );

    const socketRef = useRef<WebSocket | null>(null);
    const manualCloseRef = useRef(false);
    const reconnectAttemptsRef = useRef(0);
    const reconnectTimerRef = useRef<number | null>(null);
    const subscriptionsRef = useRef<StockSubscription[]>(
        mergeSubscriptions(initialSubscriptions)
    );

    const callbacksRef = useRef({
        onEvent,
        onTrade,
        onOrderbook,
        onIndex,
    });

    useEffect(() => {
        callbacksRef.current = {
            onEvent,
            onTrade,
            onOrderbook,
            onIndex,
        };
    }, [onEvent, onTrade, onOrderbook, onIndex]);

    const sendMessage = useCallback((message: unknown) => {
        if (!isSocketOpen(socketRef.current)) return;
        socketRef.current.send(JSON.stringify(message));
    }, []);

    const applyRealtimeEvent = useCallback((event: RealtimeEvent) => {
        setLastEventAt(Date.now());

        setSnapshots((prev) => {
            const key = eventId(event);
            const current = prev[key] ?? {};

            if (event.type === "trade") {
                return {
                    ...prev,
                    [key]: {
                        ...current,
                        trade: event,
                    },
                };
            }

            if (event.type === "orderbook") {
                return {
                    ...prev,
                    [key]: {
                        ...current,
                        orderbook: event,
                    },
                };
            }

            return {
                ...prev,
                [key]: {
                    ...current,
                    index: event,
                },
            };
        });

        callbacksRef.current.onEvent?.(event);

        if (event.type === "trade") {
            callbacksRef.current.onTrade?.(event);
            return;
        }

        if (event.type === "orderbook") {
            callbacksRef.current.onOrderbook?.(event);
            return;
        }

        callbacksRef.current.onIndex?.(event);
    }, []);

    const handleServerMessage = useCallback(
        (message: ServerSocketMessage) => {
            if (message.type === "error") {
                setError(message.message);
                setStatus("error");
                return;
            }

            if (message.type === "event") {
                applyRealtimeEvent(message.event);
                return;
            }

            if (message.type === "snapshot") {
                for (const event of message.events) {
                    applyRealtimeEvent(event);
                }
            }
        },
        [applyRealtimeEvent]
    );

    const clearReconnectTimer = useCallback(() => {
        if (reconnectTimerRef.current !== null) {
            window.clearTimeout(reconnectTimerRef.current);
            reconnectTimerRef.current = null;
        }
    }, []);

    const disconnect = useCallback(() => {
        manualCloseRef.current = true;
        clearReconnectTimer();

        const socket = socketRef.current;
        socketRef.current = null;

        if (
            socket &&
            (socket.readyState === WebSocket.OPEN ||
                socket.readyState === WebSocket.CONNECTING)
        ) {
            socket.close();
        }

        setStatus("disconnected");
    }, [clearReconnectTimer]);

    const connect = useCallback(() => {
        const current = socketRef.current;
        if (
            current &&
            (current.readyState === WebSocket.OPEN ||
                current.readyState === WebSocket.CONNECTING)
        ) {
            return;
        }

        manualCloseRef.current = false;
        clearReconnectTimer();
        setError(null);
        setStatus((prev) =>
            prev === "reconnecting" ? "reconnecting" : "connecting"
        );

        const socket = new WebSocket(defaultSocketUrl(endpoint));
        socketRef.current = socket;

        socket.onopen = () => {
            reconnectAttemptsRef.current = 0;
            setStatus("connected");

            if (subscriptionsRef.current.length > 0) {
                sendMessage({
                    action: "subscribe",
                    items: subscriptionsRef.current,
                });
            }
        };

        socket.onmessage = (event) => {
            try {
                const parsed = JSON.parse(String(event.data)) as ServerSocketMessage;
                handleServerMessage(parsed);
            } catch {
                setError("실시간 메시지 파싱에 실패했습니다.");
            }
        };

        socket.onerror = () => {
            setError("실시간 소켓 연결 중 오류가 발생했습니다.");
            setStatus("error");
        };

        socket.onclose = () => {
            socketRef.current = null;

            if (manualCloseRef.current) {
                setStatus("disconnected");
                return;
            }

            if (!reconnect) {
                setStatus("disconnected");
                return;
            }

            if (reconnectAttemptsRef.current >= maxReconnectAttempts) {
                setStatus("disconnected");
                setError("재연결 횟수를 초과했습니다.");
                return;
            }

            reconnectAttemptsRef.current += 1;
            setStatus("reconnecting");

            reconnectTimerRef.current = window.setTimeout(() => {
                connect();
            }, reconnectIntervalMs);
        };
    }, [
        clearReconnectTimer,
        endpoint,
        handleServerMessage,
        maxReconnectAttempts,
        reconnect,
        reconnectIntervalMs,
        sendMessage,
    ]);

    const subscribe = useCallback(
        (items: StockSubscription | StockSubscription[]) => {
            const normalized = Array.isArray(items) ? items : [items];
            const next = mergeSubscriptions([
                ...subscriptionsRef.current,
                ...normalized,
            ]);

            subscriptionsRef.current = next;
            setSubscriptions(next);

            sendMessage({
                action: "subscribe",
                items: normalized,
            });
        },
        [sendMessage]
    );

    const unsubscribe = useCallback(
        (items: StockSubscription | StockSubscription[]) => {
            const normalized = Array.isArray(items) ? items : [items];
            const next = subtractSubscriptions(subscriptionsRef.current, normalized);

            subscriptionsRef.current = next;
            setSubscriptions(next);

            sendMessage({
                action: "unsubscribe",
                items: normalized,
            });
        },
        [sendMessage]
    );

    const replaceSubscriptions = useCallback(
        (items: StockSubscription[]) => {
            const next = mergeSubscriptions(items);
            const prev = subscriptionsRef.current;

            subscriptionsRef.current = next;
            setSubscriptions(next);

            if (prev.length > 0) {
                sendMessage({
                    action: "unsubscribe",
                    items: prev,
                });
            }

            if (next.length > 0) {
                sendMessage({
                    action: "subscribe",
                    items: next,
                });
            }
        },
        [sendMessage]
    );

    const getSnapshot = useCallback(
        (symbol: string, market: StockSubscription["market"] = "KRX") => {
            return snapshots[`${market}:${symbol}`];
        },
        [snapshots]
    );

    useEffect(() => {
        if (!autoConnect) return;

        connect();

        return () => {
            disconnect();
        };
    }, [autoConnect, connect, disconnect]);

    return {
        status,
        isConnected: status === "connected",
        error,
        lastEventAt,
        subscriptions,
        snapshots,
        connect,
        disconnect,
        subscribe,
        unsubscribe,
        replaceSubscriptions,
        getSnapshot,
    };
}