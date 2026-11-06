// /api/screening/overnight 의 persistSkippedReason → 화면 문구(2026-11-02). 클라이언트 번들에 포함된다.
// 시간대 사유는 src/server/kis/rest-client.ts getKSTPersistWindow, 나머지는 overnight 라우트의 저장 요청 판정과 첫 저장 보호에서 온다.
const LABELS: Record<string, { title: string; detail: string }> = {
  view_only: { title: "조회 전용 — 저장되지 않음", detail: "저장은 정기 실행에서만 합니다" },
  fresh_with_save: { title: "새로 조회와 저장 동시 요청 — 저장되지 않음", detail: "저장은 캐시를 쓰는 정기 실행 경로로만 합니다" },
  before_market_close: { title: "장중 조회 — 저장되지 않음", detail: "종가 확정(15:30:00~15:30:30) 전 값은 기록에 남기지 않습니다" },
  before_scheduled_run: { title: "정기 실행 전 조회 — 저장되지 않음", detail: "종가는 15:30:00~15:30:30 사이에 확정되고, 정기 실행은 15:41 입니다" },
  after_hours_session: { title: "애프터마켓 중 조회 — 저장되지 않음", detail: "16:00~20:00 에는 당일 종가 자리에 애프터마켓 체결가가 섞여 기록에 남기지 않습니다" },
  after_market_close: { title: "애프터마켓 종료 후 조회 — 저장되지 않음", detail: "20:00 이후에도 당일 종가 자리에 애프터마켓 마지막 체결가가 남아 기록에 남기지 않습니다. 저장은 15:40~16:00 에만 합니다" },
  save_check_failed: { title: "저장 확인 실패 — 저장되지 않음", detail: "오늘 저장 여부를 확인하지 못해 기록을 덮어쓰지 않았습니다" },
  force_log_failed: { title: "덮어쓰기 기록 실패 — 저장되지 않음", detail: "덮어쓰기 전 기록을 남기지 못해 저장하지 않았습니다" },
};

function formatSavedTime(savedAt: string): string {
  return new Date(savedAt).toLocaleTimeString("ko-KR", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", hour12: false });
}

export function persistSkipLabel(reason: string | undefined, savedAt?: string): { title: string; detail: string } {
  if (reason === "already_saved") {
    return {
      title: savedAt ? `이미 저장됨(${formatSavedTime(savedAt)}) — 이번 조회는 저장되지 않음` : "이미 저장됨 — 이번 조회는 저장되지 않음",
      detail: "오늘 기록은 첫 저장을 유지합니다",
    };
  }
  return (reason && LABELS[reason]) || { title: "저장되지 않음", detail: "이번 조회 결과는 기록에 남기지 않았습니다" };
}
