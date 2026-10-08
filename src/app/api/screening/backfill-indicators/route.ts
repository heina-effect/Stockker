import { NextRequest, NextResponse } from "next/server";

import { kisConfig } from "@/server/kis/config";
import { getSupabaseAdmin } from "@/lib/supabase/client";
import { recalculateIndicatorsForDiscovery } from "@/server/screening/indicators";
import { fetchAllRows } from "@/server/screening/paginate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function sanitizeError(msg: string | undefined | null): string {
  if (!msg) return "";
  let out = String(msg);
  const patterns: RegExp[] = [
    /(appkey["':=\s]+)[^\s"',}]+/gi,
    /(appsecret["':=\s]+)[^\s"',}]+/gi,
    /(secret["':=\s]+)[^\s"',}]+/gi,
    /(authorization["':=\s]+)[^\s"',}]+/gi,
    /(bearer\s+)[^\s"',}]+/gi,
  ];
  for (const re of patterns) out = out.replace(re, "$1***");
  return out;
}

interface BackfillIndicatorsBody {
  symbols?: string[];
  recalculate?: boolean;
}

interface SkippedItem {
  symbol: string;
  discovery_date: string;
  reason: string;
}

/**
 * stock_trajectory에 저장된 (symbol, discovery_date)별 OHLCV 시계열로 기술지표를
 * 계산해 채운다(RSI/MACD/볼린저밴드/이동평균/거래량비율). 계산 로직은
 * src/server/screening/indicators.ts 참고. 매매 실행 없음, 조회·계산·쓰기 전용.
 */
export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const isAuthorized = kisConfig.cronSecret
    ? authHeader === `Bearer ${kisConfig.cronSecret}`
    : process.env.NODE_ENV === "development";

  if (!isAuthorized) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  let body: BackfillIndicatorsBody = {};
  try {
    const text = await request.text();
    if (text) body = JSON.parse(text);
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "Supabase 미구성" }, { status: 500 });
  }

  const recalculate = body.recalculate === true;

  // PostgREST 기본 응답 상한(1,000행)에 걸려 결과가 조용히 잘리지 않도록 range() 페이지네이션으로
  // 전체를 확보한다(trajectory-update.ts/tracking/route.ts와 동일 정책).
  let data: { symbol: string; discovery_date: string }[];
  try {
    data = await fetchAllRows<{ symbol: string; discovery_date: string }>((from, to) => {
      let q = supabase
        .from("stock_trajectory")
        .select("symbol,discovery_date")
        .order("symbol", { ascending: true })
        .order("discovery_date", { ascending: true });
      if (body.symbols && body.symbols.length > 0) q = q.in("symbol", body.symbols);
      return q.range(from, to);
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: sanitizeError(e?.message || String(e)) }, { status: 500 });
  }
  console.log(`[Indicator Backfill] stock_trajectory 조회 ${data.length}건`);

  const seen = new Set<string>();
  const groups: { symbol: string; discoveryDate: string }[] = [];
  for (const row of data) {
    const key = `${row.symbol}::${row.discovery_date}`;
    if (seen.has(key)) continue;
    seen.add(key);
    groups.push({ symbol: row.symbol, discoveryDate: row.discovery_date });
  }

  const skipped: SkippedItem[] = [];
  let processed = 0;
  let rowsUpdated = 0;

  for (const group of groups) {
    processed++;
    try {
      const result = await recalculateIndicatorsForDiscovery(supabase, group.symbol, group.discoveryDate, {
        skipFilled: !recalculate,
      });
      rowsUpdated += result.rowsUpdated;
      if (result.skipped) {
        skipped.push({ symbol: group.symbol, discovery_date: group.discoveryDate, reason: "갱신할 행 없음(이미 계산됨)" });
      }
    } catch (e: any) {
      skipped.push({ symbol: group.symbol, discovery_date: group.discoveryDate, reason: sanitizeError(e?.message || String(e)) });
    }

    if (processed % 10 === 0 || processed === groups.length) {
      console.log(`[Indicator Backfill] ${processed}/${groups.length} processed`);
    }
  }

  return NextResponse.json({
    ok: true,
    processed,
    rowsUpdated,
    skipped,
  });
}
