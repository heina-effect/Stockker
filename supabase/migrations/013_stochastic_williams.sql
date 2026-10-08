-- 스토캐스틱 슬로우(15,5,5) + 윌리엄스 %R(19) 컬럼 추가.
--
-- 외부 리포트가 제시한 과매도 진입 조건(Slow %K 20이하 AND Williams%R -80이하)이
-- 우리 종목군(코스닥 중소형 급등주, 일봉)에서 실제로 유효한지 stock_trajectory 데이터로
-- 검증하기 위한 지표 컬럼. 계산 로직은 src/server/screening/indicators.ts 참고.

ALTER TABLE public.stock_trajectory
  ADD COLUMN IF NOT EXISTS stoch_slow_k numeric,
  ADD COLUMN IF NOT EXISTS stoch_slow_d numeric,
  ADD COLUMN IF NOT EXISTS williams_r numeric;
