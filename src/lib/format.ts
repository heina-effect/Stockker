/**
 * 숫자를 한국 통화(KRW) 형식의 문자열로 변환합니다.
 */
export const formatCurrency = (value: number): string => {
  return new Intl.NumberFormat("ko-KR", {
    style: "currency",
    currency: "KRW",
  }).format(value);
};

/**
 * 숫자를 천 단위 구분 기호가 있는 문자열로 변환합니다.
 */
export const formatNumber = (value: number): string => {
  return new Intl.NumberFormat("ko-KR").format(value);
};

/**
 * 등락률을 퍼센트 형식의 문자열로 변환합니다.
 * @param value 등락률 (예: 1.25)
 * @param includeSign 부호 포함 여부
 */
export const formatPercent = (value: number, includeSign = true): string => {
  const formatted = value.toFixed(2) + "%";
  if (includeSign && value > 0) {
    return "+" + formatted;
  }
  return formatted;
};

/**
 * 날짜 객체 또는 문자열을 시:분:초 형식의 문자열로 변환합니다.
 */
export const formatTime = (date: Date | string): string => {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleTimeString("ko-KR", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
};
