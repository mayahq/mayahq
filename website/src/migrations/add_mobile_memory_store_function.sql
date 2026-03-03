-- Create a PostgreSQL function to store mobile memories with fallback logic
-- This can be called via RPC when other methods fail
CREATE OR REPLACE FUNCTION store_mobile_memory(
  p_content TEXT,
  p_user_id TEXT,
  p_user_name TEXT DEFAULT 'User',
  p_tags TEXT[] DEFAULT '{}'::TEXT[]
) RETURNS BIGINT AS $$
DECLARE
  new_memory_id BIGINT;
BEGIN
  -- Insert with minimal required fields
  INSERT INTO maya_memories (
    content, 
    metadata, 
    created_at
  ) VALUES (
    p_content,
    jsonb_build_object(
      'userId', p_user_id,
      'userName', p_user_name,
      'timestamp', now(),
      'type', 'conversation',
      'platform', 'mobile-rpc'
    ),
    now()
  ) RETURNING id INTO new_memory_id;
  
  -- Update tags in a separate step if provided
  IF array_length(p_tags, 1) > 0 THEN
    UPDATE maya_memories
    SET tags = p_tags
    WHERE id = new_memory_id;
  END IF;
  
  -- Log success in a table for debugging
  BEGIN
    INSERT INTO system_logs (
      event_type,
      message,
      metadata
    ) VALUES (
      'memory_store',
      'Successfully stored mobile memory via RPC',
      jsonb_build_object(
        'memory_id', new_memory_id,
        'user_id', p_user_id,
        'tag_count', array_length(p_tags, 1)
      )
    );
  EXCEPTION WHEN OTHERS THEN
    -- If logging fails, continue anyway
    NULL;
  END;
  
  RETURN new_memory_id;
EXCEPTION WHEN OTHERS THEN
  -- Log failure and re-raise the exception
  BEGIN
    INSERT INTO system_logs (
      event_type,
      message,
      metadata
    ) VALUES (
      'memory_store_error',
      'Failed to store mobile memory via RPC: ' || SQLERRM,
      jsonb_build_object(
        'user_id', p_user_id,
        'error', SQLERRM,
        'hint', 'Check maya_memories table structure and permissions'
      )
    );
  EXCEPTION WHEN OTHERS THEN
    -- If logging fails, continue anyway
    NULL;
  END;
  
  RAISE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add system_logs table if it doesn't exist for debugging
CREATE TABLE IF NOT EXISTS system_logs (
  id SERIAL PRIMARY KEY,
  event_type TEXT NOT NULL,
  message TEXT NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Make sure system_logs has an index for faster searching
CREATE INDEX IF NOT EXISTS system_logs_event_type_idx ON system_logs(event_type);
CREATE INDEX IF NOT EXISTS system_logs_created_at_idx ON system_logs(created_at);

-- Grant permissions necessary for the API to use this function
GRANT EXECUTE ON FUNCTION store_mobile_memory TO service_role;
GRANT EXECUTE ON FUNCTION store_mobile_memory TO authenticated; 