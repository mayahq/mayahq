-- Setup pg_cron job to run working memory decay daily
-- This keeps the working memory fresh by decaying old entities

-- Enable pg_cron extension if not already enabled
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Remove existing job if it exists (for re-running migration)
SELECT cron.unschedule('working-memory-decay')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'working-memory-decay'
);

-- Schedule working memory decay to run daily at 3 AM UTC
-- This will recalculate importance scores and prune old entries
SELECT cron.schedule(
  'working-memory-decay',           -- Job name
  '0 3 * * *',                       -- Cron expression: 3 AM UTC daily
  $$SELECT decay_working_memory()$$  -- SQL to execute
);

COMMENT ON EXTENSION pg_cron IS 'Job scheduler for PostgreSQL - used for working memory decay';
