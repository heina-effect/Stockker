-- 발굴 종목 추적 화면(/overnight/tracking)의 즐겨찾기(발굴 건 단위).
-- 즐겨찾기된 (symbol, discovery_date)는 궤적 일일 자동 갱신 시 60종목 상한을
-- 초과하더라도 우선적으로 포함된다.

CREATE TABLE IF NOT EXISTS public.trajectory_favorites (
  id bigserial PRIMARY KEY,
  symbol text NOT NULL,
  discovery_date text NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT uq_trajectory_fav UNIQUE (symbol, discovery_date)
);
