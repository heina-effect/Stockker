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
    // AI returned empty/failed — return stale if available, else mock
    return cachedIntelligence
      ? { ...cachedIntelligence, _cacheState: "stale" }
      : { ...getFallbackHomeIntelligence(), _cacheState: process.env.NODE_ENV === "production" ? "empty" : "mock" };
  } catch (e) {
    console.error("[HomeCache] refresh failed:", e);
    return cachedIntelligence
      ? { ...cachedIntelligence, _cacheState: "stale" }
      : { ...getFallbackHomeIntelligence(), _cacheState: process.env.NODE_ENV === "production" ? "empty" : "mock" };
  }
}

function getFallbackHomeIntelligence() {
  if (process.env.NODE_ENV === "production") {
    return {
      issues: [],
      stocks: [],
      trendingSectors: [],
      sectors: [],
      aiPicks: [],
      _meta: { mode: "fallback", fallbackReason: "home_intelligence_unavailable" },
    };
  }

  return {
    issues: [
      {
        id: "issue-global-1",
        title: "연준 금리 동결, 하반기 IT 투자 심리 회복 기대감 상승",
        description: "글로벌 금리 인하 기대가 다소 후퇴했으나, AI 발 인프라 투자 지속으로 반도체 등 핵심 부품 공급망의 안정성이 부각되고 있습니다.",
        trendStrength: 95,
        timestamp: new Date().toISOString(),
      },
    ],
    stocks: [
      { symbol: "005930", name: "삼성전자", reason: "HBM3E 양산 기대감", trendStrength: 92, sourceCount: 3, price: 75000 },
    ],
    trendingSectors: [
      {
        sectorId: "sec-semiconductor",
        id: "sec-semiconductor",
        name: "반도체",
        whyNow: "글로벌 AI 인프라 투자 지속에 따른 실적 턴어라운드",
        description: "글로벌 AI 인프라 투자 지속에 따른 실적 턴어라운드",
        sourceCount: 3,
        trendStrength: 94,
        representativeSymbols: ["005930", "000660"],
      },
    ],
    aiPicks: [
      {
        id: "pick-1", type: "stock", targetId: "000660", name: "SK하이닉스",
        recommendationType: "close_watch",
        reasons: [{ summary: "외국인 연속 순매수 기록", sourceType: "technical" }],
        riskSummary: "단기 급등에 따른 차익 실현 매물 출회 가능성",
        disclaimer: "정보 제공 목적이며 투자 판단과 책임은 이용자 본인에게 있습니다.",
      },
    ],
    sectors: [
      {
        sectorId: "sec-semiconductor",
        id: "sec-semiconductor",
        name: "반도체",
        whyNow: "글로벌 AI 인프라 투자 지속에 따른 실적 턴어라운드",
        description: "글로벌 AI 인프라 투자 지속에 따른 실적 턴어라운드",
        sourceCount: 3,
        trendStrength: 94,
        representativeSymbols: ["005930", "000660"],
      },
    ],
  };
}

export function clearHomeIntelligenceCache() {
  cachedIntelligence = null;
  lastFetched = 0;
  console.log("[HomeCache] Cache cleared successfully.");
}
