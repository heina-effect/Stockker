-- 궤적(stock_trajectory) 기술지표 컬럼 추가 + 포착일 이전 구간 표시.
--
-- RSI(14)/MACD(12,26,9)/MA60 계산에는 포착일 이전 데이터가 필요하므로,
-- 백필/일일 갱신 로직이 포착일 -60거래일 ~ +30거래일 구간을 저장하도록 확장한다.
-- is_pre_discovery = true인 행(days_after < 0)은 지표 계산용 히스토리 목적이며
-- 실제 보유 구간이 아니다.

ALTER TABLE public.stock_trajectory
  ADD COLUMN IF NOT EXISTS rsi14 numeric,
  ADD COLUMN IF NOT EXISTS macd numeric,
  ADD COLUMN IF NOT EXISTS macd_signal numeric,
  ADD COLUMN IF NOT EXISTS macd_hist numeric,
  ADD COLUMN IF NOT EXISTS bb_upper numeric,
  ADD COLUMN IF NOT EXISTS bb_mid numeric,
  ADD COLUMN IF NOT EXISTS bb_lower numeric,
  ADD COLUMN IF NOT EXISTS bb_pct_b numeric,
  ADD COLUMN IF NOT EXISTS ma5 numeric,
  ADD COLUMN IF NOT EXISTS ma20 numeric,
  ADD COLUMN IF NOT EXISTS ma60 numeric,
  ADD COLUMN IF NOT EXISTS vol_ratio_5 numeric,
  ADD COLUMN IF NOT EXISTS vol_ratio_20 numeric,
  ADD COLUMN IF NOT EXISTS is_pre_discovery boolean DEFAULT false;
