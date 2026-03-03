-- Maya HQ Cron Logging Schema
-- Run this in Supabase SQL Editor

-- Table: cron_jobs
-- Stores metadata about each cron job
CREATE TABLE IF NOT EXISTS public.cron_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- OpenClaw cron job ID (from jobs.json)
  openclaw_id TEXT UNIQUE NOT NULL,

  -- Job metadata
  name TEXT NOT NULL,
  schedule TEXT, -- cron expression or "at" timestamp
  enabled BOOLEAN DEFAULT true,

  -- Categorization
  category TEXT, -- 'maya-personal', 'lvn-social', 'lvn-sdr', 'content', etc.
  platform TEXT, -- 'instagram', 'facebook', 'linkedin', 'x', 'telegram', null

  -- Routing
  discord_channel_id TEXT,
  discord_channel_name TEXT,

  -- Tracking
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  last_synced_at TIMESTAMPTZ, -- last time we synced from jobs.json

  -- Metadata
  notes TEXT,
  payload JSONB -- store full payload for reference
);

-- Table: cron_executions
-- Logs every cron run
CREATE TABLE IF NOT EXISTS public.cron_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Link to cron job
  cron_job_id UUID REFERENCES public.cron_jobs(id) ON DELETE CASCADE,
  openclaw_id TEXT, -- denormalized for quick queries

  -- Execution details
  started_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ,
  duration_ms INTEGER,

  -- Status
  status TEXT NOT NULL, -- 'running', 'success', 'error', 'timeout'

  -- Output
  summary TEXT, -- short description of what happened
  output JSONB, -- structured output (e.g., {posted_url: "...", media_id: "..."})
  error_message TEXT,

  -- Context
  triggered_by TEXT DEFAULT 'schedule', -- 'schedule', 'manual', 'retry'
  session_id TEXT, -- OpenClaw session ID if available

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_cron_jobs_openclaw_id ON public.cron_jobs(openclaw_id);
CREATE INDEX IF NOT EXISTS idx_cron_jobs_category ON public.cron_jobs(category);
CREATE INDEX IF NOT EXISTS idx_cron_jobs_enabled ON public.cron_jobs(enabled);

CREATE INDEX IF NOT EXISTS idx_cron_executions_cron_job_id ON public.cron_executions(cron_job_id);
CREATE INDEX IF NOT EXISTS idx_cron_executions_started_at ON public.cron_executions(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_cron_executions_status ON public.cron_executions(status);

-- View: Recent cron activity (for dashboard)
CREATE OR REPLACE VIEW public.cron_activity AS
SELECT
  j.id as cron_job_id,
  j.name,
  j.category,
  j.platform,
  j.enabled,
  j.discord_channel_name,
  e.id as execution_id,
  e.started_at,
  e.completed_at,
  e.duration_ms,
  e.status,
  e.summary,
  e.error_message
FROM public.cron_jobs j
LEFT JOIN LATERAL (
  SELECT * FROM public.cron_executions
  WHERE cron_job_id = j.id
  ORDER BY started_at DESC
  LIMIT 5
) e ON true
ORDER BY e.started_at DESC NULLS LAST;

-- Enable RLS (Row Level Security) if needed
ALTER TABLE public.cron_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cron_executions ENABLE ROW LEVEL SECURITY;

-- Policy: Allow service role full access
CREATE POLICY "Service role has full access to cron_jobs"
  ON public.cron_jobs
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role has full access to cron_executions"
  ON public.cron_executions
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Policy: Allow authenticated users read access
CREATE POLICY "Authenticated users can read cron_jobs"
  ON public.cron_jobs
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can read cron_executions"
  ON public.cron_executions
  FOR SELECT
  TO authenticated
  USING (true);

COMMENT ON TABLE public.cron_jobs IS 'Metadata about OpenClaw cron jobs - synced from jobs.json';
COMMENT ON TABLE public.cron_executions IS 'Execution logs for cron jobs - written by cron payloads';
COMMENT ON VIEW public.cron_activity IS 'Recent cron executions joined with job metadata - for dashboard';
