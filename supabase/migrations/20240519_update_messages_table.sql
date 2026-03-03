-- Add metadata column to messages table if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                WHERE table_schema = 'public' 
                AND table_name = 'messages' 
                AND column_name = 'metadata') THEN
    ALTER TABLE public.messages ADD COLUMN metadata JSONB DEFAULT '{}';
  END IF;
END $$;

-- Create index on room_id for faster message lookup if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes 
                WHERE schemaname = 'public' 
                AND tablename = 'messages' 
                AND indexname = 'idx_messages_room_id') THEN
    CREATE INDEX idx_messages_room_id ON public.messages(room_id);
  END IF;
END $$;

-- Create index on created_at for faster message ordering if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes 
                WHERE schemaname = 'public' 
                AND tablename = 'messages' 
                AND indexname = 'idx_messages_created_at') THEN
    CREATE INDEX idx_messages_created_at ON public.messages(created_at DESC);
  END IF;
END $$;

-- Add media_path column to messages if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                WHERE table_schema = 'public' 
                AND table_name = 'messages' 
                AND column_name = 'media_path') THEN
    ALTER TABLE public.messages ADD COLUMN media_path TEXT;
  END IF;
END $$;

-- Make sure we have a storage bucket for chat media
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE name = 'chat-media') THEN
    INSERT INTO storage.buckets (name, public) VALUES ('chat-media', FALSE);
    
    -- Set RLS policy for bucket
    -- Allow read access to media only to those in the conversation
    CREATE POLICY "Media access to conversation participants only" 
    ON storage.objects FOR SELECT
    USING (
      bucket_id = 'chat-media'
      AND EXISTS (
        SELECT 1 FROM public.messages m
        WHERE m.media_path = storage.objects.name
        AND m.user_id = auth.uid()
      )
    );
    
    -- Allow insert only to authenticated users creating their own media
    CREATE POLICY "Users can upload their own media" 
    ON storage.objects FOR INSERT
    WITH CHECK (
      bucket_id = 'chat-media'
      AND (storage.foldername(name))[1] = auth.uid()::text
    );
  END IF;
END $$;

-- Enable storage RLS if not already enabled
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY; 