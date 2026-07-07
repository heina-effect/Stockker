import { NextRequest, NextResponse } from "next/server";

import { kisConfig } from "@/server/kis/config";
import { getDomesticStockDailyAround } from "@/server/kis/rest-client";
import { getSearchMaster } from "@/lib/stocks/search-master";
import { upsertScreeningItems, type ScreeningClassification, type ScreeningResultItem } from "@/server/screening/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface SeedSymbol {
  name: string;
  entryClose?: number; // HTS 실값 직접 지정 시 KIS API fetch 생략 (수정주가 보정 불일치 우회)
}

interface SeedEntry {
  date: string; // YYYYMMDD
  classification: ScreeningClassification;
  symbols: (string | SeedSymbol)[]; // string: 기존 동작 (KIS fetch), {name, entryClose}: 직접 지정
  kosdaqValue?: number;
  reduceWeight?: boolean;
}

// 헬퍼: 디버그/에러 메시지에서 자격증명류 토큰 마스킹 (overnight/route.ts와 동일 정책)
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

/**
 * 과거 소급 스크리닝 시드 입력 (관리자/내부 호출용).
 *
 * 입력: [{ date, classification, symbols, kosdaqValue?, reduceWeight? }]
 * 종목명 → symbol 변환은 search-master, entryClose는 해당일 KIS 일봉 종가에서 역산한다.
 * 조회 전용이 아니라 저장만 수행하며 어떤 주문/매매도 실행하지 않는다.
 */
export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const isAuthorized = kisConfig.cronSecret
    ? authHeader === `Bearer ${kisConfig.cronSecret}`
    : process.env.NODE_ENV === "development";

  if (!isAuthorized) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  let entries: SeedEntry[];
  try {
    entries = await request.json();
    if (!Array.isArray(entries)) throw new Error("Body must be an array");
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const master = getSearchMaster();
  const skipped: { date: string; name: string; reason: string }[] = [];
  const byDate = new Map<string, { meta: { kosdaqValue?: number; reduceWeight?: boolean }; items: ScreeningResultItem[] }>();

  for (const entry of entries) {
    const { date, classification, symbols } = entry;
    if (!date || !classification || !Array.isArray(symbols)) {
      skipped.push({ date: date || "?", name: "(invalid entry)", reason: "date/classification/symbols 누락" });
      continue;
    }

    if (!byDate.has(date)) {
      byDate.set(date, { meta: {}, items: [] });
    }
    const bucket = byDate.get(date)!;
    if (entry.kosdaqValue !== undefined) bucket.meta.kosdaqValue = entry.kosdaqValue;
    if (entry.reduceWeight !== undefined) bucket.meta.reduceWeight = entry.reduceWeight;

    for (const sym of symbols) {
      const symbolName = typeof sym === "string" ? sym : sym.name;
      const manualEntryClose = typeof sym === "object" ? sym.entryClose : undefined;

      const masterItem = master.find((s) => s.name === symbolName);
      if (!masterItem) {
        skipped.push({ date, name: symbolName, reason: "search-master에서 종목명을 찾을 수 없음" });
        continue;
      }

      try {
        let entryClose: number;
        if (manualEntryClose !== undefined && manualEntryClose > 0) {
          entryClose = manualEntryClose;
        } else {
          const dailyCandles = await getDomesticStockDailyAround(masterItem.symbol, date);
          const candle = (dailyCandles || []).find((c: any) => String(c.stck_bsop_date) === date);
          if (!candle) {
            skipped.push({ date, name: symbolName, reason: "해당일 일봉 데이터 없음 (조회 범위 밖이거나 휴장일)" });
            continue;
          }
          entryClose = Number(candle.stck_clpr || 0);
        }

        bucket.items.push({
          symbol: masterItem.symbol,
          name: masterItem.name,
          classification,
          entryClose,
          reasons: ["과거 소급 시드 입력"],
        });
      } catch (e: any) {
        skipped.push({ date, name: symbolName, reason: sanitizeError(e?.message || String(e)) });
      }
    }
  }

  const savedDates: string[] = [];
  for (const [date, { meta, items }] of byDate) {
    if (items.length === 0) continue;
    await upsertScreeningItems(date, meta, items);
    savedDates.push(date);
  }

  return NextResponse.json({
    ok: true,
    savedDates,
    savedCount: [...byDate.values()].reduce((acc, b) => acc + b.items.length, 0),
    skipped,
  });
}
