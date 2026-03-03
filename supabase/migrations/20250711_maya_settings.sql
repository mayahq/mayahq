-- Create maya_settings table for storing configuration values
CREATE TABLE IF NOT EXISTS maya_settings (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    key TEXT UNIQUE NOT NULL,
    value JSONB NOT NULL,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index on key for faster lookups
CREATE INDEX IF NOT EXISTS idx_maya_settings_key ON maya_settings(key);

-- Insert default LLM provider settings
INSERT INTO maya_settings (key, value, description) VALUES
    ('active_llm_provider', '"anthropic"', 'The currently active LLM provider'),
    ('anthropic_model', '"claude-opus-4-20250514"', 'The Anthropic model to use'),
    ('xai_model', '"grok-4-0709"', 'The xAI Grok model to use'),
    ('openai_model', '"gpt-4"', 'The OpenAI model to use')
ON CONFLICT (key) DO NOTHING;

-- Create trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_maya_settings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_maya_settings_updated_at
    BEFORE UPDATE ON maya_settings
    FOR EACH ROW
    EXECUTE FUNCTION update_maya_settings_updated_at();