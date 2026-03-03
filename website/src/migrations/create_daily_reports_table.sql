-- Create the daily_reports table for storing personalized daily reports
CREATE TABLE IF NOT EXISTS daily_reports (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  content TEXT NOT NULL,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  read_at TIMESTAMPTZ,
  source TEXT DEFAULT 'scheduled',  -- 'scheduled', 'manual', etc.
  metadata JSONB DEFAULT '{}'::jsonb,
  tags TEXT[] DEFAULT '{}'::text[]
);

-- Add indexes for faster queries
CREATE INDEX IF NOT EXISTS daily_reports_user_id_idx ON daily_reports(user_id);
CREATE INDEX IF NOT EXISTS daily_reports_generated_at_idx ON daily_reports(generated_at);

-- Add comment explaining the table
COMMENT ON TABLE daily_reports IS 'Stores personalized daily reports with task summaries and insights'; 