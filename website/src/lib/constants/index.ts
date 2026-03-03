// LLM Provider options
export const LLMProvider = {
    OPENAI: 'openai',
    ANTHROPIC: 'anthropic',
    OLLAMA: 'ollama',
    XAI: 'xai'
};

// Add Embedding Provider options
export const EmbeddingProvider = {
    OPENAI: 'openai',
    COHERE: 'cohere'
};

// Fallback strategies
export const FallbackStrategy = {
    DOWNGRADE: 'downgrade',
    RETRY: 'retry',
    FAIL: 'fail'
}; 