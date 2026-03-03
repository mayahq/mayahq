-- Enable Row Level Security
ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- Rooms policies
CREATE POLICY "Users can view their own rooms"
ON public.rooms FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own rooms"
ON public.rooms FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own rooms"
ON public.rooms FOR UPDATE
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own rooms"
ON public.rooms FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

-- Messages policies
CREATE POLICY "Users can view messages in their rooms"
ON public.messages FOR SELECT
TO authenticated
USING (
  auth.uid() = user_id OR 
  EXISTS (
    SELECT 1 FROM public.rooms WHERE id = room_id AND user_id = auth.uid()
  )
);

CREATE POLICY "Users can insert messages in their rooms"
ON public.messages FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = user_id OR 
  EXISTS (
    SELECT 1 FROM public.rooms WHERE id = room_id AND user_id = auth.uid()
  )
);

CREATE POLICY "Users can update their own messages"
ON public.messages FOR UPDATE
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete messages in their rooms"
ON public.messages FOR DELETE
TO authenticated
USING (
  auth.uid() = user_id OR 
  EXISTS (
    SELECT 1 FROM public.rooms WHERE id = room_id AND user_id = auth.uid()
  )
);

-- Allow service role to bypass RLS
ALTER TABLE public.rooms FORCE ROW LEVEL SECURITY;
ALTER TABLE public.messages FORCE ROW LEVEL SECURITY; 