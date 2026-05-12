-- ============================================================
-- Stockker Phase 21 — Research Snapshots Migration
-- Productization of Intelligence
-- ============================================================

-- ============================================================
-- 1. stock_research_snapshots — Reusable Stock Intelligence
-- ============================================================
CREATE TABLE IF NOT EXISTS stock_research_snapshots (
  symbol              TEXT PRIMARY KEY,
  company_name        TEXT NOT NULL,
  ai_headline         TEXT NOT NULL,
  ai_summary          TEXT NOT NULL,
  sentiment_score     FLOAT NOT NULL,
  sentiment_label     TEXT NOT NULL,
  sentiment_trend     TEXT NOT NULL,
  positive_factors    TEXT[] DEFAULT '{}',
  negative_factors    TEXT[] DEFAULT '{}',
  basis_source_ids    TEXT[] DEFAULT '{}',
  is_fallback         BOOLEAN DEFAULT FALSE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stock_snapshots_updated ON stock_research_snapshots (updated_at DESC);

-- ============================================================
-- 2. sector_research_snapshots — Deep Sector Exploration
-- ============================================================
CREATE TABLE IF NOT EXISTS sector_research_snapshots (
  sector_id           TEXT PRIMARY KEY,
  name                TEXT NOT NULL,
  description         TEXT NOT NULL,
  trend_strength      FLOAT NOT NULL,
  ai_summary          TEXT NOT NULL,
  representative_symbols TEXT[] DEFAULT '{}',
  related_issues      JSONB DEFAULT '[]', -- array of objects { title, source, etc }
  leaders             TEXT[] DEFAULT '{}',
  laggards            TEXT[] DEFAULT '{}',
  watch_candidates    JSONB DEFAULT '[]',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sector_snapshots_updated ON sector_research_snapshots (updated_at DESC);

-- ============================================================
-- 3. Row Level Security (RLS)
-- ============================================================
ALTER TABLE stock_research_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE sector_research_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read stock_research_snapshots"
  ON stock_research_snapshots FOR SELECT
  USING (TRUE);

CREATE POLICY "Public read sector_research_snapshots"
  ON sector_research_snapshots FOR SELECT
  USING (TRUE);

-- Service role handles all writes
