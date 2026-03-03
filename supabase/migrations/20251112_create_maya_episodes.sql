-- ============================================================================
-- MAYA MEMORY SYSTEM 2.0: EPISODIC MEMORY (PHASE 2)
-- ============================================================================
-- This migration implements episodic memory - turning fragmented thoughts
-- and memories into coherent narrative episodes.
--
-- Based on ChatGPT's recommendation for episodic summaries
-- Date: 2025-11-12
-- ============================================================================

-- ----------------------------------------------------------------------------
-- PART 1: Create Episodes Table
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS maya_episodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Episode metadata
  episode_type TEXT NOT NULL CHECK (episode_type IN ('session', 'daily', 'weekly')),
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,

  -- Episode content
  summary TEXT NOT NULL,
  key_events JSONB DEFAULT '[]'::jsonb,
  topics TEXT[] DEFAULT '{}',
  emotional_arc JSONB DEFAULT '{}'::jsonb,

  -- Links to source data
  memory_ids BIGINT[] DEFAULT '{}',
  thought_ids UUID[] DEFAULT '{}',
  message_ids UUID[] DEFAULT '{}',

  -- Vector search
  embedding VECTOR(1024),

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- Statistics
  conversation_count INTEGER DEFAULT 0,
  total_tokens INTEGER DEFAULT 0
);

-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_maya_episodes_user_time
  ON maya_episodes(user_id, start_time DESC);

CREATE INDEX IF NOT EXISTS idx_maya_episodes_type
  ON maya_episodes(user_id, episode_type, start_time DESC);

CREATE INDEX IF NOT EXISTS idx_maya_episodes_topics
  ON maya_episodes USING GIN(topics);

CREATE INDEX IF NOT EXISTS idx_maya_episodes_embedding
  ON maya_episodes USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- Add comments
COMMENT ON TABLE maya_episodes IS
  'Episodic memory summaries - coherent narratives from fragmented memories and thoughts';

COMMENT ON COLUMN maya_episodes.episode_type IS
  'Type of episode: session (single chat), daily (full day), weekly (7 days)';

COMMENT ON COLUMN maya_episodes.summary IS
  'LLM-generated narrative summary of the episode in Maya''s voice';

COMMENT ON COLUMN maya_episodes.key_events IS
  'Array of important events: [{type, description, importance, timestamp}, ...]';

COMMENT ON COLUMN maya_episodes.emotional_arc IS
  'Emotional trajectory: {start_mood, end_mood, intensity, transitions}';

COMMENT ON COLUMN maya_episodes.memory_ids IS
  'Array of maya_memories.id that contributed to this episode';

COMMENT ON COLUMN maya_episodes.thought_ids IS
  'Array of maya_thoughts.id from this episode';

-- ----------------------------------------------------------------------------
-- PART 2: Episode Matching Function (Vector Search)
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION match_episodes(
  query_embedding VECTOR(1024),
  p_user_id UUID,
  match_threshold FLOAT DEFAULT 0.7,
  match_count INTEGER DEFAULT 5,
  episode_type_filter TEXT DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  episode_type TEXT,
  summary TEXT,
  start_time TIMESTAMPTZ,
  end_time TIMESTAMPTZ,
  topics TEXT[],
  key_events JSONB,
  emotional_arc JSONB,
  similarity FLOAT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    e.id,
    e.episode_type,
    e.summary,
    e.start_time,
    e.end_time,
    e.topics,
    e.key_events,
    e.emotional_arc,
    1 - (e.embedding <=> query_embedding) AS similarity
  FROM maya_episodes e
  WHERE
    e.user_id = p_user_id
    AND (episode_type_filter IS NULL OR e.episode_type = episode_type_filter)
    AND 1 - (e.embedding <=> query_embedding) > match_threshold
  ORDER BY similarity DESC
  LIMIT match_count;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION match_episodes IS
  'Semantic search for relevant episodes using vector similarity';

-- ----------------------------------------------------------------------------
-- PART 3: Get Recent Episodes (Temporal Fallback)
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION get_recent_episodes(
  p_user_id UUID,
  days_back INTEGER DEFAULT 7,
  episode_type_filter TEXT DEFAULT NULL,
  max_results INTEGER DEFAULT 10
)
RETURNS TABLE (
  id UUID,
  episode_type TEXT,
  summary TEXT,
  start_time TIMESTAMPTZ,
  end_time TIMESTAMPTZ,
  topics TEXT[],
  key_events JSONB,
  emotional_arc JSONB,
  days_ago FLOAT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    e.id,
    e.episode_type,
    e.summary,
    e.start_time,
    e.end_time,
    e.topics,
    e.key_events,
    e.emotional_arc,
    EXTRACT(EPOCH FROM (NOW() - e.start_time)) / 86400.0 AS days_ago
  FROM maya_episodes e
  WHERE
    e.user_id = p_user_id
    AND e.start_time >= NOW() - (days_back || ' days')::INTERVAL
    AND (episode_type_filter IS NULL OR e.episode_type = episode_type_filter)
  ORDER BY e.start_time DESC
  LIMIT max_results;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION get_recent_episodes IS
  'Retrieve episodes from the last N days, ordered by recency';

-- ----------------------------------------------------------------------------
-- PART 4: Get Episode by Date Range
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION get_episode_for_date(
  p_user_id UUID,
  target_date DATE,
  episode_type_filter TEXT DEFAULT 'daily'
)
RETURNS TABLE (
  id UUID,
  episode_type TEXT,
  summary TEXT,
  start_time TIMESTAMPTZ,
  end_time TIMESTAMPTZ,
  topics TEXT[],
  key_events JSONB,
  emotional_arc JSONB
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    e.id,
    e.episode_type,
    e.summary,
    e.start_time,
    e.end_time,
    e.topics,
    e.key_events,
    e.emotional_arc
  FROM maya_episodes e
  WHERE
    e.user_id = p_user_id
    AND e.episode_type = episode_type_filter
    AND DATE(e.start_time) = target_date
  ORDER BY e.start_time DESC
  LIMIT 1;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION get_episode_for_date IS
  'Get episode for a specific date (useful for "what happened yesterday")';

-- ----------------------------------------------------------------------------
-- PART 5: Episode Statistics
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION get_episode_statistics(p_user_id UUID)
RETURNS TABLE (
  total_episodes BIGINT,
  daily_episodes BIGINT,
  session_episodes BIGINT,
  weekly_episodes BIGINT,
  earliest_episode TIMESTAMPTZ,
  latest_episode TIMESTAMPTZ,
  total_conversations BIGINT,
  avg_conversations_per_episode FLOAT,
  unique_topics_count BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*)::BIGINT AS total_episodes,
    COUNT(*) FILTER (WHERE episode_type = 'daily')::BIGINT AS daily_episodes,
    COUNT(*) FILTER (WHERE episode_type = 'session')::BIGINT AS session_episodes,
    COUNT(*) FILTER (WHERE episode_type = 'weekly')::BIGINT AS weekly_episodes,
    MIN(start_time) AS earliest_episode,
    MAX(end_time) AS latest_episode,
    SUM(COALESCE(conversation_count, 0))::BIGINT AS total_conversations,
    AVG(COALESCE(conversation_count, 0))::FLOAT AS avg_conversations_per_episode,
    (
      SELECT COUNT(DISTINCT unnest(topics))::BIGINT
      FROM maya_episodes
      WHERE user_id = p_user_id
    ) AS unique_topics_count
  FROM maya_episodes
  WHERE user_id = p_user_id;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION get_episode_statistics IS
  'Analytics for episode system - tracks coverage and usage';

-- ----------------------------------------------------------------------------
-- PART 6: Row Level Security
-- ----------------------------------------------------------------------------

ALTER TABLE maya_episodes ENABLE ROW LEVEL SECURITY;

-- Service role can access everything
CREATE POLICY "Service role full access episodes" ON maya_episodes
  FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

-- Users can read their own episodes
CREATE POLICY "Users read own episodes" ON maya_episodes
  FOR SELECT USING (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- PART 7: Grant Permissions
-- ----------------------------------------------------------------------------

GRANT EXECUTE ON FUNCTION match_episodes TO service_role;
GRANT EXECUTE ON FUNCTION get_recent_episodes TO service_role;
GRANT EXECUTE ON FUNCTION get_episode_for_date TO service_role;
GRANT EXECUTE ON FUNCTION get_episode_statistics TO service_role;

GRANT EXECUTE ON FUNCTION match_episodes TO authenticated;
GRANT EXECUTE ON FUNCTION get_recent_episodes TO authenticated;
GRANT EXECUTE ON FUNCTION get_episode_for_date TO authenticated;
GRANT EXECUTE ON FUNCTION get_episode_statistics TO authenticated;

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
-- Next Steps:
-- 1. Build EpisodicMemoryService TypeScript class
-- 2. Integrate episode retrieval into maya-core
-- 3. Set up cron scheduler for daily summary generation
-- 4. Test episode generation with real conversation data
-- ============================================================================
