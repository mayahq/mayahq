import { Maya, LLMProvider, EmbeddingProvider } from './maya-agent';
import { loadTags } from './memoryUtils';

// Environment variables
const openAIApiKey = process.env.OPENAI_API_KEY || '';
const anthropicApiKey = process.env.ANTHROPIC_API_KEY || '';
const cohereApiKey = process.env.COHERE_API_KEY || '';
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const modelName = process.env.OPENAI_MODEL || 'gpt-4';
const anthropicModel = process.env.ANTHROPIC_MODEL || 'claude-opus-4-20250514';
const ollamaBaseUrl = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
const ollamaModel = process.env.OLLAMA_MODEL || 'mistral';
const primaryProvider = process.env.PRIMARY_LLM_PROVIDER || LLMProvider.OLLAMA;
const fallbackStrategy = process.env.FALLBACK_STRATEGY || 'downgrade';
const xaiApiKey = process.env.XAI_API_KEY || '';

// Configuration
const embeddingProviderChoice = EmbeddingProvider.COHERE;
const requiredEmbeddingKey = embeddingProviderChoice === EmbeddingProvider.COHERE ? cohereApiKey : openAIApiKey;
const enableMemoryConfig = process.env.ENABLE_MEMORY !== 'false';
const enableMemory = enableMemoryConfig && Boolean(requiredEmbeddingKey);

const maxMemories = parseInt(process.env.MAX_MEMORIES || '5', 10);
const windowSize = parseInt(process.env.WINDOW_SIZE || '5', 10);
const temperature = parseFloat(process.env.TEMPERATURE || '0.7');
const maxRetries = parseInt(process.env.MAX_RETRIES || '3', 10);
const useExponentialBackoff = process.env.USE_EXPONENTIAL_BACKOFF !== 'false';
const trackPerformance = process.env.TRACK_PERFORMANCE !== 'false';

// Singleton instance
let maya: Maya | null = null;

// Validate required environment variables
function validateConfig() {
    if (!anthropicApiKey) {
        throw new Error('Anthropic API Key missing (required for chat functionality)');
    }
    if (!supabaseUrl || !supabaseKey) {
        throw new Error('Supabase configuration missing');
    }
    if (primaryProvider === 'XAI' && !xaiApiKey) {
        throw new Error('XAI API Key missing (required for xAI Grok Vision)');
    }
}

// Get or create Maya agent
export function getMayaAgent(): Maya {
    if (!maya) {
        try {
            validateConfig();

            // Load tag definitions from Supabase at startup
            loadTags().catch((err) => console.error('[maya-config] Failed to load tags at startup:', err));
            // Optionally refresh every 5 minutes
            setInterval(() => {
                loadTags().catch((err) => console.error('[maya-config] Failed to refresh tags:', err));
            }, 5 * 60 * 1000);
            
            maya = new Maya({
                openAIApiKey: openAIApiKey || undefined,
                anthropicApiKey,
                cohereApiKey: cohereApiKey || undefined,
                supabaseUrl,
                supabaseKey,
                temperature,
                modelName,
                anthropicModel,
                ollamaBaseUrl,
                ollamaModel,
                primaryProvider,
                embeddingProvider: embeddingProviderChoice,
                fallbackStrategy: (openAIApiKey || anthropicApiKey) ? fallbackStrategy : 'fail',
                maxMemories,
                maxRetries,
                useExponentialBackoff,
                trackPerformance,
                windowSize,
                enableMemory: enableMemory,
                xaiApiKey: xaiApiKey || undefined
            });

            console.log(`Maya agent initialized with ${primaryProvider} as primary, ${embeddingProviderChoice} embeddings (memory: ${enableMemory ? 'enabled' : 'disabled'}, fallback: ${(openAIApiKey || anthropicApiKey) ? fallbackStrategy : 'disabled'})`);
        } catch (error) {
            console.error('Failed to initialize Maya agent:', error);
            throw error;
        }
    }
    return maya;
} 