import { NextRequest, NextResponse } from "next/server";
import { getHomeIntelligence, clearHomeIntelligenceCache } from "@/server/ai/home-cache";

export async function GET(request: NextRequest) {
  const refresh = request.nextUrl.searchParams.get("refresh") === "true";
  if (refresh) {
    clearHomeIntelligenceCache();
  }
  const intel = await getHomeIntelligence();
  return NextResponse.json({ ok: true, intelligence: intel });
}
