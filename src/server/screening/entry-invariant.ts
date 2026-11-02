import "server-only";

import type { SupabaseAdmin } from "@/lib/supabase/client";

// 불변식(2026-11-02): overnight_screening_items.entry_close 와 stock_trajectory day0 종가는 같은 값이어야 한다.
// 7/2~9/23 발견 237그룹이 갈라져 있었다 — 스크리닝 항목은 장중·캐시 재사용 잠정 종가, day0 는 나중에
// backfill-trajectory 가 확정 일봉으로 채움(docs/release/known-issues.md). day0 종가를 쓰는 경로
// (스크리닝 라우트, 궤적 갱신, backfill-trajectory)가 쓰고 난 직후 이 검사를 부른다. 고치지는 않고 경고만 남긴다.

export interface EntryDay0Mismatch {
  symbol: string;
  date: string;
  entryClose: number | null;
  day0Close: number;
}

// 둘 다 있는 (symbol, date) 쌍만 비교한다. entry_close 가 비었는데 day0 가 있으면 불일치로 본다.
export function findEntryDay0Mismatches(
  items: { symbol: string; date: string; entry_close: number | string | null }[],
  day0Rows: { symbol: string; discovery_date: string; close: number | string | null }[]
): EntryDay0Mismatch[] {
  const day0 = new Map<string, number>();
  for (const r of day0Rows) {
    const c = Number(r.close);
    if (c > 0) day0.set(`${r.symbol}::${r.discovery_date}`, c);
  }
  const out: EntryDay0Mismatch[] = [];
  for (const it of items) {
    const d = day0.get(`${it.symbol}::${it.date}`);
    if (d === undefined) continue;
    const e = it.entry_close == null ? null : Number(it.entry_close);
    if (e !== d) out.push({ symbol: it.symbol, date: it.date, entryClose: e, day0Close: d });
  }
  return out;
}

// 저장 직후 검사 — 조회 실패는 경고만 남기고 삼킨다(검사가 저장 흐름을 막지 않게).
export async function warnEntryDay0Mismatches(
  supabase: SupabaseAdmin,
  keys: { symbol: string; date: string }[],
  source: string
): Promise<EntryDay0Mismatch[]> {
  if (keys.length === 0) return [];
  try {
    const dates = [...new Set(keys.map((k) => k.date))];
    const symbols = [...new Set(keys.map((k) => k.symbol))];
    const [itemsRes, day0Res] = await Promise.all([
      supabase.from("overnight_screening_items").select("symbol,date,entry_close").in("date", dates).in("symbol", symbols),
      supabase.from("stock_trajectory").select("symbol,discovery_date,close").eq("days_after", 0).in("discovery_date", dates).in("symbol", symbols),
    ]);
    if (itemsRes.error) throw itemsRes.error;
    if (day0Res.error) throw day0Res.error;
    const wanted = new Set(keys.map((k) => `${k.symbol}::${k.date}`));
    const mismatches = findEntryDay0Mismatches(
      ((itemsRes.data || []) as any[]).filter((r) => wanted.has(`${r.symbol}::${r.date}`)),
      (day0Res.data || []) as any[]
    );
    for (const m of mismatches) {
      console.warn(`[Entry Invariant] ${source}: entry_close ${m.entryClose} ≠ day0 종가 ${m.day0Close} (${m.symbol} ${m.date})`);
    }
    return mismatches;
  } catch (e) {
    console.warn(`[Entry Invariant] ${source}: 검사 실패 —`, (e as Error)?.message || e);
    return [];
  }
}
