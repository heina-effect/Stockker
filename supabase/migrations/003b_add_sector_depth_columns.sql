-- Add deeper sector exploration columns
ALTER TABLE sector_research_snapshots ADD COLUMN IF NOT EXISTS leaders TEXT[] DEFAULT '{}';
ALTER TABLE sector_research_snapshots ADD COLUMN IF NOT EXISTS laggards TEXT[] DEFAULT '{}';
ALTER TABLE sector_research_snapshots ADD COLUMN IF NOT EXISTS watch_candidates JSONB DEFAULT '[]';
