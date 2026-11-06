-- 퀀트 판정 기록 테이블(2026-11-06).
--
-- 목적: overnight_screening_items 의 rsi14·quant_signal 은 재실행 삭제와 백필로 바뀌고, 판정에 쓴 거래량비와 판정 시각이
-- 남지 않는다. 저장 창(15:40~16:00)의 첫 판정을 한 번만 남겨 나중에 바뀌지 않게 한다.
--
-- 채우는 주체: 스크리닝 저장 성공 뒤 src/server/screening/quant-judgment.ts 가 ON CONFLICT DO NOTHING 으로 넣는다.
-- true 와 false 를 모두 남긴다(판정률의 분모). excludedNotice 는 판정 지표를 계산하지 않아 넣지 않는다.
-- overnight_screening_items 에 외래키를 걸지 않는다. 재실행 삭제에 같이 지워지면 안 된다.

CREATE TABLE IF NOT EXISTS public.quant_signal_judgments (
  date text NOT NULL,                -- YYYYMMDD, 발굴일
  symbol text NOT NULL,
  judged_at timestamptz NOT NULL,
  rsi14 numeric,
  vol_ratio_20 numeric,              -- 판정에 쓴 값. 옛 정의 건은 volume_basis 로 구분
  volume_basis text NOT NULL CHECK (volume_basis IN ('incl_today', 'excl_today')),
  close_at_judgment numeric,
  volume_at_judgment bigint,
  quant_signal boolean NOT NULL,
  criteria_version text NOT NULL,    -- 예: rsi50-60_vol200-400_wilder
  source text NOT NULL CHECK (source IN ('live', 'restored')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (date, symbol)
);

ALTER TABLE public.quant_signal_judgments ENABLE ROW LEVEL SECURITY;

-- 판정은 한 번 남으면 바뀌지 않는다. RLS 를 건너뛰는 service role 도 막으려고 트리거로 건다.
CREATE OR REPLACE FUNCTION public.reject_quant_judgment_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'quant_signal_judgments is append-only (% rejected)', TG_OP;
END;
$$;

CREATE TRIGGER quant_signal_judgments_no_update_delete
  BEFORE UPDATE OR DELETE ON public.quant_signal_judgments
  FOR EACH ROW EXECUTE FUNCTION public.reject_quant_judgment_change();

CREATE TRIGGER quant_signal_judgments_no_truncate
  BEFORE TRUNCATE ON public.quant_signal_judgments
  FOR EACH STATEMENT EXECUTE FUNCTION public.reject_quant_judgment_change();
