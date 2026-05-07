import { NextResponse } from "next/server";
import { SECTOR_UNIVERSE } from "@/data/sectors/taxonomy";

export async function GET() {
  const issues = [
    {
      id: "issue-global-1",
      title: "연준 금리 동결, 하반기 IT 투자 심리 회복 기대감 상승",
      description: "글로벌 금리 인하 기대가 다소 후퇴했으나, AI 발 인프라 투자 지속으로 반도체 등 핵심 부품 공급망의 안정성이 부각되고 있습니다.",
      trendStrength: 95,
      timestamp: new Date().toISOString()
    },
    {
      id: "issue-global-2",
      title: "완성차 업계, 차세대 전기차 플랫폼 조기 도입 발표",
      description: "국내외 주요 완성차 업계가 원가 절감과 성능 향상을 위해 2026년 예정이던 신규 플랫폼 도입을 내년으로 앞당길 계획입니다.",
      trendStrength: 88,
      timestamp: new Date(Date.now() - 3600000).toISOString()
    }
  ];

  return NextResponse.json({ ok: true, issues });
}
