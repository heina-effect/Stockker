// In-memory single-flight promise map
const inFlightRequests = new Map<string, Promise<any>>();

// In-memory short TTL cache
interface CacheEntry {
    data: any;
    expiresAt: number;
}
const shortCache = new Map<string, CacheEntry>();

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
    // 1. Check TTL Cache
    const cached = shortCache.get(key);
    if (cached && cached.expiresAt > Date.now()) {
        console.log(`[Cache] HIT for ${key}`);
        return cached.data as T;
    }

    // 2. Check In-flight dedupe
    if (inFlightRequests.has(key)) {
        console.log(`[Dedupe] Waiting for existing in-flight request: ${key}`);
        return inFlightRequests.get(key)!;
    }

    // 3. Execute and store in-flight
    const fetchPromise = (async () => {
        try {
            const data = await fetcher();
            // On success, save to cache
            shortCache.set(key, {
                data,
                expiresAt: Date.now() + ttlMs
            });
            return data;
        } finally {
            // Clean up in-flight regardless of success/fail
            inFlightRequests.delete(key);
        }
    })();

    inFlightRequests.set(key, fetchPromise);
    return fetchPromise;
}
