-- Maya Working Memory - Auto-extracted entities, projects, and tech stack
-- This table stores always-on context with temporal decay

CREATE TABLE IF NOT EXISTS maya_working_memory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,

  -- Memory classification
  memory_type TEXT NOT NULL CHECK (memory_type IN (
    'business',      -- Company/business names (MayaHQ, Anthropic)
    'project',       -- Active projects (Midnight Maya, Chat SDK)
    'tech_stack',    -- Technologies (React Native, Supabase, Railway)
    'person',        -- People mentioned
    'infrastructure', -- Services/platforms (Vercel, GitHub)
    'preference'     -- User preferences (deployment choices, etc)
  )),

  -- Core data
  key TEXT NOT NULL,              -- Normalized key (e.g., 'mayahq', 'railway')
  value TEXT NOT NULL,            -- Display value (e.g., 'MayaHQ', 'Railway')

  -- Confidence and importance
  confidence FLOAT NOT NULL DEFAULT 0.5 CHECK (confidence >= 0 AND confidence <= 1),
  mention_count INTEGER NOT NULL DEFAULT 1,
  importance_score FLOAT NOT NULL DEFAULT 0.5,

  -- Temporal tracking
  first_seen TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  last_mentioned TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

  -- Decay configuration
  decay_rate FLOAT NOT NULL DEFAULT 0.3 CHECK (decay_rate >= 0 AND decay_rate <= 1),

  -- Flexible metadata
  metadata JSONB DEFAULT '{}'::jsonb,

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Unique constraint: one entry per user/type/key combination
  UNIQUE(user_id, memory_type, key)
);

-- Indexes for fast retrieval
CREATE INDEX idx_working_memory_user_importance
  ON maya_working_memory(user_id, importance_score DESC);

CREATE INDEX idx_working_memory_user_type
  ON maya_working_memory(user_id, memory_type);

CREATE INDEX idx_working_memory_last_mentioned
  ON maya_working_memory(last_mentioned DESC);

-- Function to calculate importance score
CREATE OR REPLACE FUNCTION calculate_importance_score(
  p_last_mentioned TIMESTAMP WITH TIME ZONE,
  p_first_seen TIMESTAMP WITH TIME ZONE,
  p_mention_count INTEGER,
  p_confidence FLOAT,
  p_decay_rate FLOAT
) RETURNS FLOAT AS $$
DECLARE
  days_since_last_mention FLOAT;
  days_since_first_seen FLOAT;
  recency_score FLOAT;
  frequency_score FLOAT;
  longevity_bonus FLOAT;
  final_score FLOAT;
BEGIN
  -- Calculate days since last mention
  days_since_last_mention := EXTRACT(EPOCH FROM (NOW() - p_last_mentioned)) / 86400.0;
  days_since_first_seen := EXTRACT(EPOCH FROM (NOW() - p_first_seen)) / 86400.0;

  -- Recency decay (exponential)
  recency_score := EXP(-p_decay_rate * days_since_last_mention / 30.0);

  -- Frequency boost (logarithmic to prevent spam)
  frequency_score := LN(p_mention_count + 1) / LN(100);

  -- Longevity bonus (established facts stay relevant)
  longevity_bonus := LEAST(days_since_first_seen / 365.0, 0.3);

  -- Weighted combination
  final_score := (
    recency_score * 0.5 +      -- 50% weight on recency
    frequency_score * 0.3 +    -- 30% weight on frequency
    p_confidence * 0.2 +       -- 20% weight on confidence
    longevity_bonus            -- Bonus for established facts
  );

  RETURN GREATEST(LEAST(final_score, 1.0), 0.0); -- Clamp to 0-1
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Trigger to auto-update importance_score
CREATE OR REPLACE FUNCTION update_working_memory_importance()
RETURNS TRIGGER AS $$
BEGIN
  NEW.importance_score := calculate_importance_score(
    NEW.last_mentioned,
    NEW.first_seen,
    NEW.mention_count,
    NEW.confidence,
    NEW.decay_rate
  );
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_working_memory_importance
  BEFORE INSERT OR UPDATE ON maya_working_memory
  FOR EACH ROW
  EXECUTE FUNCTION update_working_memory_importance();

-- Function to get top working memory items
CREATE OR REPLACE FUNCTION get_working_memory(
  p_user_id UUID,
  p_limit INTEGER DEFAULT 20
) RETURNS TABLE (
  id UUID,
  memory_type TEXT,
  key TEXT,
  value TEXT,
  confidence FLOAT,
  mention_count INTEGER,
  importance_score FLOAT,
  last_mentioned TIMESTAMP WITH TIME ZONE,
  metadata JSONB
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    wm.id,
    wm.memory_type,
    wm.key,
    wm.value,
    wm.confidence,
    wm.mention_count,
    wm.importance_score,
    wm.last_mentioned,
    wm.metadata
  FROM maya_working_memory wm
  WHERE wm.user_id = p_user_id
  ORDER BY wm.importance_score DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- Function to upsert working memory (increment mentions or create new)
CREATE OR REPLACE FUNCTION upsert_working_memory(
  p_user_id UUID,
  p_memory_type TEXT,
  p_key TEXT,
  p_value TEXT,
  p_confidence FLOAT DEFAULT 0.8,
  p_decay_rate FLOAT DEFAULT 0.3,
  p_metadata JSONB DEFAULT '{}'::jsonb
) RETURNS UUID AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO maya_working_memory (
    user_id,
    memory_type,
    key,
    value,
    confidence,
    decay_rate,
    metadata,
    mention_count,
    first_seen,
    last_mentioned
  ) VALUES (
    p_user_id,
    p_memory_type,
    p_key,
    p_value,
    p_confidence,
    p_decay_rate,
    p_metadata,
    1,
    NOW(),
    NOW()
  )
  ON CONFLICT (user_id, memory_type, key) DO UPDATE SET
    mention_count = maya_working_memory.mention_count + 1,
    last_mentioned = NOW(),
    confidence = GREATEST(maya_working_memory.confidence, p_confidence),
    value = p_value, -- Update display value
    metadata = maya_working_memory.metadata || p_metadata
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$ LANGUAGE plpgsql;

-- Decay job function (to be called by cron)
CREATE OR REPLACE FUNCTION decay_working_memory()
RETURNS INTEGER AS $$
DECLARE
  rows_updated INTEGER;
BEGIN
  -- Recalculate all importance scores (triggers handle this)
  UPDATE maya_working_memory
  SET updated_at = NOW()
  WHERE importance_score > 0.01; -- Only update if still relevant

  GET DIAGNOSTICS rows_updated = ROW_COUNT;

  -- Delete entries that have decayed below threshold
  DELETE FROM maya_working_memory
  WHERE importance_score < 0.01
    AND last_mentioned < NOW() - INTERVAL '90 days';

  RETURN rows_updated;
END;
$$ LANGUAGE plpgsql;

-- Add RLS policies
ALTER TABLE maya_working_memory ENABLE ROW LEVEL SECURITY;

-- Users can only see their own working memory
CREATE POLICY "Users can view own working memory"
  ON maya_working_memory FOR SELECT
  USING (auth.uid() = user_id);

-- Service role can manage all working memory
CREATE POLICY "Service role can manage working memory"
  ON maya_working_memory FOR ALL
  USING (auth.role() = 'service_role');

-- Grant permissions
GRANT SELECT ON maya_working_memory TO authenticated;
GRANT ALL ON maya_working_memory TO service_role;

-- Comments
COMMENT ON TABLE maya_working_memory IS 'Auto-extracted entities, projects, and tech stack with temporal decay';
COMMENT ON COLUMN maya_working_memory.importance_score IS 'Calculated score combining recency, frequency, and confidence';
COMMENT ON COLUMN maya_working_memory.decay_rate IS 'How fast this memory decays: 0.05 (very slow) to 1.0 (very fast)';
COMMENT ON FUNCTION calculate_importance_score IS 'Calculates importance based on recency, frequency, confidence, and longevity';
COMMENT ON FUNCTION get_working_memory IS 'Retrieves top N working memory items by importance score';
COMMENT ON FUNCTION upsert_working_memory IS 'Creates or updates working memory entry (increments mention count)';
COMMENT ON FUNCTION decay_working_memory IS 'Recalculates importance scores and prunes old entries';
