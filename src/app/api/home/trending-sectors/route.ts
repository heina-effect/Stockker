import { NextResponse } from "next/server";
import { getHomeIntelligence } from "@/server/ai/home-cache";

export async function GET() {
  const intel = await getHomeIntelligence();
  return NextResponse.json({ ok: true, sectors: intel.sectors });
}
