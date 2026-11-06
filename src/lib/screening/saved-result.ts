// 저장된 선별 결과를 화면에 보여 줄 때 쓰는 문구(2026-11-05). 클라이언트 번들에 포함된다.

export const OVERNIGHT_DISCLAIMER =
  "본 스크리닝 결과는 이동평균선 및 당사의 오버나이트 알고리즘 기준에 따라 추출된 참고 자료이며, 투자 결과에 대한 책임은 투자자 본인에게 있습니다.";

/** "20261105" → "11월 5일" */
export function tradeDateLabel(tradeDate: string): string {
  return `${Number(tradeDate.slice(4, 6))}월 ${Number(tradeDate.slice(6, 8))}일`;
}

/** KST 24시간 표기 "15:41" */
export function kstClock(iso: string): string {
  return new Date(iso).toLocaleTimeString("ko-KR", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", hour12: false });
}

/** "11월 5일 15:41 선별 결과". 저장 시각을 모르면 날짜만 쓴다 */
export function savedResultTitle(tradeDate: string, savedAt?: string | null): string {
  return `${tradeDateLabel(tradeDate)}${savedAt ? ` ${kstClock(savedAt)}` : ""} 선별 결과`;
}
