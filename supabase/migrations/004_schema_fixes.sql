-- ============================================================
-- Stockker Migration 004 — 스키마 수정 및 성능 개선
-- 적용 방법: Supabase Dashboard > SQL Editor에서 실행
-- ============================================================

-- ============================================================
-- 1. stock_research_snapshots (migration 002 미적용 보완)
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
-- 2. sector_research_snapshots (migration 002 미적용 보완)
-- ============================================================
CREATE TABLE IF NOT EXISTS sector_research_snapshots (
  sector_id               TEXT PRIMARY KEY,
  name                    TEXT NOT NULL,
  description             TEXT NOT NULL,
  trend_strength          FLOAT NOT NULL,
  ai_summary              TEXT NOT NULL,
  representative_symbols  TEXT[] DEFAULT '{}',
  related_issues          JSONB DEFAULT '[]',
  leaders                 TEXT[] DEFAULT '{}',
  laggards                TEXT[] DEFAULT '{}',
  watch_candidates        JSONB DEFAULT '[]',
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sector_snapshots_updated ON sector_research_snapshots (updated_at DESC);

-- ============================================================
-- 3. RLS for snapshot tables
-- ============================================================
ALTER TABLE stock_research_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE sector_research_snapshots ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'stock_research_snapshots' AND policyname = 'Public read stock_research_snapshots'
  ) THEN
    CREATE POLICY "Public read stock_research_snapshots"
      ON stock_research_snapshots FOR SELECT USING (TRUE);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'sector_research_snapshots' AND policyname = 'Public read sector_research_snapshots'
  ) THEN
    CREATE POLICY "Public read sector_research_snapshots"
      ON sector_research_snapshots FOR SELECT USING (TRUE);
  END IF;
END$$;

-- ============================================================
-- 4. source_embeddings 복합 인덱스 추가 (getRecentCuratedSources 쿼리 최적화)
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_source_emb_symbol_collected
  ON source_embeddings (symbol, collected_at DESC);

CREATE INDEX IF NOT EXISTS idx_source_emb_symbol_quality_collected
  ON source_embeddings (symbol, quality_label, collected_at DESC)
  WHERE is_mock = FALSE;

-- ============================================================
-- 5. news_sources 복합 인덱스 추가
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_news_sources_symbol_collected
  ON news_sources (symbol, collected_at DESC);

-- ============================================================
-- 6. issue_clusters 테이블 제거 (코드에서 사용하지 않음, 0건)
--    주의: 혹시 외부 참조가 있다면 이 구문을 제거하세요
-- ============================================================
DROP TABLE IF EXISTS issue_clusters;

-- ============================================================
-- 7. embedding_centroids 유지 (코드 참조 있음, 향후 활성화 예정)
--    현재 0건이나 findNearestTrustedCentroid 에서 참조
-- ============================================================
-- (삭제하지 않음)

-- ============================================================
-- 확인 쿼리 (실행 후 아래로 결과 검증)
-- ============================================================
SELECT
  'stock_research_snapshots' AS tbl, COUNT(*) FROM stock_research_snapshots
UNION ALL
SELECT 'sector_research_snapshots', COUNT(*) FROM sector_research_snapshots
UNION ALL
SELECT 'source_embeddings', COUNT(*) FROM source_embeddings
UNION ALL
SELECT 'news_sources', COUNT(*) FROM news_sources
UNION ALL
SELECT 'embedding_centroids', COUNT(*) FROM embedding_centroids;
