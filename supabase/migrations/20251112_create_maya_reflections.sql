-- ============================================================================
-- MAYA MEMORY SYSTEM 2.0: SELF-REFLECTION AGENT (PHASE 3)
-- ============================================================================
-- This migration implements metacognition - Maya reviewing her own performance,
-- identifying patterns, learning from mistakes, and continuously improving.
--
-- Based on ChatGPT's recommendation for self-reflection and meta-awareness
-- Date: 2025-11-12
-- ============================================================================

-- ----------------------------------------------------------------------------
-- PART 1: Create Reflections Table
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS maya_reflections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Reflection metadata
  reflection_type TEXT NOT NULL CHECK (reflection_type IN ('daily', 'weekly', 'incident')),
  reflection_date DATE NOT NULL,

  -- Self-assessment content
  self_critique TEXT NOT NULL,

  -- Analysis results
  patterns_identified JSONB DEFAULT '[]'::jsonb,
  mistakes_noted JSONB DEFAULT '[]'::jsonb,
  improvements JSONB DEFAULT '[]'::jsonb,
  strengths_noted JSONB DEFAULT '[]'::jsonb,

  -- Performance metrics
  response_quality_score REAL,
  personality_consistency_score REAL,
  continuity_score REAL,
  emotional_intelligence_score REAL,

  -- Links to source data
  episode_ids UUID[] DEFAULT '{}',
  thought_ids UUID[] DEFAULT '{}',
  conversation_count INTEGER DEFAULT 0,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- Ensure one reflection per user per day per type
  UNIQUE(user_id, reflection_date, reflection_type)
);

-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_maya_reflections_user_date
  ON maya_reflections(user_id, reflection_date DESC);

CREATE INDEX IF NOT EXISTS idx_maya_reflections_type
  ON maya_reflections(user_id, reflection_type, reflection_date DESC);

-- Add comments
COMMENT ON TABLE maya_reflections IS
  'Self-reflection metadata - Maya reviewing her own performance and identifying improvement areas';

COMMENT ON COLUMN maya_reflections.self_critique IS
  'LLM-generated self-assessment in Maya''s voice, analyzing her day';

COMMENT ON COLUMN maya_reflections.patterns_identified IS
  'Array of patterns noticed: [{pattern, frequency, context, is_positive}, ...]';

COMMENT ON COLUMN maya_reflections.mistakes_noted IS
  'Array of mistakes/errors: [{mistake, impact, correction, timestamp}, ...]';

COMMENT ON COLUMN maya_reflections.improvements IS
  'Array of improvement suggestions: [{area, suggestion, priority, actionable}, ...]';

COMMENT ON COLUMN maya_reflections.strengths_noted IS
  'Array of positive behaviors to reinforce: [{strength, context, impact}, ...]';

-- ----------------------------------------------------------------------------
-- PART 2: Get Recent Reflections
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION get_recent_reflections(
  p_user_id UUID,
  days_back INTEGER DEFAULT 7,
  reflection_type_filter TEXT DEFAULT NULL,
  max_results INTEGER DEFAULT 5
)
RETURNS TABLE (
  id UUID,
  reflection_type TEXT,
  reflection_date DATE,
  self_critique TEXT,
  patterns_identified JSONB,
  mistakes_noted JSONB,
  improvements JSONB,
  strengths_noted JSONB,
  response_quality_score REAL,
  days_ago INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    r.id,
    r.reflection_type,
    r.reflection_date,
    r.self_critique,
    r.patterns_identified,
    r.mistakes_noted,
    r.improvements,
    r.strengths_noted,
    r.response_quality_score,
    (CURRENT_DATE - r.reflection_date)::INTEGER AS days_ago
  FROM maya_reflections r
  WHERE
    r.user_id = p_user_id
    AND r.reflection_date >= CURRENT_DATE - days_back
    AND (reflection_type_filter IS NULL OR r.reflection_type = reflection_type_filter)
  ORDER BY r.reflection_date DESC
  LIMIT max_results;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION get_recent_reflections IS
  'Retrieve Maya''s recent self-reflections for context';

-- ----------------------------------------------------------------------------
-- PART 3: Get Reflection for Specific Date
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION get_reflection_for_date(
  p_user_id UUID,
  target_date DATE,
  reflection_type_filter TEXT DEFAULT 'daily'
)
RETURNS TABLE (
  id UUID,
  reflection_type TEXT,
  self_critique TEXT,
  patterns_identified JSONB,
  mistakes_noted JSONB,
  improvements JSONB,
  strengths_noted JSONB
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    r.id,
    r.reflection_type,
    r.self_critique,
    r.patterns_identified,
    r.mistakes_noted,
    r.improvements,
    r.strengths_noted
  FROM maya_reflections r
  WHERE
    r.user_id = p_user_id
    AND r.reflection_type = reflection_type_filter
    AND r.reflection_date = target_date
  ORDER BY r.created_at DESC
  LIMIT 1;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION get_reflection_for_date IS
  'Get Maya''s self-reflection for a specific date';

-- ----------------------------------------------------------------------------
-- PART 4: Reflection Statistics
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION get_reflection_statistics(p_user_id UUID)
RETURNS TABLE (
  total_reflections BIGINT,
  daily_reflections BIGINT,
  incident_reflections BIGINT,
  avg_quality_score FLOAT,
  avg_consistency_score FLOAT,
  total_patterns_identified BIGINT,
  total_mistakes_noted BIGINT,
  total_improvements_suggested BIGINT,
  earliest_reflection DATE,
  latest_reflection DATE
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*)::BIGINT AS total_reflections,
    COUNT(*) FILTER (WHERE reflection_type = 'daily')::BIGINT AS daily_reflections,
    COUNT(*) FILTER (WHERE reflection_type = 'incident')::BIGINT AS incident_reflections,
    AVG(response_quality_score)::FLOAT AS avg_quality_score,
    AVG(personality_consistency_score)::FLOAT AS avg_consistency_score,
    (
      SELECT COUNT(*)::BIGINT
      FROM maya_reflections,
      LATERAL jsonb_array_elements(patterns_identified)
      WHERE user_id = p_user_id
    ) AS total_patterns_identified,
    (
      SELECT COUNT(*)::BIGINT
      FROM maya_reflections,
      LATERAL jsonb_array_elements(mistakes_noted)
      WHERE user_id = p_user_id
    ) AS total_mistakes_noted,
    (
      SELECT COUNT(*)::BIGINT
      FROM maya_reflections,
      LATERAL jsonb_array_elements(improvements)
      WHERE user_id = p_user_id
    ) AS total_improvements_suggested,
    MIN(reflection_date) AS earliest_reflection,
    MAX(reflection_date) AS latest_reflection
  FROM maya_reflections
  WHERE user_id = p_user_id;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION get_reflection_statistics IS
  'Analytics for self-reflection system - tracks Maya''s self-awareness growth';

-- ----------------------------------------------------------------------------
-- PART 5: Row Level Security
-- ----------------------------------------------------------------------------

ALTER TABLE maya_reflections ENABLE ROW LEVEL SECURITY;

-- Service role can access everything
CREATE POLICY "Service role full access reflections" ON maya_reflections
  FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

-- Users can read their own reflections
CREATE POLICY "Users read own reflections" ON maya_reflections
  FOR SELECT USING (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- PART 6: Grant Permissions
-- ----------------------------------------------------------------------------

GRANT EXECUTE ON FUNCTION get_recent_reflections TO service_role;
GRANT EXECUTE ON FUNCTION get_reflection_for_date TO service_role;
GRANT EXECUTE ON FUNCTION get_reflection_statistics TO service_role;

GRANT EXECUTE ON FUNCTION get_recent_reflections TO authenticated;
GRANT EXECUTE ON FUNCTION get_reflection_for_date TO authenticated;
GRANT EXECUTE ON FUNCTION get_reflection_statistics TO authenticated;

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
-- Next Steps:
-- 1. Build SelfReflectionService TypeScript class
-- 2. Integrate reflection retrieval into maya-core
-- 3. Set up daily reflection generation (can run with episode generation)
-- 4. Test reflection generation with real conversation data
-- ============================================================================
