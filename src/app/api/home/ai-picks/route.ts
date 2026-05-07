import { NextResponse } from "next/server";

export async function GET() {
  const picks = [
    {
      id: "ai-pick-1",
      type: "stock",
      targetId: "035420",
      name: "NAVER",
      recommendationType: "close_watch",
      reasons: [
        {
          summary: "주요 서비스 개편에 따른 트래픽 반등 시그널 포착",
          sourceType: "fundamental"
        }
      ],
      riskSummary: "단기 모멘텀 부재 시 외국인 매도세 압력 가능성 존재",
      confidenceScore: 78,
      disclaimer: "정보 제공 목적이며 투자 판단과 책임은 이용자 본인에게 있습니다.",
      generatedAt: new Date().toISOString()
    },
    {
      id: "ai-pick-2",
      type: "stock",
      targetId: "005380",
      name: "현대차",
      recommendationType: "checklist",
      reasons: [
        {
          summary: "안정적 실적 기반 주주환원 정책 구체화 임박",
          sourceType: "fundamental"
        }
      ],
      riskSummary: "글로벌 매크로 지표 악화에 따른 수요 둔화 시 실적 피크아웃 우려",
      confidenceScore: 82,
      disclaimer: "수익 보장/원금 보장 아님. 투자 판단은 본인 책임입니다.",
      generatedAt: new Date(Date.now() - 3600000).toISOString()
    }
  ];

  return NextResponse.json({ ok: true, picks });
}
