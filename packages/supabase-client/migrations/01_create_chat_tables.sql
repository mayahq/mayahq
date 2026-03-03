-- Create chat tables if they don't exist

-- Rooms table
CREATE TABLE IF NOT EXISTS public.rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_message_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Messages table
CREATE TABLE IF NOT EXISTS public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  metadata JSONB
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_messages_room_id ON public.messages(room_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON public.messages(created_at);
CREATE INDEX IF NOT EXISTS idx_rooms_user_id ON public.rooms(user_id);
CREATE INDEX IF NOT EXISTS idx_rooms_last_message_at ON public.rooms(last_message_at);

-- Storage policies
-- This will be run in the Supabase dashboard or using the Supabase CLI
DO $$
BEGIN
  -- Create chat-media bucket if it doesn't exist
  BEGIN
    INSERT INTO storage.buckets (id, name)
    VALUES ('chat-media', 'chat-media');
  EXCEPTION
    WHEN unique_violation THEN
      -- Bucket already exists, ignore
  END;
  
  -- Storage policy for reading chat media
  IF NOT EXISTS (
    SELECT 1 FROM storage.policies 
    WHERE name = 'Chat media read access' AND bucket_id = 'chat-media'
  ) THEN
    CREATE POLICY "Chat media read access" 
    ON storage.objects FOR SELECT
    USING (
      bucket_id = 'chat-media' AND 
      auth.uid() = (storage.foldername(name))[1]::uuid
    );
  END IF;
  
  -- Storage policy for inserting chat media
  IF NOT EXISTS (
    SELECT 1 FROM storage.policies 
    WHERE name = 'Chat media insert access' AND bucket_id = 'chat-media'
  ) THEN
    CREATE POLICY "Chat media insert access" 
    ON storage.objects FOR INSERT
    WITH CHECK (
      bucket_id = 'chat-media' AND 
      auth.uid() = (storage.foldername(name))[1]::uuid
    );
  END IF;
  
  -- Storage policy for updating chat media
  IF NOT EXISTS (
    SELECT 1 FROM storage.policies 
    WHERE name = 'Chat media update access' AND bucket_id = 'chat-media'
  ) THEN
    CREATE POLICY "Chat media update access" 
    ON storage.objects FOR UPDATE
    USING (
      bucket_id = 'chat-media' AND 
      auth.uid() = (storage.foldername(name))[1]::uuid
    );
  END IF;
  
  -- Storage policy for deleting chat media
  IF NOT EXISTS (
    SELECT 1 FROM storage.policies 
    WHERE name = 'Chat media delete access' AND bucket_id = 'chat-media'
  ) THEN
    CREATE POLICY "Chat media delete access" 
    ON storage.objects FOR DELETE
    USING (
      bucket_id = 'chat-media' AND 
      auth.uid() = (storage.foldername(name))[1]::uuid
    );
  END IF;
END $$; 