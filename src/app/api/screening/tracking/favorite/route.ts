import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface FavoriteRequestBody {
  symbol?: string;
  discoveryDate?: string;
  favorite?: boolean;
}

export async function POST(request: NextRequest) {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "Supabase 미구성" }, { status: 500 });
  }

  let body: FavoriteRequestBody = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const { symbol, discoveryDate, favorite } = body;
  if (!symbol || !discoveryDate || typeof favorite !== "boolean") {
    return NextResponse.json(
      { ok: false, error: "symbol, discoveryDate, favorite가 필요합니다" },
      { status: 400 }
    );
  }

  if (favorite) {
    // /overnight/tracking이 symbol 단위로 그룹화되므로, 대표(최근) discoveryDate로 등록해두면
    // 해당 symbol의 어느 포착 건에도 매치되어 그룹 전체가 즐겨찾기로 표시된다(symbol만으로
    // 체크하는 tracking/route.ts의 favoriteSymbols와 짝을 이룸).
    const { error } = await supabase
      .from("trajectory_favorites")
      .upsert({ symbol, discovery_date: discoveryDate }, { onConflict: "symbol,discovery_date" });
    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
  } else {
    // symbol 단위 해제 — 과거 다른 discoveryDate로 등록된 즐겨찾기가 남아있으면 그룹이 계속
    // 즐겨찾기로 보이는 문제를 막기 위해 해당 symbol의 즐겨찾기를 전부 지운다.
    const { error } = await supabase.from("trajectory_favorites").delete().eq("symbol", symbol);
    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true });
}
