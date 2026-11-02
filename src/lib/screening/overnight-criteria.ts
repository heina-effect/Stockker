// 오버나이트 스크리닝 기준값 — /api/screening/overnight 판정과 /overnight 화면 안내가 같은 값을 읽는다(2026-11-02).
// 값을 바꾸면 판정과 안내가 함께 바뀐다. 서버 전용 의존성을 넣지 말 것(클라이언트 번들에 포함된다).

export const OVERNIGHT_CRITERIA = {
  // 사전 제외 — 분석 슬롯을 차지하지 않고 조용히 버린다
  prefilter: {
    abnormalMovePct: 30, // 등락률 ±이 값 초과(감자·병합·거래재개 등)
    minPrice: 1000, // 이 값 미만 동전주
  },
  // 1차 후보 — 회전율 높은 순으로 maxTargets 개
  primary: {
    minChangeRate: 3, // 등락률 이상(%)
    minTradingValue: 1_000_000_000, // 거래대금 이상(원)
    maxTargets: 8,
  },
  // 주 필터
  main: {
    minTurnoverRate: 5.0, // 회전율 이상(%)
    maPeriods: [5, 20, 60, 120] as const, // 일봉·주봉 정배열 판정 이동평균
    minHistoryBars: 120, // 일봉·주봉 이 값 미만이면 분석 보류
    minVolumeRatio: 200, // 거래량 20일 평균 대비 이상(%) — 당일 제외 20일
    maxTailRatio: 3.5, // 윗꼬리 (고가−종가)/고가 이하(%)
    excludeChangeRate: 20, // 당일 등락률 이상이면 제외(%)
    limitUpChangeRate: 25, // 상한가 근접 — 사유만 다르게 적는다
  },
  // 테마 신선도 — 4개 중 minPass 개 이상
  freshness: {
    minPass: 3,
    bigCandlePct: 10, // 장대양봉: 시가 대비 종가 이상(%)
    bigCandleWithinDays: 5,
    bigCandleVolumeMultiple: 2, // 장대양봉 거래량 ≥ 직전 20일 평균 × 이 값
    contractionRatio: 0.5, // 조정기 거래량·변동폭이 장대양봉의 이 비율 이하
  },
  // 공격형: 주 필터 중 정배열·윗꼬리는 통과, 신선도 미달이거나 거래량비가 이 구간
  aggressiveVolumeRatio: { min: 150, max: 200 },
} as const;
