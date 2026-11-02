// /api/screening/overnight 의 persistSkippedReason → 화면 문구(2026-11-02). 클라이언트 번들에 포함된다.
// 사유 값은 src/server/kis/rest-client.ts getKSTPersistWindow 와 같다.
const LABELS: Record<string, { title: string; detail: string }> = {
  before_market_close: { title: "장중 조회 — 저장되지 않음", detail: "15:30 이전 값은 종가 확정 전이라 기록에 남기지 않습니다" },
  after_hours_session: { title: "애프터마켓 중 조회 — 저장되지 않음", detail: "16:00~20:00 에는 당일 종가 자리에 애프터마켓 체결가가 섞여 기록에 남기지 않습니다" },
};

export function persistSkipLabel(reason: string | undefined): { title: string; detail: string } {
  return (reason && LABELS[reason]) || { title: "저장되지 않음", detail: "이번 조회 결과는 기록에 남기지 않았습니다" };
}
