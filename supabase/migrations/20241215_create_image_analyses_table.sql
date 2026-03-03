-- Create image_analyses table for storing AI-powered image analysis results
CREATE TABLE IF NOT EXISTS public.image_analyses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  analysis_type TEXT NOT NULL DEFAULT 'prompt-generation',
  analysis_result TEXT NOT NULL,
  image_url TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_image_analyses_user_id ON public.image_analyses(user_id);
CREATE INDEX IF NOT EXISTS idx_image_analyses_created_at ON public.image_analyses(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_image_analyses_type ON public.image_analyses(analysis_type);

-- Enable Row Level Security
ALTER TABLE public.image_analyses ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Users can only read their own image analyses
CREATE POLICY "Users can view their own image analyses" 
ON public.image_analyses FOR SELECT
USING (auth.uid() = user_id);

-- Users can only insert their own image analyses
CREATE POLICY "Users can create their own image analyses" 
ON public.image_analyses FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Users can update their own image analyses
CREATE POLICY "Users can update their own image analyses" 
ON public.image_analyses FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Users can delete their own image analyses
CREATE POLICY "Users can delete their own image analyses" 
ON public.image_analyses FOR DELETE
USING (auth.uid() = user_id);

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language plpgsql;

CREATE TRIGGER update_image_analyses_updated_at
BEFORE UPDATE ON public.image_analyses
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column(); 