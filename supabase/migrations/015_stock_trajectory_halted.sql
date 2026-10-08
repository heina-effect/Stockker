-- 거래정지(Halt) 감지용 컬럼 추가
--
-- is_halted: 연속 5거래일 이상 종가가 완전히 동일한 경우 해당 구간을 거래정지로 판정.

ALTER TABLE public.stock_trajectory
  ADD COLUMN IF NOT EXISTS is_halted boolean DEFAULT false;
