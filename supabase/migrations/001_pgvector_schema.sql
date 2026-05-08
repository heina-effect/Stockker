-- ============================================================
-- Stockker Phase 20 — Supabase pgvector Schema Migration
-- Project: unuzvliqvwzjmjgzlgwy
-- Run in Supabase Dashboard > SQL Editor
-- ============================================================

-- 1. Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- ============================================================
-- 2. news_sources — Raw news and disclosure storage
-- ============================================================
CREATE TABLE IF NOT EXISTS news_sources (
  id            TEXT PRIMARY KEY,
  symbol        TEXT NOT NULL,
  company_name  TEXT,
  source_type   TEXT NOT NULL CHECK (source_type IN ('news', 'disclosure', 'analyst')),
  provider      TEXT NOT NULL,
  title         TEXT NOT NULL,
  url           TEXT,
  collected_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  published_at  TIMESTAMPTZ,
  is_mock       BOOLEAN NOT NULL DEFAULT FALSE,
  raw_text      TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_news_sources_symbol ON news_sources (symbol);
CREATE INDEX IF NOT EXISTS idx_news_sources_published ON news_sources (published_at DESC);
CREATE INDEX IF NOT EXISTS idx_news_sources_not_mock ON news_sources (is_mock) WHERE is_mock = FALSE;

-- ============================================================
-- 3. source_embeddings — Embeddings + quality scores
-- ============================================================
CREATE TABLE IF NOT EXISTS source_embeddings (
  id                  TEXT PRIMARY KEY,
  symbol              TEXT NOT NULL,
  company_name        TEXT,
  source_type         TEXT NOT NULL,
  provider            TEXT,
  title               TEXT NOT NULL,
  snippet             TEXT,
  raw_text            TEXT,
  url                 TEXT,
  collected_at        TIMESTAMPTZ,
  published_at        TIMESTAMPTZ,
  embedding           vector(3072),          -- gemini-embedding-001
  embedding_model     TEXT DEFAULT 'gemini-embedding-001',
  embedding_dim       INT DEFAULT 3072,
  quality_score       FLOAT,               -- 0-100
  quality_label       TEXT CHECK (quality_label IN ('high', 'medium', 'low', 'rejected')),
  strategy_tags       TEXT[],
  cluster_group       TEXT,
  cross_confirm_count INT DEFAULT 0,
  is_mock             BOOLEAN DEFAULT FALSE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_source_emb_symbol ON source_embeddings (symbol);
CREATE INDEX IF NOT EXISTS idx_source_emb_quality ON source_embeddings (quality_label);
CREATE INDEX IF NOT EXISTS idx_source_emb_published ON source_embeddings (published_at DESC);

-- IVFFlat index for cosine similarity search (build after initial data load)
-- Run after loading initial rows:
-- CREATE INDEX ON source_embeddings USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- ============================================================
-- 4. issue_clusters — Curated issue clusters per symbol
-- ============================================================
CREATE TABLE IF NOT EXISTS issue_clusters (
  id                    TEXT PRIMARY KEY,
  symbol                TEXT NOT NULL,
  title                 TEXT NOT NULL,
  summary               TEXT,
  sentiment             TEXT CHECK (sentiment IN ('positive', 'negative', 'neutral')),
  representative_source TEXT,
  source_count          INT DEFAULT 1,
  basis_source_ids      TEXT[],
  timestamp             TIMESTAMPTZ NOT NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at            TIMESTAMPTZ           -- for freshness TTL
);

CREATE INDEX IF NOT EXISTS idx_clusters_symbol ON issue_clusters (symbol);
CREATE INDEX IF NOT EXISTS idx_clusters_created ON issue_clusters (created_at DESC);

-- ============================================================
-- 5. trusted_centroids / spam_centroids — Reference embeddings
-- ============================================================
CREATE TABLE IF NOT EXISTS embedding_centroids (
  id          TEXT PRIMARY KEY,
  type        TEXT NOT NULL CHECK (type IN ('trusted', 'spam')),
  label       TEXT NOT NULL,
  description TEXT,
  embedding   vector(3072),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 6. RPC: match_source_embeddings — Similarity search
-- ============================================================
CREATE OR REPLACE FUNCTION match_source_embeddings(
  query_embedding vector(3072),
  match_symbol    TEXT,
  match_count     INT,
  match_threshold FLOAT DEFAULT 0.7
)
RETURNS TABLE (
  id                  TEXT,
  symbol              TEXT,
  company_name        TEXT,
  source_type         TEXT,
  provider            TEXT,
  title               TEXT,
  snippet             TEXT,
  raw_text            TEXT,
  url                 TEXT,
  collected_at        TIMESTAMPTZ,
  published_at        TIMESTAMPTZ,
  quality_score       FLOAT,
  quality_label       TEXT,
  strategy_tags       TEXT[],
  cross_confirm_count INT,
  similarity          FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    se.id, se.symbol, se.company_name, se.source_type,
    se.provider, se.title, se.snippet, se.raw_text, se.url,
    se.collected_at, se.published_at,
    se.quality_score, se.quality_label, se.strategy_tags,
    se.cross_confirm_count,
    1 - (se.embedding <=> query_embedding) AS similarity
  FROM source_embeddings se
  WHERE
    se.is_mock = FALSE
    AND (match_symbol IS NULL OR se.symbol = match_symbol)
    AND se.embedding IS NOT NULL
    AND 1 - (se.embedding <=> query_embedding) > match_threshold
  ORDER BY similarity DESC
  LIMIT match_count;
END;
$$;

-- ============================================================
-- 7. RPC: nearest_centroid — Find nearest trusted/spam centroid
-- ============================================================
CREATE OR REPLACE FUNCTION nearest_centroid(
  query_embedding vector(3072),
  centroid_type   TEXT
)
RETURNS TABLE (similarity FLOAT, label TEXT)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    1 - (ec.embedding <=> query_embedding) AS similarity,
    ec.label
  FROM embedding_centroids ec
  WHERE ec.type = centroid_type
    AND ec.embedding IS NOT NULL
  ORDER BY similarity DESC
  LIMIT 1;
END;
$$;

-- ============================================================
-- 8. Row Level Security (RLS)
-- ============================================================
ALTER TABLE news_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE source_embeddings ENABLE ROW LEVEL SECURITY;
ALTER TABLE issue_clusters ENABLE ROW LEVEL SECURITY;
ALTER TABLE embedding_centroids ENABLE ROW LEVEL SECURITY;

-- Public read (anon can read curated, non-mock sources)
CREATE POLICY "Public read news_sources"
  ON news_sources FOR SELECT
  USING (is_mock = FALSE);

CREATE POLICY "Public read source_embeddings"
  ON source_embeddings FOR SELECT
  USING (is_mock = FALSE AND quality_label != 'rejected');

CREATE POLICY "Public read issue_clusters"
  ON issue_clusters FOR SELECT
  USING (TRUE);

-- Service role handles all writes (no policy needed for service role)
