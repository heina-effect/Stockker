import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cacheScopeDataSource, createCacheScope, runInCacheScope, withDedupeAndCache } from "./cache";

// 캐시 우회(2026-11-05) — 우회 호출은 캐시를 읽지도 쓰지도 않는다. 쓰지 않는 쪽이 15:40 저장을 지키는 핵심이다.
const fresh = <T>(fn: () => Promise<T>) => runInCacheScope(createCacheScope(true), fn);
let n = 0;
const key = () => `cache_test_${n++}`;

describe("withDedupeAndCache 캐시 우회", () => {
  it("범위 밖 호출은 기존대로 캐시를 쓴다", async () => {
    const k = key();
    const fetcher = vi.fn().mockResolvedValue("a");
    await withDedupeAndCache(k, 60_000, fetcher);
    await expect(withDedupeAndCache(k, 60_000, fetcher)).resolves.toBe("a");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("우회 호출은 캐시를 읽지 않는다", async () => {
    const k = key();
    await withDedupeAndCache(k, 60_000, async () => "old");
    await expect(fresh(() => withDedupeAndCache(k, 60_000, async () => "new"))).resolves.toBe("new");
  });

  it("우회 호출은 빈 캐시를 채우지 않는다", async () => {
    const k = key();
    await fresh(() => withDedupeAndCache(k, 60_000, async () => "fresh"));
    await expect(withDedupeAndCache(k, 60_000, async () => "regular")).resolves.toBe("regular");
  });

  it("우회 호출은 있던 캐시를 덮어쓰지 않는다", async () => {
    const k = key();
    await withDedupeAndCache(k, 60_000, async () => "old");
    await fresh(() => withDedupeAndCache(k, 60_000, async () => "new"));
    await expect(withDedupeAndCache(k, 60_000, async () => "unused")).resolves.toBe("old");
  });

  it("일반 호출은 진행 중인 우회 호출의 결과를 받아 가지 않는다", async () => {
    const k = key();
    let finish: (v: string) => void = () => {};
    const pending = fresh(() => withDedupeAndCache(k, 60_000, () => new Promise<string>((r) => { finish = r; })));
    await expect(withDedupeAndCache(k, 60_000, async () => "regular")).resolves.toBe("regular");
    finish("fresh");
    await expect(pending).resolves.toBe("fresh");
  });

  it("우회 호출끼리는 진행 중 요청을 공유한다", async () => {
    const k = key();
    const fetcher = vi.fn().mockResolvedValue("fresh");
    await fresh(() => Promise.all([withDedupeAndCache(k, 60_000, fetcher), withDedupeAndCache(k, 60_000, fetcher)]));
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  describe("값을 받은 시각과 출처", () => {
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ["Date"] });
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it("캐시 적중은 처음 받은 시각을 남기고 출처는 cache 다", async () => {
      const [older, newer] = [key(), key()];
      vi.setSystemTime(1000);
      await withDedupeAndCache(older, 60_000, async () => 1);
      vi.setSystemTime(2000);
      await withDedupeAndCache(newer, 60_000, async () => 2);
      vi.setSystemTime(3000);
      const scope = createCacheScope(false);
      await runInCacheScope(scope, async () => {
        await withDedupeAndCache(newer, 60_000, async () => 0);
        await withDedupeAndCache(older, 60_000, async () => 0);
      });
      expect(scope.oldestReceivedAt).toBe(1000);
      expect(scope.newestReceivedAt).toBe(2000);
      expect(cacheScopeDataSource(scope)).toBe("cache");
    });

    it("전부 미스면 받은 시각 중 가장 오래된 것을 남기고 출처는 cache_miss 다", async () => {
      vi.setSystemTime(1000);
      const scope = createCacheScope(false);
      await runInCacheScope(scope, async () => {
        vi.setSystemTime(1500);
        await withDedupeAndCache(key(), 60_000, async () => 1);
        vi.setSystemTime(2500);
        await withDedupeAndCache(key(), 60_000, async () => 2);
      });
      expect(scope.oldestReceivedAt).toBe(1500);
      expect(scope.newestReceivedAt).toBe(2500);
      expect(cacheScopeDataSource(scope)).toBe("cache_miss");
    });

    it("적중과 미스가 섞이면 전에 받아 둔 값의 시각이 가장 오래된 시각이고 출처는 cache 다", async () => {
      const cachedKey = key();
      vi.setSystemTime(1000);
      await withDedupeAndCache(cachedKey, 60_000, async () => 1);
      vi.setSystemTime(5000);
      const scope = createCacheScope(false);
      await runInCacheScope(scope, async () => {
        await withDedupeAndCache(key(), 60_000, async () => 2);
        await withDedupeAndCache(cachedKey, 60_000, async () => 0);
      });
      expect(scope.oldestReceivedAt).toBe(1000);
      expect(scope.newestReceivedAt).toBe(5000);
      expect(cacheScopeDataSource(scope)).toBe("cache");
    });

    it("같은 범위에서 받은 값을 다시 읽은 적중은 캐시를 쓴 것으로 치지 않는다", async () => {
      const k = key();
      vi.setSystemTime(1000);
      const scope = createCacheScope(false);
      await runInCacheScope(scope, async () => {
        vi.setSystemTime(1500);
        await withDedupeAndCache(k, 60_000, async () => 1);
        vi.setSystemTime(2000);
        await withDedupeAndCache(k, 60_000, async () => 0);
      });
      expect(scope.oldestReceivedAt).toBe(1500);
      expect(cacheScopeDataSource(scope)).toBe("cache_miss");
    });

    it("우회 호출은 출처가 fresh 이고 받은 시각을 남긴다", async () => {
      vi.setSystemTime(1000);
      const scope = createCacheScope(true);
      await runInCacheScope(scope, async () => {
        await withDedupeAndCache(key(), 60_000, async () => 1);
      });
      expect(scope.oldestReceivedAt).toBe(1000);
      expect(cacheScopeDataSource(scope)).toBe("fresh");
    });

    it("진행 중인 요청을 함께 기다린 호출도 받은 시각을 남긴다", async () => {
      const k = key();
      let release: (v: number) => void = () => {};
      vi.setSystemTime(1000);
      const first = withDedupeAndCache(k, 60_000, () => new Promise<number>((r) => { release = r; }));
      const scope = createCacheScope(false);
      const second = runInCacheScope(scope, () => withDedupeAndCache(k, 60_000, async () => 0));
      vi.setSystemTime(1700);
      release(1);
      await Promise.all([first, second]);
      expect(scope.oldestReceivedAt).toBe(1700);
      expect(cacheScopeDataSource(scope)).toBe("cache_miss");
    });

    it("실패한 호출은 받은 시각을 남기지 않는다", async () => {
      const scope = createCacheScope(false);
      await runInCacheScope(scope, async () => {
        await expect(withDedupeAndCache(key(), 60_000, async () => { throw new Error("x"); })).rejects.toThrow("x");
      });
      expect(scope.oldestReceivedAt).toBeNull();
    });
  });
});
