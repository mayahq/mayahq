-- ============================================================================
-- MAYA MEMORY SYSTEM 2.0: TEMPORAL LAYER ENHANCEMENTS
-- ============================================================================
-- This migration implements Phase 1 of memory improvements:
-- 1. Reference tracking (last_referenced_at, reference_count)
-- 2. Enhanced temporal scoring with frequency and recency
-- 3. Improved time-weighted retrieval functions
--
-- Based on ChatGPT's memory architecture analysis
-- Date: 2025-11-11
-- ============================================================================

-- ----------------------------------------------------------------------------
-- PART 1: Add Reference Tracking Columns
-- ----------------------------------------------------------------------------

-- Add reference tracking to maya_memories
ALTER TABLE maya_memories
  ADD COLUMN IF NOT EXISTS last_referenced_at TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS reference_count INTEGER DEFAULT 0;

-- Add reference tracking to maya_thoughts
ALTER TABLE maya_thoughts
  ADD COLUMN IF NOT EXISTS last_referenced_at TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS reference_count INTEGER DEFAULT 0;

-- Create indexes for efficient temporal queries
CREATE INDEX IF NOT EXISTS idx_maya_memories_last_referenced
  ON maya_memories(last_referenced_at DESC);

CREATE INDEX IF NOT EXISTS idx_maya_memories_reference_count
  ON maya_memories(reference_count DESC);

CREATE INDEX IF NOT EXISTS idx_maya_memories_user_temporal
  ON maya_memories((metadata->>'userId'), last_referenced_at DESC);

CREATE INDEX IF NOT EXISTS idx_maya_thoughts_last_referenced
  ON maya_thoughts(user_id, last_referenced_at DESC);

CREATE INDEX IF NOT EXISTS idx_maya_thoughts_reference_count
  ON maya_thoughts(user_id, reference_count DESC);

-- Add composite index for temporal + reference queries
CREATE INDEX IF NOT EXISTS idx_maya_memories_temporal_composite
  ON maya_memories((metadata->>'userId'), last_referenced_at DESC, reference_count DESC);

COMMENT ON COLUMN maya_memories.last_referenced_at IS
  'Timestamp of when this memory was last retrieved/used in context';

COMMENT ON COLUMN maya_memories.reference_count IS
  'Number of times this memory has been retrieved - indicates importance through use';

COMMENT ON COLUMN maya_thoughts.last_referenced_at IS
  'Timestamp of when this thought was last referenced in chat context';

COMMENT ON COLUMN maya_thoughts.reference_count IS
  'Number of times this thought has been used in context generation';

-- ----------------------------------------------------------------------------
-- PART 2: Reference Tracking Functions
-- ----------------------------------------------------------------------------

-- Function to increment reference count for a memory
CREATE OR REPLACE FUNCTION increment_memory_reference(memory_id BIGINT)
RETURNS VOID AS $$
BEGIN
  UPDATE maya_memories
  SET
    reference_count = reference_count + 1,
    last_referenced_at = NOW()
  WHERE id = memory_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION increment_memory_reference IS
  'Increments reference count and updates last_referenced_at when a memory is used in context';

-- Function to increment reference count for a thought
CREATE OR REPLACE FUNCTION increment_thought_reference(thought_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE maya_thoughts
  SET
    reference_count = reference_count + 1,
    last_referenced_at = NOW()
  WHERE id = thought_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION increment_thought_reference IS
  'Increments reference count and updates last_referenced_at when a thought is used in context';

-- Batch reference update function (for multiple memories at once)
CREATE OR REPLACE FUNCTION increment_memory_references_batch(memory_ids BIGINT[])
RETURNS VOID AS $$
BEGIN
  UPDATE maya_memories
  SET
    reference_count = reference_count + 1,
    last_referenced_at = NOW()
  WHERE id = ANY(memory_ids);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION increment_memory_references_batch IS
  'Batch update for multiple memory references - more efficient than individual calls';

-- ----------------------------------------------------------------------------
-- PART 3: Enhanced Temporal Scoring Functions
-- ----------------------------------------------------------------------------

-- Calculate comprehensive temporal score combining recency, frequency, and importance
CREATE OR REPLACE FUNCTION calculate_temporal_score(
  p_created_at TIMESTAMPTZ,
  p_last_referenced_at TIMESTAMPTZ,
  p_reference_count INTEGER,
  p_importance REAL DEFAULT 0.5,
  p_recency_weight FLOAT DEFAULT 0.5,
  p_frequency_weight FLOAT DEFAULT 0.3,
  p_importance_weight FLOAT DEFAULT 0.2
) RETURNS FLOAT AS $$
DECLARE
  v_recency_score FLOAT;
  v_frequency_score FLOAT;
  v_days_since_reference FLOAT;
  v_days_since_creation FLOAT;
  v_final_score FLOAT;
BEGIN
  -- Use last_referenced_at if available, fallback to created_at
  v_days_since_reference := EXTRACT(EPOCH FROM (NOW() - COALESCE(p_last_referenced_at, p_created_at))) / 86400.0;
  v_days_since_creation := EXTRACT(EPOCH FROM (NOW() - p_created_at)) / 86400.0;

  -- Exponential decay with 7-day half-life for recency
  -- After 7 days: 50% relevance, 14 days: 25%, 21 days: 12.5%
  v_recency_score := EXP(-0.099 * v_days_since_reference);

  -- Logarithmic frequency score (0 refs = 0, 1 ref = 0.3, 10 refs = 0.77, 100 refs = 1.0)
  -- This prevents over-weighting highly referenced items
  v_frequency_score := LEAST(LN(COALESCE(p_reference_count, 0) + 1) / LN(100), 1.0);

  -- Weighted combination
  v_final_score :=
    (v_recency_score * p_recency_weight) +
    (v_frequency_score * p_frequency_weight) +
    (COALESCE(p_importance, 0.5) * p_importance_weight);

  -- Normalize to 0-1 range
  RETURN LEAST(v_final_score, 1.0);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

COMMENT ON FUNCTION calculate_temporal_score IS
  'Comprehensive temporal scoring: recency (50%) + frequency (30%) + importance (20%)';

-- Calculate time weight for use in combined similarity + temporal scoring
CREATE OR REPLACE FUNCTION calculate_time_weight(
  p_created_at TIMESTAMPTZ,
  p_last_referenced_at TIMESTAMPTZ,
  p_half_life_hours INTEGER DEFAULT 168 -- 7 days
) RETURNS FLOAT AS $$
DECLARE
  v_hours_elapsed FLOAT;
  v_time_weight FLOAT;
BEGIN
  -- Use last_referenced_at if available, otherwise created_at
  v_hours_elapsed := EXTRACT(EPOCH FROM (NOW() - COALESCE(p_last_referenced_at, p_created_at))) / 3600.0;

  -- Exponential decay: weight = 0.5^(hours_elapsed / half_life)
  v_time_weight := POWER(0.5, v_hours_elapsed / p_half_life_hours);

  RETURN v_time_weight;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

COMMENT ON FUNCTION calculate_time_weight IS
  'Exponential time decay for use in hybrid similarity+temporal scoring';

-- ----------------------------------------------------------------------------
-- PART 4: Enhanced Time-Weighted Memory Search
-- ----------------------------------------------------------------------------

-- Improved version of time_weighted_memory_search with reference tracking
CREATE OR REPLACE FUNCTION enhanced_time_weighted_memory_search(
  query_embedding vector(1024),
  p_user_id TEXT,
  lambda FLOAT DEFAULT 0.7,           -- Similarity weight (70%)
  half_life_hours INTEGER DEFAULT 168, -- 7 days
  reference_boost FLOAT DEFAULT 0.1,   -- Additional weight for referenced items
  max_results INTEGER DEFAULT 10,
  similarity_threshold FLOAT DEFAULT 0.75
)
RETURNS TABLE (
  id BIGINT,
  content TEXT,
  similarity FLOAT,
  time_weight FLOAT,
  reference_score FLOAT,
  combined_score FLOAT,
  created_at TIMESTAMPTZ,
  last_referenced_at TIMESTAMPTZ,
  reference_count INTEGER,
  metadata JSONB
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    m.id,
    m.content,
    (1 - (m.embedding <=> query_embedding)) AS similarity,
    calculate_time_weight(m.created_at, m.last_referenced_at, half_life_hours) AS time_weight,
    LEAST(LN(COALESCE(m.reference_count, 0) + 1) / LN(10), 1.0) AS reference_score,
    (
      (lambda * (1 - (m.embedding <=> query_embedding))) +
      ((1 - lambda) * calculate_time_weight(m.created_at, m.last_referenced_at, half_life_hours)) +
      (reference_boost * LEAST(LN(COALESCE(m.reference_count, 0) + 1) / LN(10), 1.0))
    ) AS combined_score,
    m.created_at,
    m.last_referenced_at,
    m.reference_count,
    m.metadata
  FROM maya_memories m
  WHERE
    m.metadata->>'userId' = p_user_id
    AND (1 - (m.embedding <=> query_embedding)) > similarity_threshold
  ORDER BY combined_score DESC
  LIMIT max_results;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION enhanced_time_weighted_memory_search IS
  'Hybrid search combining similarity (70%) + recency (30%) + reference frequency boost (10%)';

-- ----------------------------------------------------------------------------
-- PART 5: Temporal Range Queries
-- ----------------------------------------------------------------------------

-- Search memories within a specific time range
CREATE OR REPLACE FUNCTION temporal_range_memory_search(
  query_embedding vector(1024),
  p_user_id TEXT,
  start_time TIMESTAMPTZ,
  end_time TIMESTAMPTZ,
  max_results INTEGER DEFAULT 10,
  similarity_threshold FLOAT DEFAULT 0.70
)
RETURNS TABLE (
  id BIGINT,
  content TEXT,
  similarity FLOAT,
  created_at TIMESTAMPTZ,
  reference_count INTEGER,
  metadata JSONB
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    m.id,
    m.content,
    (1 - (m.embedding <=> query_embedding)) AS similarity,
    m.created_at,
    m.reference_count,
    m.metadata
  FROM maya_memories m
  WHERE
    m.metadata->>'userId' = p_user_id
    AND m.created_at >= start_time
    AND m.created_at <= end_time
    AND (1 - (m.embedding <=> query_embedding)) > similarity_threshold
  ORDER BY
    (1 - (m.embedding <=> query_embedding)) DESC,
    m.reference_count DESC
  LIMIT max_results;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION temporal_range_memory_search IS
  'Search memories within a specific time window (e.g., "last week", "yesterday")';

-- ----------------------------------------------------------------------------
-- PART 6: Reference-Weighted Retrieval
-- ----------------------------------------------------------------------------

-- Get most frequently referenced memories (popular/important memories)
CREATE OR REPLACE FUNCTION get_frequently_referenced_memories(
  p_user_id TEXT,
  min_references INTEGER DEFAULT 3,
  max_age_days INTEGER DEFAULT 30,
  max_results INTEGER DEFAULT 20
)
RETURNS TABLE (
  id BIGINT,
  content TEXT,
  reference_count INTEGER,
  last_referenced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ,
  days_since_reference FLOAT,
  metadata JSONB
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    m.id,
    m.content,
    m.reference_count,
    m.last_referenced_at,
    m.created_at,
    EXTRACT(EPOCH FROM (NOW() - m.last_referenced_at)) / 86400.0 AS days_since_reference,
    m.metadata
  FROM maya_memories m
  WHERE
    m.metadata->>'userId' = p_user_id
    AND m.reference_count >= min_references
    AND m.created_at >= NOW() - (max_age_days || ' days')::INTERVAL
  ORDER BY
    m.reference_count DESC,
    m.last_referenced_at DESC
  LIMIT max_results;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION get_frequently_referenced_memories IS
  'Retrieve memories that have been referenced multiple times - indicates ongoing importance';

-- ----------------------------------------------------------------------------
-- PART 7: Decay and Cleanup Functions
-- ----------------------------------------------------------------------------

-- Function to identify stale memories (old + never referenced)
CREATE OR REPLACE FUNCTION identify_stale_memories(
  p_user_id TEXT,
  max_age_days INTEGER DEFAULT 90,
  max_references INTEGER DEFAULT 0
)
RETURNS TABLE (
  id BIGINT,
  content TEXT,
  created_at TIMESTAMPTZ,
  reference_count INTEGER,
  days_old FLOAT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    m.id,
    m.content,
    m.created_at,
    m.reference_count,
    EXTRACT(EPOCH FROM (NOW() - m.created_at)) / 86400.0 AS days_old
  FROM maya_memories m
  WHERE
    m.metadata->>'userId' = p_user_id
    AND m.reference_count <= max_references
    AND m.created_at < NOW() - (max_age_days || ' days')::INTERVAL
  ORDER BY m.created_at ASC;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION identify_stale_memories IS
  'Find memories that are old and never referenced - candidates for archival/deletion';

-- ----------------------------------------------------------------------------
-- PART 8: Analytics and Monitoring
-- ----------------------------------------------------------------------------

-- Get memory statistics for a user
CREATE OR REPLACE FUNCTION get_memory_statistics(p_user_id TEXT)
RETURNS TABLE (
  total_memories BIGINT,
  total_references BIGINT,
  avg_references_per_memory FLOAT,
  most_referenced_count INTEGER,
  memories_never_referenced BIGINT,
  memories_referenced_recently BIGINT, -- Last 7 days
  oldest_memory_age_days FLOAT,
  newest_memory_age_days FLOAT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*)::BIGINT AS total_memories,
    SUM(COALESCE(reference_count, 0))::BIGINT AS total_references,
    AVG(COALESCE(reference_count, 0))::FLOAT AS avg_references_per_memory,
    MAX(COALESCE(reference_count, 0))::INTEGER AS most_referenced_count,
    COUNT(*) FILTER (WHERE COALESCE(reference_count, 0) = 0)::BIGINT AS memories_never_referenced,
    COUNT(*) FILTER (WHERE last_referenced_at >= NOW() - INTERVAL '7 days')::BIGINT AS memories_referenced_recently,
    EXTRACT(EPOCH FROM (NOW() - MIN(created_at))) / 86400.0 AS oldest_memory_age_days,
    EXTRACT(EPOCH FROM (NOW() - MAX(created_at))) / 86400.0 AS newest_memory_age_days
  FROM maya_memories
  WHERE metadata->>'userId' = p_user_id;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION get_memory_statistics IS
  'Analytics function to monitor memory system health and usage patterns';

-- ----------------------------------------------------------------------------
-- PART 9: Grant Permissions
-- ----------------------------------------------------------------------------

-- Grant execute permissions to service role
GRANT EXECUTE ON FUNCTION increment_memory_reference TO service_role;
GRANT EXECUTE ON FUNCTION increment_thought_reference TO service_role;
GRANT EXECUTE ON FUNCTION increment_memory_references_batch TO service_role;
GRANT EXECUTE ON FUNCTION calculate_temporal_score TO service_role;
GRANT EXECUTE ON FUNCTION calculate_time_weight TO service_role;
GRANT EXECUTE ON FUNCTION enhanced_time_weighted_memory_search TO service_role;
GRANT EXECUTE ON FUNCTION temporal_range_memory_search TO service_role;
GRANT EXECUTE ON FUNCTION get_frequently_referenced_memories TO service_role;
GRANT EXECUTE ON FUNCTION identify_stale_memories TO service_role;
GRANT EXECUTE ON FUNCTION get_memory_statistics TO service_role;

GRANT EXECUTE ON FUNCTION increment_memory_reference TO authenticated;
GRANT EXECUTE ON FUNCTION get_memory_statistics TO authenticated;

-- ----------------------------------------------------------------------------
-- PART 10: Verification Queries
-- ----------------------------------------------------------------------------

-- Example: Test the enhanced search
-- SELECT * FROM enhanced_time_weighted_memory_search(
--   query_embedding := '[0.1, 0.2, ...]'::vector(1024),
--   p_user_id := 'user-uuid-here',
--   lambda := 0.7,
--   half_life_hours := 168,
--   reference_boost := 0.1,
--   max_results := 10
-- );

-- Example: Get memory stats
-- SELECT * FROM get_memory_statistics('user-uuid-here');

-- Example: Increment reference
-- SELECT increment_memory_reference(123);

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
-- Next Steps:
-- 1. Update TypeScript services to call increment_memory_reference()
-- 2. Switch retrieval to use enhanced_time_weighted_memory_search()
-- 3. Add monitoring dashboard using get_memory_statistics()
-- 4. Consider implementing cleanup job using identify_stale_memories()
-- ============================================================================
