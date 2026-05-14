-- Stockker Migration 007 — DART-only/unsupported symbols search guard
-- DART corp-master can include delisted companies or unsupported markets.

UPDATE stock_master
SET is_active = FALSE,
    updated_at = NOW()
WHERE symbol IN (
  '155960', -- 지디: 상장폐지 이력
  '248020'  -- 젬: KONEX, Stockker KOSPI/KOSDAQ 지원 범위 밖
);
