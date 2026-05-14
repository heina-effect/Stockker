-- Stockker Migration 008 — 해운 섹터 구성 종목 정정
-- 010120은 LS ELECTRIC(전력)이며 해운 섹터 종목이 아니다.

UPDATE sector_master
SET member_symbols = ARRAY['011200','028670','005880','044450','003280'],
    representative_symbols = ARRAY['011200','028670'],
    updated_at = NOW()
WHERE sector_id = 'sec-shipping';

INSERT INTO stock_master (symbol, name, market, sector_tag)
VALUES
  ('005880','대한해운','KOSPI','해운'),
  ('044450','KSS해운','KOSPI','해운'),
  ('003280','흥아해운','KOSPI','해운')
ON CONFLICT (symbol) DO UPDATE SET
  name = EXCLUDED.name,
  market = EXCLUDED.market,
  sector_tag = EXCLUDED.sector_tag,
  is_active = TRUE,
  updated_at = NOW();
