-- Fix for maya_memories table to make vector embeddings optional
-- This allows storing memories from mobile without requiring embeddings

-- First check if the embedding column exists and is not nullable
DO $$
DECLARE
    embedding_nullable text;
BEGIN
    SELECT is_nullable 
    INTO embedding_nullable
    FROM information_schema.columns 
    WHERE table_name = 'maya_memories' 
    AND column_name = 'embedding';

    IF embedding_nullable = 'NO' THEN
        -- If the column exists but doesn't allow nulls, alter it
        EXECUTE 'ALTER TABLE maya_memories ALTER COLUMN embedding DROP NOT NULL;';
        RAISE NOTICE 'Modified embedding column to allow NULL values';
    ELSIF embedding_nullable IS NULL THEN
        -- If the column doesn't exist at all, create it
        EXECUTE 'ALTER TABLE maya_memories ADD COLUMN embedding vector;';
        RAISE NOTICE 'Added embedding column as nullable vector';
    ELSE
        RAISE NOTICE 'Embedding column already allows NULL values, no changes needed';
    END IF;
END $$;

-- Create index on maya_memories.metadata->>userId for faster queries
DO $$
BEGIN
    -- Check if the index already exists
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes 
        WHERE indexname = 'maya_memories_user_id_idx'
    ) THEN
        -- Create a GIN index on the userId in the metadata JSONB
        EXECUTE 'CREATE INDEX maya_memories_user_id_idx ON maya_memories USING GIN ((metadata->''userId''));';
        RAISE NOTICE 'Created index on maya_memories.metadata->userId';
    ELSE
        RAISE NOTICE 'Index on metadata->userId already exists';
    END IF;
END $$;

-- Add trigger to handle automatic tagging for imported mobile memories
CREATE OR REPLACE FUNCTION tag_mobile_memory() RETURNS TRIGGER AS $$
BEGIN
    -- Only tag memories that don't already have tags
    IF NEW.tags IS NULL OR array_length(NEW.tags, 1) IS NULL THEN
        -- Check if the memory came from mobile
        IF NEW.metadata->>'platform' LIKE 'mobile%' THEN
            -- Call the tag_message function to get tags
            NEW.tags := (SELECT tag_message(NEW.content));
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create the trigger if it doesn't exist
DO $$
BEGIN
    -- Drop existing trigger if it exists
    DROP TRIGGER IF EXISTS tag_mobile_memory_trigger ON maya_memories;
    
    -- Create the trigger
    CREATE TRIGGER tag_mobile_memory_trigger
    BEFORE INSERT ON maya_memories
    FOR EACH ROW
    EXECUTE FUNCTION tag_mobile_memory();
    
    RAISE NOTICE 'Created trigger for automatic tagging of mobile memories';
END $$;

-- Add migration record
INSERT INTO migrations (name, applied_at)
VALUES ('fix_maya_memories_embedding_column', NOW())
ON CONFLICT (name) DO NOTHING; 