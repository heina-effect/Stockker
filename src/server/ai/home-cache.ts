/**
 * Home Intelligence Cache — Phase 18 / Phase 29 업데이트
 * Implements: TTL cache + in-flight dedupe + stale-while-revalidate + sector momentum signals
 */
import { aiGenerateHomeIntelligence } from "./orchestrator";
import { normalizeHomeIntelligence } from "./home-intelligence-normalizer";
import { getDBSectorUniverse } from "@/lib/stocks/db-registry";
import { computeSectorMomentumSignals, applyMomentumSignals } from "@/server/research/sector-momentum";

const TTL_MS = 15 * 60 * 1000;          // 15 minutes fresh
const STALE_WINDOW_MS = 5 * 60 * 1000;  // serve stale for up to 5 extra minutes while refreshing
const MOMENTUM_TIMEOUT_MS = 1200;

let cachedIntelligence: any = null;
let lastFetched = 0;
let inFlightPromise: Promise<any> | null = null;

function isStale(now: number): boolean {
  return now - lastFetched >= TTL_MS;
}
function isExpired(now: number): boolean {
  return now - lastFetched >= TTL_MS + STALE_WINDOW_MS;
}

function hasMeaningfulHomeContent(value: any): boolean {
  return Boolean(
    (Array.isArray(value?.issues) && value.issues.length > 0) ||
    (Array.isArray(value?.stocks) && value.stocks.length > 0) ||
    (Array.isArray(value?.trendingSectors) && value.trendingSectors.length > 0) ||
    (Array.isArray(value?.sectors) && value.sectors.length > 0) ||
    (Array.isArray(value?.aiPicks) && value.aiPicks.length > 0)
  );
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, fallback: T): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | null = null;

  try {
    return await Promise.race([
      promise,
      new Promise<T>(resolve => {
        timeout = setTimeout(() => resolve(fallback), timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

export async function getHomeIntelligence(): Promise<any> {
  const now = Date.now();

  // ── Cache hit: fresh ──────────────────────────────────────────────────────
  if (cachedIntelligence && !isStale(now)) {
    return { ...cachedIntelligence, _cacheState: "hit" };
  }

  // ── Stale-while-revalidate: return stale, kick off background refresh ─────
  if (cachedIntelligence && !isExpired(now)) {
    if (!inFlightPromise) {
      inFlightPromise = refreshCache().finally(() => { inFlightPromise = null; });
    }
    return { ...cachedIntelligence, _cacheState: "stale" };
  }

  // ── Cache miss or expired: must wait for fresh data ──────────────────────
  if (inFlightPromise) return inFlightPromise;

  inFlightPromise = refreshCache().finally(() => { inFlightPromise = null; });
  return inFlightPromise;
}

async function refreshCache(): Promise<any> {
  try {
    const vectorStore = (await import("@/server/ai/vector-store")).getVectorStore();
    const recentSources = await vectorStore.getGlobalRecentCuratedSources(30);
    const sectorUniverse = await getDBSectorUniverse();

    const aiRaw = await aiGenerateHomeIntelligence(recentSources);
    const fresh = normalizeHomeIntelligence(aiRaw, recentSources, sectorUniverse);

    // 섹터 모멘텀 신호로 trendingSectors 보정 (non-blocking, 실패 시 원본 유지)
    try {
      const visibleSectorUniverse = Object.fromEntries(
        (fresh.trendingSectors || [])
          .map((sector: any) => [sector.sectorId, sectorUniverse[sector.sectorId]])
          .filter((entry: any[]) => Boolean(entry[0] && entry[1]))
      );
      const momentumSignals = await withTimeout(
        computeSectorMomentumSignals(visibleSectorUniverse),
        MOMENTUM_TIMEOUT_MS,
        new Map(),
      );
      if (momentumSignals.size > 0) {
        fresh.trendingSectors = applyMomentumSignals(fresh.trendingSectors || [], momentumSignals);
        fresh.sectors = fresh.trendingSectors;
      }
    } catch (e) {
      console.warn("[HomeCache] Sector momentum signal failed (non-fatal):", e);
    }

    // Only cache if there is meaningful content (not just a meta error shell)
    if (hasMeaningfulHomeContent(fresh)) {
      // aiPicks 중 type="sector"인 항목도 유효 섹터 ID만 허용
      if (fresh.aiPicks && Array.isArray(fresh.aiPicks)) {
        fresh.aiPicks = fresh.aiPicks.filter((p: any) => {
          if (p?.type === "sector") return Object.prototype.hasOwnProperty.call(sectorUniverse, p?.targetId);
          return true; // stock 타입은 그대로 통과
        });
      }
      cachedIntelligence = fresh;
      lastFetched = Date.now();
      return { ...fresh, _cacheState: "miss" };
    }
    // AI returned empty/failed — return stale if available, else empty (생성 실패 상태)
    return cachedIntelligence
      ? { ...cachedIntelligence, _cacheState: "stale" }
      : { ...getFallbackHomeIntelligence(), _cacheState: "empty" };
  } catch (e) {
    console.error("[HomeCache] refresh failed:", e);
    return cachedIntelligence
      ? { ...cachedIntelligence, _cacheState: "stale" }
      : { ...getFallbackHomeIntelligence(), _cacheState: "empty" };
  }
}

// AI 생성 실패 + 캐시 없음 → 빈 상태. 개발 모드에서도 고정 종목·가격으로 채우지 않는다(2026-10-30 —
// 배포 없이 next dev 로만 돌리므로 개발용 고정 데이터가 실제 화면에 "AI 포착 후보"로 노출됐다).
function getFallbackHomeIntelligence() {
  return {
    issues: [],
    stocks: [],
    trendingSectors: [],
    sectors: [],
    aiPicks: [],
    _meta: { mode: "fallback", fallbackReason: "home_intelligence_unavailable" },
  };
}

export function clearHomeIntelligenceCache() {
  cachedIntelligence = null;
  lastFetched = 0;
  console.log("[HomeCache] Cache cleared successfully.");
}
