import { NextRequest, NextResponse } from "next/server";

import { kisConfig } from "@/server/kis/config";
import { formatKSTDateCompact } from "@/server/screening/storage";
import { backfillTradingCalendar } from "@/server/screening/trading-calendar";

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

interface BackfillCalendarBody {
  from?: string; // YYYYMMDD, 기본값 올해 1/1
  to?: string; // YYYYMMDD, 기본값 오늘
}

/**
 * 거래일 캘린더(trading_calendar) 소급 백필 (관리자/내부 호출용, 조회 전용 — 매매 실행 없음).
 *
 * 코스닥 지수 일봉을 50봉씩 뒤로 페이지네이션 조회해, from~to 범위의 실제 거래일을
 * trading_calendar에 upsert한다. 기본 범위는 올해 1/1~오늘.
 */
export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const isAuthorized = kisConfig.cronSecret
    ? authHeader === `Bearer ${kisConfig.cronSecret}`
    : process.env.NODE_ENV === "development";

  if (!isAuthorized) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  let body: BackfillCalendarBody = {};
  try {
    const text = await request.text();
    if (text) body = JSON.parse(text);
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const todayKey = formatKSTDateCompact(new Date());
  const from = body.from || `${todayKey.slice(0, 4)}0101`;
  const to = body.to || todayKey;

  try {
    const { upserted, dates } = await backfillTradingCalendar(from, to);
    return NextResponse.json({
      ok: true,
      from,
      to,
      upserted,
      firstDate: dates[0] ?? null,
      lastDate: dates[dates.length - 1] ?? null,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: sanitizeError(e?.message || String(e)) }, { status: 500 });
  }
}
