import { NextResponse } from "next/server";
import { getSectorSnapshot, generateSectorSnapshot } from "@/server/research/snapshots/sector-snapshot-manager";

export async function GET(request: Request, context: { params: Promise<{ sectorId: string }> }) {
  const { sectorId } = await context.params;

  let snapshot = await getSectorSnapshot(sectorId);
  
  if (!snapshot) {
    // Generate on demand if not found
    snapshot = await generateSectorSnapshot(sectorId);
  }

  if (!snapshot) {
    return NextResponse.json({ ok: false, error: "Sector not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, sector: snapshot });
}
