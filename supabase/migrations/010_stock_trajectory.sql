-- 발굴 종목 궤적(trajectory) 소급 수집 테이블.
--
-- 목적: overnight_screening_items에는 "스크리닝에 잡힌 날의 스냅샷"만 있어
--       종목의 발굴 이후 궤적(MFE/MAE 분석, 스윙 전략 검증)을 알 수 없다.
--       발굴일(discovery_date) 이후 최대 30거래일의 일봉을 소급 수집해 별도 저장한다.
--
-- 채우기 주체: POST /api/screening/backfill-trajectory (CRON_SECRET 인증 필요)

CREATE TABLE IF NOT EXISTS public.stock_trajectory (
  id bigserial PRIMARY KEY,
  symbol text NOT NULL,
  name text NOT NULL,
  discovery_date text NOT NULL,
  trade_date text NOT NULL,
  days_after integer NOT NULL,
  open numeric, high numeric, low numeric, close numeric,
  volume bigint,
  return_from_entry numeric,
  created_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT uq_trajectory UNIQUE (symbol, discovery_date, trade_date)
);

CREATE INDEX IF NOT EXISTS idx_trajectory_symbol_disc
  ON public.stock_trajectory(symbol, discovery_date);
