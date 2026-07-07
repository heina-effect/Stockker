import "server-only";

import { Redis } from "@upstash/redis";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { kisConfig } from "@/server/kis/config";

/**
 * 오버나이트 스크리닝 결과 일별 영속 저장소.
 *
 * Redis(Upstash) 우선, 미구성 시 in-memory Map → tmpdir 파일로 단계적 폴백한다.
 * (kis/auth.ts의 토큰 캐시 폴백 패턴과 동일한 3단 구조)
 */

export type ScreeningClassification = "normal" | "aggressive" | "exclude" | "excludedNotice";

export interface ScreeningResultItem {
  symbol: string;
  name: string;
  classification: ScreeningClassification;
  entryClose: number;
  reasons: string[];
}

export interface ScreeningResultRecord {
  date: string; // YYYYMMDD (KST)
  reduceWeight: boolean;
  kosdaqValue: number;
  items: ScreeningResultItem[];
}

declare global {
  var __screening_result_cache__: Map<string, string> | undefined;
}
const memoryCache =
  globalThis.__screening_result_cache__ ?? (globalThis.__screening_result_cache__ = new Map());

let redisInstance: Redis | null = null;
function getRedis(): Redis | null {
  if (!kisConfig.upstashUrl || !kisConfig.upstashToken) return null;
  if (!redisInstance) {
    redisInstance = new Redis({ url: kisConfig.upstashUrl, token: kisConfig.upstashToken });
  }
  return redisInstance;
}

function screeningKey(date: string): string {
  return `screening:result:${date}`;
}

function fallbackFilePath(date: string): string {
  return path.join(os.tmpdir(), `stockker_screening_result_${date}.json`);
}

// 소급 검증 용도이므로 넉넉히 보존 (약 400일)
const RESULT_TTL_SECONDS = 400 * 24 * 60 * 60;

export async function saveScreeningResult(record: ScreeningResultRecord): Promise<void> {
  const key = screeningKey(record.date);
  const payload = JSON.stringify(record);

  try {
    const redis = getRedis();
    if (redis) {
      await redis.set(key, payload, { ex: RESULT_TTL_SECONDS });
      return;
    }
  } catch (e) {
    console.error("[Screening Storage] Redis save failed, falling back:", (e as Error)?.message || e);
  }

  memoryCache.set(key, payload);
  try {
    const fp = fallbackFilePath(record.date);
    fs.writeFileSync(fp, payload, { encoding: "utf-8", mode: 0o600 });
    fs.chmodSync(fp, 0o600);
  } catch {
    // ignore — 메모리 캐시만으로도 동일 프로세스 내 동작은 보장됨
  }
}

export async function getScreeningResult(date: string): Promise<ScreeningResultRecord | null> {
  const key = screeningKey(date);

  try {
    const redis = getRedis();
    if (redis) {
      const raw = await redis.get<string>(key);
      if (raw) return typeof raw === "string" ? JSON.parse(raw) : (raw as unknown as ScreeningResultRecord);
    }
  } catch (e) {
    console.error("[Screening Storage] Redis get failed, falling back:", (e as Error)?.message || e);
  }

  const cached = memoryCache.get(key);
  if (cached) return JSON.parse(cached);

  try {
    const fp = fallbackFilePath(date);
    if (fs.existsSync(fp)) {
      return JSON.parse(fs.readFileSync(fp, "utf-8"));
    }
  } catch {
    // ignore
  }

  return null;
}

/**
 * 시드/추가 입력을 기존 날짜 레코드에 병합한다 (symbol 기준 dedup, 최신 입력 우선).
 * meta(reduceWeight/kosdaqValue)는 제공된 값이 있으면 갱신하고, 없으면 기존 값을 유지한다.
 */
export async function upsertScreeningItems(
  date: string,
  meta: { reduceWeight?: boolean; kosdaqValue?: number },
  items: ScreeningResultItem[]
): Promise<ScreeningResultRecord> {
  const existing = await getScreeningResult(date);
  const merged: ScreeningResultRecord = {
    date,
    reduceWeight: meta.reduceWeight ?? existing?.reduceWeight ?? false,
    kosdaqValue: meta.kosdaqValue ?? existing?.kosdaqValue ?? 0,
    items: [...(existing?.items || [])],
  };

  for (const item of items) {
    const idx = merged.items.findIndex((i) => i.symbol === item.symbol);
    if (idx >= 0) merged.items[idx] = item;
    else merged.items.push(item);
  }

  await saveScreeningResult(merged);
  return merged;
}

// KST YYYYMMDD 포맷 (rest-client.ts의 동명 헬퍼와 동일 로직)
export function formatKSTDateCompact(d: Date): string {
  const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().split("T")[0].replace(/-/g, "");
}
