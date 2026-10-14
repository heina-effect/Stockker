-- 거래일 캘린더 테이블.
--
-- 목적: trajectory-update.ts의 days_after가 "직전 최대값 + 1" 카운터라 스크리닝 공백(미실행일)
-- 발생 시 실제 거래일보다 적게 기록되는 문제가 있었다(Phase 42). 코스닥 지수 일봉으로 확보한
-- 실제 거래일 목록을 별도 테이블로 저장해, days_after를 "달력 위 인덱스"가 아니라 "실제 거래일
-- 인덱스"로 계산할 수 있게 한다.
--
-- 채우는 주체: POST /api/screening/backfill-trading-calendar(소급, 관리자용)와
-- trajectory-update.ts의 일일 자동 갱신(하루 1회 지수 조회로 오늘 날짜만 upsert) 두 경로.

CREATE TABLE IF NOT EXISTS public.trading_calendar (
  trade_date text PRIMARY KEY,           -- YYYYMMDD, stock_trajectory.trade_date와 동일 포맷
  source text NOT NULL DEFAULT 'kosdaq_index',
  created_at timestamptz DEFAULT now() NOT NULL
);
