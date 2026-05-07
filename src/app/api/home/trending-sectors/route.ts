import { NextResponse } from "next/server";

export async function GET() {
  const sectors = [
    {
      id: "trend-sector-1",
      sectorId: "sec-biotech",
      name: "바이오·제약",
      reason: "글로벌 학회 연달아 개최 및 파이프라인 가치 재평가 국면",
      trendStrength: 90,
      timestamp: new Date().toISOString()
    },
    {
      id: "trend-sector-2",
      sectorId: "sec-semiconductor",
      name: "반도체",
      reason: "AI 서버 투자 확대로 HBM 등 고부가가치 메모리 숏티지 지속",
      trendStrength: 85,
      timestamp: new Date(Date.now() - 3600000).toISOString()
    }
  ];

  return NextResponse.json({ ok: true, sectors });
}
