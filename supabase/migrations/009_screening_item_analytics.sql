-- 오버나이트 스크리닝 종목 상세 테이블에 분석용 수치 컬럼 추가.
--
-- 목적: "윗꼬리 5~10% 구간 평균 다음날 수익률" 같은 조건별 통계 쿼리를 빠르게
--       실행하기 위해, 기존에 텍스트(reasons)로만 존재하던 지표를 숫자 컬럼으로 분리 저장.
--
-- 채우기 주체:
--   - tail_ratio / volume_ratio / turnover_rate / freshness_count
--       → 스크리닝 시점(overnight/route.ts)에 계산되어 INSERT 시 함께 저장.
--   - next_open / next_close / open_return / close_return / trend
--       → 백테스트 조회 시점(backtest/route.ts)에 다음 거래일 확정값을 UPDATE로 채움.
--         한 번 채워진 확정값(next_close IS NOT NULL)은 덮어쓰지 않는다.
--
-- 주의: 기존 데이터(마이그레이션 이전 저장분)는 원본 지표가 없어 소급 채우기 불가.
--       이 마이그레이션 이후 저장되는 데이터부터 누적 시작한다.

ALTER TABLE public.overnight_screening_items
  ADD COLUMN IF NOT EXISTS tail_ratio numeric,       -- 윗꼬리 비율(%) = (당일고가 - 당일종가) / 당일고가 * 100
  ADD COLUMN IF NOT EXISTS volume_ratio numeric,     -- 20일 평균 거래량 대비 당일 거래량 비율(%)
  ADD COLUMN IF NOT EXISTS turnover_rate numeric,    -- 회전율(%) — detail.vol_tnrt
  ADD COLUMN IF NOT EXISTS freshness_count integer,  -- 테마 신선도 충족 개수(0~4)
  ADD COLUMN IF NOT EXISTS next_open numeric,         -- 다음 거래일 시가(원주가, 확정값)
  ADD COLUMN IF NOT EXISTS next_close numeric,        -- 다음 거래일 종가(원주가, 확정값)
  ADD COLUMN IF NOT EXISTS open_return numeric,       -- 시가 매도 수익률(%) = (next_open - entry_close) / entry_close * 100
  ADD COLUMN IF NOT EXISTS close_return numeric,      -- 종가 매도 수익률(%) = (next_close - entry_close) / entry_close * 100
  ADD COLUMN IF NOT EXISTS trend text;                -- 추세 라벨 (classifyTrend 결과)

-- 조건별 통계 쿼리(WHERE close_return IS NOT NULL, tail_ratio 구간 GROUP BY) 가속용 인덱스
CREATE INDEX IF NOT EXISTS idx_screening_items_tail_ratio
  ON public.overnight_screening_items(tail_ratio);
CREATE INDEX IF NOT EXISTS idx_screening_items_close_return
  ON public.overnight_screening_items(close_return);
