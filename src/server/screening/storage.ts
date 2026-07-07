import "server-only";

import { Redis } from "@upstash/redis";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { kisConfig } from "@/server/kis/config";
import { getSupabaseAdmin } from "@/lib/supabase/client";

/**
 * 오버나이트 스크리닝 결과 일별 영속 저장소.
 *
 * Supabase 우선, Redis(Upstash) 보조, 미구성 시 in-memory Map → tmpdir 파일로 단계적 폴백한다.
 * (기존 3단 구조에 Supabase 최우선 영구 저장 추가)
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

  // 1. Supabase 영구 저장 시도
  try {
    const supabase = getSupabaseAdmin();
    if (supabase) {
      // 마스터 레코드 Upsert
      const { error: recordErr } = await supabase
        .from("overnight_screening_records")
        .upsert({
          date: record.date,
          reduce_weight: record.reduceWeight,
          kosdaq_value: record.kosdaqValue,
        });

      if (recordErr) throw recordErr;

      // 상세 종목 리스트 Upsert (기존 일자 항목이 존재할 수 있으므로 먼저 삭제 후 재삽입)
      if (record.items.length > 0) {
        await supabase
          .from("overnight_screening_items")
          .delete()
          .eq("date", record.date);

        const itemsToInsert = record.items.map((item) => ({
          date: record.date,
          symbol: item.symbol,
          name: item.name,
          classification: item.classification,
          entry_close: item.entryClose,
          reasons: item.reasons,
        }));

        const { error: itemsErr } = await supabase
          .from("overnight_screening_items")
          .insert(itemsToInsert);

        if (itemsErr) throw itemsErr;
      }
      console.log(`[Screening Storage] Successfully saved screening for date ${record.date} to Supabase`);
    }
  } catch (e) {
    console.error("[Screening Storage] Supabase save failed, falling back to cache/file:", (e as Error)?.message || e);
  }

  // 2. Redis 백업 저장 시도
  try {
    const redis = getRedis();
    if (redis) {
      await redis.set(key, payload, { ex: RESULT_TTL_SECONDS });
      return;
    }
  } catch (e) {
    console.error("[Screening Storage] Redis save failed, falling back:", (e as Error)?.message || e);
  }

  // 3. In-memory & 로컬 임시 파일 저장 시도 (최종 폴백)
  memoryCache.set(key, payload);
  try {
    const fp = fallbackFilePath(record.date);
    fs.writeFileSync(fp, payload, { encoding: "utf-8", mode: 0o600 });
    fs.chmodSync(fp, 0o600);
  } catch {
    // ignore
  }
}

export async function deleteScreeningResult(date: string): Promise<void> {
  const key = screeningKey(date);

  // 1. Supabase 삭제 시도
  try {
    const supabase = getSupabaseAdmin();
    if (supabase) {
      await supabase
        .from("overnight_screening_records")
        .delete()
        .eq("date", date);
    }
  } catch (e) {
    console.error("[Screening Storage] Supabase del failed:", (e as Error)?.message || e);
  }

  // 2. Redis 삭제 시도
  try {
    const redis = getRedis();
    if (redis) await redis.del(key);
  } catch (e) {
    console.error("[Screening Storage] Redis del failed:", (e as Error)?.message || e);
  }

  // 3. In-memory & 로컬 임시 파일 삭제 시도
  memoryCache.delete(key);
  try {
    const fp = fallbackFilePath(date);
    if (fs.existsSync(fp)) fs.unlinkSync(fp);
  } catch { /* ignore */ }
}

export async function getScreeningResult(date: string): Promise<ScreeningResultRecord | null> {
  const key = screeningKey(date);

  // 1. Supabase 조회 시도
  try {
    const supabase = getSupabaseAdmin();
    if (supabase) {
      const { data: recordData, error: recordErr } = await supabase
        .from("overnight_screening_records")
        .select(`
          date,
          reduce_weight,
          kosdaq_value,
          items:overnight_screening_items(
            symbol,
            name,
            classification,
            entry_close,
            reasons
          )
        `)
        .eq("date", date)
        .maybeSingle();

      if (recordErr) throw recordErr;

      if (recordData) {
        const items = ((recordData.items || []) as any[]).map((i) => ({
          symbol: i.symbol,
          name: i.name,
          classification: i.classification as ScreeningClassification,
          entryClose: Number(i.entry_close || 0),
          reasons: i.reasons || [],
        }));

        return {
          date: recordData.date,
          reduceWeight: recordData.reduce_weight,
          kosdaqValue: Number(recordData.kosdaq_value || 0),
          items,
        };
      }
    }
  } catch (e) {
    console.error("[Screening Storage] Supabase get failed, falling back to cache/file:", (e as Error)?.message || e);
  }

  // 2. Redis 조회 시도
  try {
    const redis = getRedis();
    if (redis) {
      const raw = await redis.get<string>(key);
      if (raw) return typeof raw === "string" ? JSON.parse(raw) : (raw as unknown as ScreeningResultRecord);
    }
  } catch (e) {
    console.error("[Screening Storage] Redis get failed, falling back:", (e as Error)?.message || e);
  }

  // 3. In-memory & 로컬 임시 파일 조회 시도 (최종 폴백)
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
