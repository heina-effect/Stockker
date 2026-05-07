import { NextResponse } from "next/server";

export async function GET() {
  const stocks = [
    {
      id: "trend-stock-1",
      symbol: "000660",
      name: "SK하이닉스",
      reason: "HBM3E 양산 기대감 및 외국인 순매수 1위 지속",
      trendStrength: 92,
      timestamp: new Date().toISOString()
    },
    {
      id: "trend-stock-2",
      symbol: "196170",
      name: "알테오젠",
      reason: "글로벌 제약사와의 기술 수출 임상 3상 진입 예정",
      trendStrength: 85,
      timestamp: new Date(Date.now() - 7200000).toISOString()
    }
  ];

  return NextResponse.json({ ok: true, stocks });
}
