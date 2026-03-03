-- Create web search cache table
CREATE TABLE IF NOT EXISTS web_search_cache (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    cache_key TEXT NOT NULL,
    query TEXT NOT NULL,
    search_type TEXT NOT NULL DEFAULT 'general',
    results JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for efficient cache lookups
CREATE INDEX IF NOT EXISTS idx_web_search_cache_key ON web_search_cache (cache_key);
CREATE INDEX IF NOT EXISTS idx_web_search_cache_created ON web_search_cache (created_at);

-- Create web search logs table for analytics
CREATE TABLE IF NOT EXISTS web_search_logs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL,
    query TEXT NOT NULL,
    result_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for analytics queries
CREATE INDEX IF NOT EXISTS idx_web_search_logs_user ON web_search_logs (user_id);
CREATE INDEX IF NOT EXISTS idx_web_search_logs_created ON web_search_logs (created_at);

-- Add a cleanup policy to remove old cache entries (older than 7 days)
-- This can be run periodically via a cron job or scheduled function
CREATE OR REPLACE FUNCTION cleanup_old_search_cache()
RETURNS void AS $$
BEGIN
    DELETE FROM web_search_cache 
    WHERE created_at < NOW() - INTERVAL '7 days';
    
    DELETE FROM web_search_logs 
    WHERE created_at < NOW() - INTERVAL '30 days';
END;
$$ LANGUAGE plpgsql; 