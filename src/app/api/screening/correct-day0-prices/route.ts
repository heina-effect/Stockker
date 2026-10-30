import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { kisConfig } from "@/server/kis/config";
import { getDomesticStockDailyEndingAt } from "@/server/kis/rest-client";
import { getSupabaseAdmin } from "@/lib/supabase/client";
import { fetchAllRows } from "@/server/screening/paginate";
import { withRateLimitRetry } from "@/server/screening/rate-limit-retry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * day0 진입가 교정(2026-10-30, 1회성) — 스크리닝이 장중·종가 확정 전에 저장한 day0 OHLCV를
 * KIS 확정값으로 교체하고, day0 종가에서 파생된 저장값을 전부 다시 계산한다
 * (docs/release/known-issues.md "day0 종가(진입가)가 확정 종가가 아닌 행").
 *
 * 대상: from 이후 발견 건의 day0 행 중 KIS 확정 종가와 저장 종가가 다른 행.
 * 바꾸는 값:
 *   - stock_trajectory day0 행: open/high/low/close/volume (종가가 잠정이면 나머지도 잠정)
 *   - 같은 (symbol, discovery_date) 그룹 전 행의 return_from_entry
 *   - overnight_screening_items(date, symbol): entry_close, open_return, close_return(다음 날 값이 있을 때)
 * 추적 화면의 3일차·10일차·MFE·MAE·승패는 day0 종가로 매번 계산되므로 저장값이 없다.
 * 바꾸지 않는 값: 스크리닝 판단 입력 기록(tail_ratio, volume_ratio, classification, reasons, rsi14,
 *   quant_signal) — 그날 스크리너가 본 값의 기록이다. 지표 컬럼은 backfill-day0-indicators 몫.
 *
 * 검증: 같은 (symbol, trade_date)가 다른 발견 그룹에 마감 후(15:30 KST 이후) 저장돼 있으면 그 행의
 * 시가·고가·저가·종가가 KIS와 같아야 한다. 다르면 그 행은 건너뛴다. 대조 행이 없으면 검증 불가로 표시하고 진행.
 *
 * body: { apply?: boolean (기본 false = dry-run), from?: "YYYYMMDD" (기본 20261006),
 *         exclude?: ["symbol::discovery_date", ...] (작업 범위 밖으로 뺄 행) }
 */

type Row = Record<string, any>;

const round2 = (x: number) => Number(x.toFixed(2));
const pct = (to: number, from: number) => round2(((to - from) / from) * 100);
const kstHHMM = (iso: string) => new Date(new Date(iso).getTime() + 9 * 3600e3).toISOString().slice(0, 16);

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const isAuthorized = kisConfig.cronSecret
    ? authHeader === `Bearer ${kisConfig.cronSecret}`
    : process.env.NODE_ENV === "development";
  if (!isAuthorized) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  let body: { apply?: boolean; from?: string; exclude?: string[] } = {};
  try {
    const text = await request.text();
    if (text) body = JSON.parse(text);
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }
  const apply = body.apply === true;
  const from = body.from ?? "20261006";

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase 미구성" }, { status: 500 });

  const day0Rows = await fetchAllRows<Row>((f, t) =>
    supabase.from("stock_trajectory").select("*").eq("days_after", 0).gte("discovery_date", from)
      .order("symbol", { ascending: true }).order("discovery_date", { ascending: true }).range(f, t)
  );

  // 종목별 KIS 일봉 1회 — backfill-day0-indicators와 같은 끝 날짜라 같은 캐시를 쓴다.
  const bySymbol = new Map<string, Row[]>();
  for (const r of day0Rows) bySymbol.set(r.symbol, [...(bySymbol.get(r.symbol) ?? []), r]);
  const kisBar = new Map<string, Row>();
  const kisFailed: { symbol: string; reason: string }[] = [];
  for (const [symbol, rows] of bySymbol) {
    const end = rows.map((r) => r.discovery_date).sort().pop()!;
    try {
      const candles = await withRateLimitRetry(() => getDomesticStockDailyEndingAt(symbol, end));
      for (const c of candles) kisBar.set(`${symbol}::${c.stck_bsop_date}`, c);
    } catch (e: any) {
      kisFailed.push({ symbol, reason: String(e?.message || e).slice(0, 120) });
    }
  }

  const exclude = new Set(body.exclude ?? []);
  const mismatched = day0Rows.filter((r) => {
    const bar = kisBar.get(`${r.symbol}::${r.discovery_date}`);
    return bar && Number(bar.stck_clpr) !== Number(r.close);
  });
  const excluded = mismatched.filter((r) => exclude.has(`${r.symbol}::${r.discovery_date}`));
  const targets = mismatched.filter((r) => !exclude.has(`${r.symbol}::${r.discovery_date}`));

  // 대상 그룹·대조 행·스크리닝 항목 수집
  const groups = new Map<string, Row[]>();
  const peers = new Map<string, Row[]>();
  const screeningItems = new Map<string, Row[]>();
  for (const t of targets) {
    const key = `${t.symbol}::${t.discovery_date}`;
    const { data: g, error: gErr } = await supabase.from("stock_trajectory").select("*")
      .eq("symbol", t.symbol).eq("discovery_date", t.discovery_date).order("trade_date", { ascending: true });
    if (gErr) throw gErr;
    groups.set(key, g ?? []);
    const { data: p, error: pErr } = await supabase.from("stock_trajectory").select("*")
      .eq("symbol", t.symbol).eq("trade_date", t.discovery_date).neq("discovery_date", t.discovery_date);
    if (pErr) throw pErr;
    peers.set(key, (p ?? []).filter((x) => kstHHMM(x.created_at) >= `${t.discovery_date.slice(0, 4)}-${t.discovery_date.slice(4, 6)}-${t.discovery_date.slice(6, 8)}T15:30`));
    const { data: s, error: sErr } = await supabase.from("overnight_screening_items")
      .select("*").eq("symbol", t.symbol).eq("date", t.discovery_date);
    if (sErr) throw sErr;
    screeningItems.set(key, s ?? []);
  }

  let backupPath: string | null = null;
  if (apply) {
    const dir = path.join(os.homedir(), "stockker-logs");
    fs.mkdirSync(dir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+/, "");
    backupPath = path.join(dir, `backup-day0-prices-${stamp}.json`);
    fs.writeFileSync(backupPath, JSON.stringify({
      day0: targets,
      groups: Object.fromEntries(groups),
      screeningItems: Object.fromEntries(screeningItems),
    }, null, 2));
  }

  const results: any[] = [];
  for (const t of targets) {
    const key = `${t.symbol}::${t.discovery_date}`;
    const bar = kisBar.get(key)!;
    const next = {
      open: Number(bar.stck_oprc), high: Number(bar.stck_hgpr), low: Number(bar.stck_lwpr),
      close: Number(bar.stck_clpr), volume: Number(bar.acml_vol),
    };
    const base = { symbol: t.symbol, name: t.name, discoveryDate: t.discovery_date, createdAtKst: kstHHMM(t.created_at) };

    // DB 내부 대조 — 마감 후 저장된 다른 그룹 행의 O/H/L/C가 KIS와 같아야 한다(거래량은 시간외 차이로 제외).
    const peerRows = peers.get(key) ?? [];
    const peerMismatch = peerRows.filter((p) =>
      Number(p.open) !== next.open || Number(p.high) !== next.high || Number(p.low) !== next.low || Number(p.close) !== next.close
    );
    const verification = peerRows.length === 0 ? "대조 행 없음" : peerMismatch.length === 0 ? `일치(${peerRows.length}행)` : "불일치";
    if (peerMismatch.length > 0) {
      results.push({ ...base, status: "skipped", reason: "마감 후 저장된 다른 그룹 행과 KIS 값 불일치",
        kis: next, peers: peerMismatch.map((p) => ({ discovery: p.discovery_date, open: p.open, high: p.high, low: p.low, close: p.close })) });
      continue;
    }

    const group = groups.get(key) ?? [];
    const day3 = group.find((r) => r.days_after === 3);
    const day3Before = day3 ? pct(Number(day3.close), Number(t.close)) : null;
    const day3After = day3 ? pct(Number(day3.close), next.close) : null;
    const items = screeningItems.get(key) ?? [];
    const itemUpdates = items.map((it) => ({
      id: it.id,
      before: { entry_close: it.entry_close, open_return: it.open_return, close_return: it.close_return },
      after: {
        entry_close: next.close,
        open_return: it.next_open != null ? pct(Number(it.next_open), next.close) : it.open_return,
        close_return: it.next_close != null ? pct(Number(it.next_close), next.close) : it.close_return,
      },
    }));
    const returnUpdates = group
      .filter((r) => r.days_after !== 0)
      .map((r) => ({ trade_date: r.trade_date, before: r.return_from_entry, after: pct(Number(r.close), next.close) }));

    const entry = {
      ...base,
      verification,
      before: { open: t.open, high: t.high, low: t.low, close: t.close, volume: t.volume },
      after: next,
      closeDiffPct: pct(next.close, Number(t.close)),
      day3ReturnBefore: day3Before,
      day3ReturnAfter: day3After,
      day3ReturnChangePp: day3Before != null && day3After != null ? round2(day3After - day3Before) : null,
      screeningItems: itemUpdates,
      returnFromEntryRows: returnUpdates.length,
    };

    if (!apply) {
      results.push({ ...entry, status: "dry-run" });
      continue;
    }

    const day0Key = (q: any) => q.eq("symbol", t.symbol).eq("discovery_date", t.discovery_date).eq("trade_date", t.trade_date).eq("days_after", 0);
    const { error: e1 } = await day0Key(supabase.from("stock_trajectory").update(next));
    if (e1) { results.push({ ...entry, status: "failed", reason: e1.message }); continue; }
    let failed: string | null = null;
    for (const u of returnUpdates) {
      const { error } = await supabase.from("stock_trajectory").update({ return_from_entry: u.after })
        .eq("symbol", t.symbol).eq("discovery_date", t.discovery_date).eq("trade_date", u.trade_date);
      if (error) { failed = error.message; break; }
    }
    for (const u of itemUpdates) {
      if (failed) break;
      const { error } = await supabase.from("overnight_screening_items").update(u.after).eq("id", u.id);
      if (error) failed = error.message;
    }
    results.push({ ...entry, status: failed ? "failed" : "written", reason: failed ?? undefined });
  }

  const changes = results.map((r) => r.day3ReturnChangePp).filter((x): x is number => x != null).map(Math.abs).sort((a, b) => a - b);
  return NextResponse.json({
    ok: true,
    mode: apply ? "apply" : "dry-run",
    backupPath,
    kisFailed,
    excluded: excluded.map((r) => ({ symbol: r.symbol, name: r.name, discoveryDate: r.discovery_date, close: r.close })),
    counts: {
      day0Rows: day0Rows.length,
      targets: targets.length,
      written: results.filter((r) => r.status === "written").length,
      skipped: results.filter((r) => r.status === "skipped").length,
      failed: results.filter((r) => r.status === "failed").length,
      verifiedByPeer: results.filter((r) => String(r.verification).startsWith("일치")).length,
      noPeer: results.filter((r) => r.verification === "대조 행 없음").length,
      day3ReturnChanged: changes.filter((x) => x > 0).length,
    },
    day3ChangePpDistribution: changes.length
      ? { min: changes[0], median: changes[Math.floor(changes.length / 2)], max: changes[changes.length - 1] }
      : null,
    results,
  });
}
