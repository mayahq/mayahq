import { NextResponse } from 'next/server';
import { Maya } from '@/lib/maya-agent';
import { testGetAllFacts } from '@/lib/facts';

// Mark this route as dynamic to prevent static pre-rendering issues
export const dynamic = 'force-dynamic';

// Environment variables
const openAIApiKey = process.env.OPENAI_API_KEY || '';
const cohereApiKey = process.env.COHERE_API_KEY || '';
const anthropicApiKey = process.env.ANTHROPIC_API_KEY || '';
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const temperature = parseFloat(process.env.MODEL_TEMPERATURE || '0.7');
const modelName = process.env.OPENAI_MODEL || 'gpt-4';
const anthropicModel = process.env.ANTHROPIC_MODEL || 'claude-opus-4-20250514';
const ollamaBaseUrl = process.env.OLLAMA_BASE_URL || '';
const ollamaModel = process.env.OLLAMA_MODEL || 'mistral';
const primaryProvider = process.env.PRIMARY_PROVIDER || 'anthropic';
const embeddingProviderChoice = process.env.EMBEDDING_PROVIDER || 'cohere';
const fallbackStrategy = process.env.FALLBACK_STRATEGY || 'downgrade';
const maxMemories = parseInt(process.env.MAX_MEMORIES || '5');
const maxRetries = parseInt(process.env.MAX_RETRIES || '3');
const useExponentialBackoff = process.env.USE_EXPONENTIAL_BACKOFF !== 'false';
const trackPerformance = process.env.TRACK_PERFORMANCE !== 'false';
const windowSize = parseInt(process.env.WINDOW_SIZE || '5');
const enableMemory = process.env.ENABLE_MEMORY !== 'false';

// Initialize Maya agent with configuration
let maya: Maya | null = null;

// Lazy initialize the Maya agent
function getMayaAgent() {
    if (!maya) {
        try {
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
                enableMemory: enableMemory
            });
        } catch (error) {
            console.error('Failed to initialize Maya agent:', error);
            throw error;
        }
    }
    return maya;
}

export async function GET(req: Request) {
    try {
        // Get the URL parameters
        const url = new URL(req.url);
        const userId = url.searchParams.get('userId') || 'admin-user-4c850152'; // Default user ID

        console.log(`Debug facts retrieval for user: ${userId}`);
        
        // First, get all facts directly
        const allFacts = await testGetAllFacts(userId);
        
        // Then use the Maya agent to run debugging
        const agent = getMayaAgent();
        const debugResult = await agent.debugFactRetrieval(userId);
        
        // Return the results
        return NextResponse.json({
            success: true,
            userId,
            factCount: allFacts.length,
            retrievedFacts: debugResult.length,
            allFacts,
            debugResult
        });
    } catch (error) {
        console.error('Error in debug endpoint:', error);
        return NextResponse.json(
            { error: 'Failed to debug facts retrieval', message: error instanceof Error ? error.message : String(error) },
            { status: 500 }
        );
    }
} 