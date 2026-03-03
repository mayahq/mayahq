-- Create table for custom model configurations
CREATE TABLE IF NOT EXISTS maya_custom_models (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    provider TEXT NOT NULL, -- 'ollama', 'huggingface', 'custom'
    endpoint TEXT,
    api_key TEXT,
    model_path TEXT, -- Local path for Ollama or model name for HF
    huggingface_repo TEXT, -- HuggingFace repository name
    parameters JSONB DEFAULT '{}', -- Model-specific parameters
    capabilities JSONB DEFAULT '{}', -- What the model can do
    is_local BOOLEAN DEFAULT false,
    is_custom BOOLEAN DEFAULT true,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id),
    
    CONSTRAINT unique_model_name UNIQUE(name),
    CONSTRAINT valid_provider CHECK (provider IN ('ollama', 'huggingface', 'custom', 'openai', 'anthropic'))
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_maya_custom_models_provider ON maya_custom_models(provider);
CREATE INDEX IF NOT EXISTS idx_maya_custom_models_active ON maya_custom_models(is_active);
CREATE INDEX IF NOT EXISTS idx_maya_custom_models_local ON maya_custom_models(is_local);

-- Create trigger for updated_at
CREATE OR REPLACE FUNCTION update_maya_custom_models_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_maya_custom_models_updated_at
    BEFORE UPDATE ON maya_custom_models
    FOR EACH ROW
    EXECUTE FUNCTION update_maya_custom_models_updated_at();

-- Insert some default model configurations
INSERT INTO maya_custom_models (name, description, provider, model_path, is_local, parameters, capabilities) VALUES
    ('Llama 2 7B', 'Meta Llama 2 7B parameter model for general conversation', 'ollama', 'llama2:7b', true, 
     '{"temperature": 0.7, "maxTokens": 2048}', 
     '{"chat": true, "completion": true, "vision": false}'),
    
    ('Code Llama', 'Specialized model for code generation and programming tasks', 'ollama', 'codellama:7b', true,
     '{"temperature": 0.3, "maxTokens": 4096}',
     '{"chat": true, "completion": true, "vision": false, "function_calling": false}'),
    
    ('Mistral 7B', 'Mistral 7B Instruct model for general tasks', 'ollama', 'mistral:7b', true,
     '{"temperature": 0.7, "maxTokens": 2048}',
     '{"chat": true, "completion": true, "vision": false}'),
    
    ('Phi-3 Mini', 'Microsoft Phi-3 Mini model for lightweight tasks', 'ollama', 'phi3:mini', true,
     '{"temperature": 0.7, "maxTokens": 1024}',
     '{"chat": true, "completion": true, "vision": false}'),
    
    ('Mixtral 8x7B', 'Mixtral 8x7B Mixture of Experts model', 'huggingface', 'mistralai/Mixtral-8x7B-Instruct-v0.1', false,
     '{"temperature": 0.7, "maxTokens": 2048}',
     '{"chat": true, "completion": true, "vision": false}'),
     
    ('Zephyr 7B', 'HuggingFace Zephyr 7B Beta chat model', 'huggingface', 'HuggingFaceH4/zephyr-7b-beta', false,
     '{"temperature": 0.7, "maxTokens": 2048}',
     '{"chat": true, "completion": true, "vision": false}')

ON CONFLICT (name) DO NOTHING;

-- Create table for model usage statistics
CREATE TABLE IF NOT EXISTS maya_model_usage (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    model_id UUID REFERENCES maya_custom_models(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id),
    tokens_used INTEGER DEFAULT 0,
    response_time_ms INTEGER,
    success BOOLEAN DEFAULT true,
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for usage analytics
CREATE INDEX IF NOT EXISTS idx_maya_model_usage_model_date ON maya_model_usage(model_id, created_at);
CREATE INDEX IF NOT EXISTS idx_maya_model_usage_user_date ON maya_model_usage(user_id, created_at);