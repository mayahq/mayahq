-- ============================================================================
-- INSTAGRAM INSPIRATION IMAGES SYSTEM
-- ============================================================================
-- Tables for storing Instagram inspiration images scraped by Clawdbot
-- and tracking search history for hashtags/accounts.
--
-- Date: 2026-01-28
-- ============================================================================

-- ----------------------------------------------------------------------------
-- PART 1: Create inspo_images Table
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS inspo_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Image data
  image_url TEXT NOT NULL,
  post_url TEXT NOT NULL UNIQUE,
  source_account TEXT NOT NULL,
  source_hashtag TEXT NOT NULL,
  caption TEXT,
  likes INTEGER NOT NULL DEFAULT 0,

  -- Scoring and display
  score FLOAT DEFAULT 0,
  is_shown BOOLEAN DEFAULT FALSE,
  date_shown TIMESTAMPTZ,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_inspo_images_shown
  ON inspo_images(is_shown, score DESC);

CREATE INDEX IF NOT EXISTS idx_inspo_images_source_account
  ON inspo_images(source_account);

CREATE INDEX IF NOT EXISTS idx_inspo_images_source_hashtag
  ON inspo_images(source_hashtag);

CREATE INDEX IF NOT EXISTS idx_inspo_images_created
  ON inspo_images(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_inspo_images_score
  ON inspo_images(score DESC);

-- Add comments
COMMENT ON TABLE inspo_images IS
  'Instagram inspiration images scraped by Clawdbot for content ideas';

COMMENT ON COLUMN inspo_images.post_url IS
  'Original Instagram post URL (unique constraint prevents duplicates)';

COMMENT ON COLUMN inspo_images.source_account IS
  'Instagram account the image was scraped from';

COMMENT ON COLUMN inspo_images.source_hashtag IS
  'Hashtag used to find this image';

COMMENT ON COLUMN inspo_images.score IS
  'AI-generated quality/relevance score for prioritization';

COMMENT ON COLUMN inspo_images.is_shown IS
  'Whether this image has been shown/used already';

COMMENT ON COLUMN inspo_images.date_shown IS
  'When the image was marked as shown';

-- ----------------------------------------------------------------------------
-- PART 2: Create search_history Table
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS inspo_search_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Search data
  search_term TEXT NOT NULL,
  search_type TEXT NOT NULL DEFAULT 'hashtag',
  results_found INTEGER DEFAULT 0,

  -- Timestamps
  last_searched TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_inspo_search_history_term
  ON inspo_search_history(search_term, search_type);

CREATE INDEX IF NOT EXISTS idx_inspo_search_history_last
  ON inspo_search_history(last_searched DESC);

-- Add comments
COMMENT ON TABLE inspo_search_history IS
  'Tracks Instagram search history for hashtags and accounts';

COMMENT ON COLUMN inspo_search_history.search_type IS
  'Type of search: hashtag, account, or explore';

-- ----------------------------------------------------------------------------
-- PART 3: Auto-update updated_at trigger
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION update_inspo_images_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_inspo_images_updated_at
  BEFORE UPDATE ON inspo_images
  FOR EACH ROW
  EXECUTE FUNCTION update_inspo_images_updated_at();

-- ----------------------------------------------------------------------------
-- PART 4: Row Level Security
-- ----------------------------------------------------------------------------

ALTER TABLE inspo_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE inspo_search_history ENABLE ROW LEVEL SECURITY;

-- Service role can access everything (for API key auth)
CREATE POLICY "Service role full access inspo_images" ON inspo_images
  FOR ALL USING (true);

CREATE POLICY "Service role full access inspo_search_history" ON inspo_search_history
  FOR ALL USING (true);

-- ----------------------------------------------------------------------------
-- PART 5: Grant Permissions
-- ----------------------------------------------------------------------------

GRANT ALL ON inspo_images TO service_role;
GRANT ALL ON inspo_search_history TO service_role;

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
