import { AsyncLocalStorage } from "node:async_hooks";

// In-memory single-flight promise map
const inFlightRequests = new Map<string, Promise<{ data: any; receivedAt: number }>>();

// In-memory short TTL cache
interface CacheEntry {
    data: any;
    expiresAt: number;
    fetchedAt: number;
}
const shortCache = new Map<string, CacheEntry>();

// 호출 하나의 캐시 범위(2026-11-05). bypass 면 그 안의 모든 호출이 캐시를 읽지도 쓰지도 않는다. 쓰지 않는 쪽이 핵심이다 —
// 장중·15:30~15:40 에 새로 받은 값이 캐시에 들어가면 정기 실행이 그 값을 저장할 수 있다.
// 수신 시각은 캐시 적중·미스 구분 없이 "그 값을 KIS 에서 받은 시각"을 남긴다. usedCache 는 이 범위가 시작되기 전에 받아 둔
// 값을 쓴 적이 있는지다 — 같은 범위 안에서 받은 값을 다시 읽은 적중은 캐시를 쓴 것으로 치지 않는다.
export type CacheScope = {
  bypass: boolean;
  startedAt: number;
  oldestReceivedAt: number | null;
  newestReceivedAt: number | null;
  usedCache: boolean;
};
const cacheScope = new AsyncLocalStorage<CacheScope>();

export function createCacheScope(bypass: boolean): CacheScope {
  return { bypass, startedAt: Date.now(), oldestReceivedAt: null, newestReceivedAt: null, usedCache: false };
}

function noteReceived(scope: CacheScope | undefined, receivedAt: number): void {
  if (!scope) return;
  scope.oldestReceivedAt = Math.min(scope.oldestReceivedAt ?? receivedAt, receivedAt);
  scope.newestReceivedAt = Math.max(scope.newestReceivedAt ?? receivedAt, receivedAt);
}

// 응답의 값이 어떻게 왔는지. cache = 전에 받아 둔 값이 하나라도 있다 / cache_miss = 캐시를 쓰려 했으나 전부 새로 받았다 /
// fresh = ?fresh=1 로 캐시를 우회했다
export type DataSource = "cache" | "cache_miss" | "fresh";

export function cacheScopeDataSource(scope: CacheScope): DataSource {
  if (scope.bypass) return "fresh";
  return scope.usedCache ? "cache" : "cache_miss";
}

export function runInCacheScope<T>(scope: CacheScope, fn: () => T): T {
  return cacheScope.run(scope, fn);
}

/** 패턴에 매칭되는 캐시 키를 모두 삭제한다 (예: 특정 symbol의 DailyAround 캐시 무효화). */
export function evictCacheByPattern(pattern: RegExp): number {
  let count = 0;
  for (const key of shortCache.keys()) {
    if (pattern.test(key)) {
      shortCache.delete(key);
      inFlightRequests.delete(key);
      count++;
    }
  }
  return count;
}

/**
 * Wraps a fetch/API call with both Promise Deduplication (Single-flight)
 * and a short time-to-live (TTL) cache.
 * @param key Unique cache/dedupe key (e.g. 'FHKST01010100_000660')
 * @param ttlMs Time to live in milliseconds
 * @param fetcher The function that performs the actual data fetching
 */
export async function withDedupeAndCache<T>(
    key: string,
    ttlMs: number,
    fetcher: () => Promise<T>
): Promise<T> {
    const scope = cacheScope.getStore();
    const bypass = scope?.bypass === true;

    // 1. Check TTL Cache
    const cached = bypass ? undefined : shortCache.get(key);
    if (cached && cached.expiresAt > Date.now()) {
        console.log(`[Cache] HIT for ${key}`);
        noteReceived(scope, cached.fetchedAt);
        if (scope && cached.fetchedAt < scope.startedAt) scope.usedCache = true;
        return cached.data as T;
    }

    // 2. Check In-flight dedupe — 우회 호출은 키를 나눠, 일반 호출이 우회 호출의 결과를 받아 가지 않게 한다
    const flightKey = bypass ? `fresh:${key}` : key;
    const inFlight = inFlightRequests.get(flightKey);
    if (inFlight) {
        console.log(`[Dedupe] Waiting for existing in-flight request: ${flightKey}`);
        const shared = await inFlight;
        noteReceived(scope, shared.receivedAt);
        return shared.data as T;
    }

    // 3. Execute and store in-flight
    const fetchPromise = (async () => {
        try {
            const data = await fetcher();
            const receivedAt = Date.now();
            // On success, save to cache
            if (!bypass) {
                shortCache.set(key, {
                    data,
                    expiresAt: receivedAt + ttlMs,
                    fetchedAt: receivedAt
                });
            }
            return { data, receivedAt };
        } finally {
            // Clean up in-flight regardless of success/fail
            inFlightRequests.delete(flightKey);
        }
    })();

    inFlightRequests.set(flightKey, fetchPromise);
    const { data, receivedAt } = await fetchPromise;
    noteReceived(scope, receivedAt);
    return data as T;
}
