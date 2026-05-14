// "use server" 없음 — 이 모듈은 서버 런타임에서만 import됨
// 클라이언트 번들에 포함되면 에러 (getSupabaseAdmin이 서버 전용)

import { getSupabaseAdmin } from "@/lib/supabase/client";
import type { SectorTheme } from "@/data/sectors/taxonomy";
import type { StockMetadata } from "@/lib/stocks/metadata";
import { isUnsupportedStockSymbol } from "@/lib/stocks/listing-status";

// ─── 인메모리 캐시 (stale-while-revalidate 패턴) ────────────────
const CACHE_TTL_MS = 5 * 60 * 1000; // 5분
const PAGE_SIZE = 1000;

interface CacheEntry<T> {
  data: T;
  loadedAt: number;
}

let sectorCache: CacheEntry<Record<string, SectorTheme>> | null = null;
let stockCache: CacheEntry<Record<string, StockMetadata>> | null = null;

// 인플라이트 쿼리 중복 방지
let sectorLoadPromise: Promise<Record<string, SectorTheme>> | null = null;
let stockLoadPromise: Promise<Record<string, StockMetadata>> | null = null;

// ─── DB에서 데이터 로드 ────────────────────────────────────────

async function loadSectorsFromDB(): Promise<Record<string, SectorTheme>> {
  const db = getSupabaseAdmin();
  if (!db) {
    console.warn("[db-registry] Supabase admin not available, falling back to static");
    const { SECTOR_UNIVERSE } = await import("@/data/sectors/taxonomy");
    return SECTOR_UNIVERSE;
  }

  const { data, error } = await db
    .from("sector_master")
    .select(
      "sector_id, name, aliases, description, member_symbols, representative_symbols, icon_key"
    )
    .eq("is_active", true)
    .order("display_order");

  if (error || !data?.length) {
    console.warn(
      "[db-registry] sector_master load failed, falling back to static:",
      error?.message
    );
    const { SECTOR_UNIVERSE } = await import("@/data/sectors/taxonomy");
    return SECTOR_UNIVERSE;
  }

  const { SECTOR_UNIVERSE } = await import("@/data/sectors/taxonomy");
  const merged: Record<string, SectorTheme> = { ...SECTOR_UNIVERSE };

  for (const row of data) {
    const staticSector = SECTOR_UNIVERSE[row.sector_id];
    merged[row.sector_id] = {
      sectorId: row.sector_id,
      name: row.name,
      aliases: Array.from(new Set([...(staticSector?.aliases ?? []), ...(row.aliases ?? [])])),
      description: row.description ?? staticSector?.description ?? "",
      memberSymbols: Array.from(new Set([...(staticSector?.memberSymbols ?? []), ...(row.member_symbols ?? [])])),
      representativeSymbols: Array.from(new Set([...(staticSector?.representativeSymbols ?? []), ...(row.representative_symbols ?? [])])),
      iconKey: row.icon_key ?? staticSector?.iconKey ?? undefined,
    };
  }

  return merged;
}

async function loadStocksFromDB(): Promise<Record<string, StockMetadata>> {
  const db = getSupabaseAdmin();
  if (!db) {
    const { STOCK_UNIVERSE } = await import("@/lib/stocks/metadata");
    return STOCK_UNIVERSE;
  }

  const data: { symbol: string; name: string; market: string; sector_tag: string | null }[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data: page, error } = await db
      .from("stock_master")
      .select("symbol, name, market, sector_tag")
      .eq("is_active", true)
      .range(from, from + PAGE_SIZE - 1);

    if (error) {
      console.warn(
        "[db-registry] stock_master load failed, falling back to static:",
        error.message
      );
      const { STOCK_UNIVERSE } = await import("@/lib/stocks/metadata");
      return STOCK_UNIVERSE;
    }

    data.push(...(page ?? []));
    if (!page || page.length < PAGE_SIZE) break;
  }

  if (!data.length) {
    const { STOCK_UNIVERSE } = await import("@/lib/stocks/metadata");
    return STOCK_UNIVERSE;
  }

  const { STOCK_UNIVERSE } = await import("@/lib/stocks/metadata");
  return {
    ...STOCK_UNIVERSE,
    ...Object.fromEntries(
      data.filter((row) => !isUnsupportedStockSymbol(row.symbol)).map((row) => [
        row.symbol,
        {
          symbol: row.symbol,
          name: row.name,
          market: row.market as StockMetadata["market"],
          sector: row.sector_tag ?? STOCK_UNIVERSE[row.symbol]?.sector,
        } satisfies StockMetadata,
      ])
    ),
  };
}

// ─── 캐시 접근 (stale-while-revalidate) ──────────────────────────

function isStale(entry: CacheEntry<unknown>): boolean {
  return Date.now() - entry.loadedAt > CACHE_TTL_MS;
}

export async function getDBSectorUniverse(): Promise<Record<string, SectorTheme>> {
  if (sectorCache && !isStale(sectorCache)) {
    return sectorCache.data;
  }

  // Stale 있으면 즉시 반환 + 백그라운드 갱신
  if (sectorCache && isStale(sectorCache)) {
    if (!sectorLoadPromise) {
      sectorLoadPromise = loadSectorsFromDB()
        .then((data) => {
          sectorCache = { data, loadedAt: Date.now() };
          sectorLoadPromise = null;
          return data;
        })
        .catch((e) => {
          sectorLoadPromise = null;
          throw e;
        });
    }
    return sectorCache.data; // stale 즉시 반환
  }

  // Cold: 최초 로드
  if (!sectorLoadPromise) {
    sectorLoadPromise = loadSectorsFromDB()
      .then((data) => {
        sectorCache = { data, loadedAt: Date.now() };
        sectorLoadPromise = null;
        return data;
      })
      .catch((e) => {
        sectorLoadPromise = null;
        throw e;
      });
  }
  return sectorLoadPromise;
}

export async function getDBStockUniverse(): Promise<Record<string, StockMetadata>> {
  if (stockCache && !isStale(stockCache)) {
    return stockCache.data;
  }

  if (stockCache && isStale(stockCache)) {
    if (!stockLoadPromise) {
      stockLoadPromise = loadStocksFromDB()
        .then((data) => {
          stockCache = { data, loadedAt: Date.now() };
          stockLoadPromise = null;
          return data;
        })
        .catch((e) => {
          stockLoadPromise = null;
          throw e;
        });
    }
    return stockCache.data;
  }

  if (!stockLoadPromise) {
    stockLoadPromise = loadStocksFromDB()
      .then((data) => {
        stockCache = { data, loadedAt: Date.now() };
        stockLoadPromise = null;
        return data;
      })
      .catch((e) => {
        stockLoadPromise = null;
        throw e;
      });
  }
  return stockLoadPromise;
}

// ─── 편의 함수 ───────────────────────────────────────────────────

export async function getDBStockName(symbol: string): Promise<string> {
  const universe = await getDBStockUniverse();
  return universe[symbol]?.name ?? symbol;
}

function normalizeSectorLookup(value: string): string {
  return value.toLowerCase().replace(/\s+/g, "").replace(/[·ㆍ.]/g, "");
}

export async function resolveDBSectorId(
  value: string | undefined | null
): Promise<string | null> {
  if (!value) return null;
  const universe = await getDBSectorUniverse();
  if (Object.prototype.hasOwnProperty.call(universe, value)) return value;

  const normalized = normalizeSectorLookup(value);
  for (const [sectorId, sector] of Object.entries(universe)) {
    const candidates = [sector.name, sector.sectorId, ...sector.aliases].map(
      normalizeSectorLookup
    );
    if (candidates.includes(normalized)) return sectorId;
  }
  return null;
}

export async function isDBSectorId(
  value: string | undefined | null
): Promise<boolean> {
  if (!value) return false;
  const universe = await getDBSectorUniverse();
  return Object.prototype.hasOwnProperty.call(universe, value);
}

export async function getDBSectorById(
  value: string | undefined | null
): Promise<SectorTheme | null> {
  if (!value) return null;
  const universe = await getDBSectorUniverse();
  return universe[value] ?? null;
}

// ─── 캐시 무효화 (관리자 UI에서 DB 변경 후 호출) ──────────────────

export function invalidateRegistryCache(): void {
  sectorCache = null;
  stockCache = null;
  sectorLoadPromise = null;
  stockLoadPromise = null;
}
