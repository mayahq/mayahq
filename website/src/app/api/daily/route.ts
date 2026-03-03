import { NextResponse } from 'next/server'
import { Maya, EmbeddingProvider } from '@/lib/maya-agent'
import { createClient } from '@supabase/supabase-js'

// Get environment variables with type checking
const openAIApiKey = process.env.OPENAI_API_KEY || '';
const anthropicApiKey = process.env.ANTHROPIC_API_KEY || '';
const cohereApiKey = process.env.COHERE_API_KEY || '';
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const modelName = process.env.OPENAI_MODEL || 'gpt-4';
const anthropicModel = process.env.ANTHROPIC_MODEL || 'claude-opus-4-20250514';

// Get Supabase client only if URL and key are available
const getSupabaseClient = () => {
  if (!supabaseUrl || !supabaseKey) {
    console.log('Supabase configuration missing');
    return null;
  }
  
  return createClient(supabaseUrl, supabaseKey);
};

// Validate required environment variables
if (!cohereApiKey) {
    console.error('Cohere API Key missing (required for embeddings)');
}

if (!supabaseUrl || !supabaseKey) {
    console.error('Supabase configuration missing');
}

// Define the shape of memory records
interface Memory {
    content: string | { input?: string; response?: string; } | any;
    metadata: any;
    created_at: string;
}

// Initialize Maya agent with configuration
let maya: Maya | null = null;

// Lazy initialize the Maya agent
function getMayaAgent() {
    if (!maya) {
        try {
            // Verify Cohere API key is available
            if (!cohereApiKey) {
                throw new Error('Cohere API key is required for embeddings but is missing');
            }
            
            maya = new Maya({
                openAIApiKey: openAIApiKey || undefined,
                anthropicApiKey,
                cohereApiKey,
                supabaseUrl,
                supabaseKey,
                temperature: 0.8, // Slightly higher temperature for more creative responses
                modelName,
                anthropicModel,
                primaryProvider: anthropicApiKey ? 'anthropic' : 'openai',
                embeddingProvider: EmbeddingProvider.COHERE, // Explicitly use Cohere for embeddings
                enableMemory: true
            });
            console.log('Maya agent initialized for daily summary with Cohere embeddings');
        } catch (error) {
            console.error('Failed to initialize Maya agent:', error);
            throw error;
        }
    }
    return maya;
}

// Function to get recent memories from the maya_memories table
async function getRecentMemories(days = 1, limit = 20): Promise<Memory[]> {
    try {
        const supabase = getSupabaseClient();
        if (!supabase) {
            console.error('Supabase client could not be initialized');
            return [];
        }
        
        // Calculate the date for filtering (x days ago)
        const pastDate = new Date();
        pastDate.setDate(pastDate.getDate() - days);
        console.log(`Looking for memories since: ${pastDate.toISOString()}`);
        
        // First, try without filtering by metadata to see if we get any results
        const { data: allRecentData, error: allRecentError } = await supabase
            .from('maya_memories')
            .select('content, metadata, created_at')
            .gte('created_at', pastDate.toISOString())
            .order('created_at', { ascending: false })
            .limit(limit);
            
        if (allRecentError) {
            console.error('Error fetching all recent memories:', allRecentError);
        } else {
            console.log(`Total recent memories (without type filter): ${allRecentData?.length || 0}`);
        }
        
        // Try a different approach - filter out only memories that explicitly have type=daily-update
        const { data, error } = await supabase
            .from('maya_memories')
            .select('content, metadata, created_at')
            .gte('created_at', pastDate.toISOString())
            .or('metadata->>type.neq.daily-update,metadata->>type.is.null') // Get records where type is not daily-update or type is null
            .order('created_at', { ascending: false })
            .limit(limit);
        
        if (error) {
            console.error('Error fetching memories:', error);
            return [];
        }
        
        console.log(`Found ${data?.length || 0} memories within date range after filtering`);
        if (data && data.length > 0) {
            console.log('First memory:', JSON.stringify(data[0]).substring(0, 200) + '...');
        }
        
        return data || [];
    } catch (error) {
        console.error('Failed to fetch recent memories:', error);
        return [];
    }
}

// Check if there are any memories at all (not just in the date range)
async function hasAnyMemories(): Promise<boolean> {
    try {
        const supabase = getSupabaseClient();
        if (!supabase) {
            console.error('Supabase client could not be initialized');
            return false;
        }
        
        // First, get all memories to check their structure
        const { data: allData, error: allError } = await supabase
            .from('maya_memories')
            .select('id, metadata')
            .limit(5);
        
        if (allError) {
            console.error('Error fetching sample memories:', allError);
        } else {
            console.log('Sample memories metadata:', allData?.map(m => m.metadata));
        }
        
        // Query to check if there are any memories that are not daily-updates using OR condition
        const { count, error } = await supabase
            .from('maya_memories')
            .select('id', { count: 'exact', head: true })
            .or('metadata->>type.neq.daily-update,metadata->>type.is.null'); // Get records where type is not daily-update or type is null
        
        if (error) {
            console.error('Error checking for memories:', error);
            return false;
        }
        
        console.log(`Total non-daily-update memories found: ${count}`);
        
        // Try querying without the type filter to compare
        const { count: totalCount, error: totalError } = await supabase
            .from('maya_memories')
            .select('id', { count: 'exact', head: true });
            
        if (totalError) {
            console.error('Error checking total memories:', totalError);
        } else {
            console.log(`Total memories (including daily-updates): ${totalCount}`);
        }
        
        return (count || 0) > 0;
    } catch (error) {
        console.error('Failed to check for memories:', error);
        return false;
    }
}

// Function to format memories for the prompt
function formatMemoriesForPrompt(memories: Memory[]): string {
    if (!memories || memories.length === 0) {
        return "No recent memories found.";
    }
    
    return memories.map(memory => {
        try {
            // Handle different content formats
            let content = memory.content;
            if (typeof content === 'string') {
                // Check if it's JSON
                if (content.startsWith('{') || content.startsWith('[')) {
                    try {
                        const parsed = JSON.parse(content);
                        if (parsed.input && parsed.response) {
                            content = `User: ${parsed.input}\nMaya: ${parsed.response}`;
                        }
                    } catch (e) {
                        // Not valid JSON, use as is
                    }
                }
            } else if (content && typeof content === 'object') {
                // Handle object format
                if (content.input && content.response) {
                    content = `User: ${content.input}\nMaya: ${content.response}`;
                } else {
                    content = JSON.stringify(content);
                }
            }
            
            // Include creation date and format the memory
            const createdAt = new Date(memory.created_at).toLocaleString();
            return `[${createdAt}] ${content}`;
        } catch (e) {
            return "Error parsing memory";
        }
    }).join('\n\n');
}

// Remove emojis and emoticons from text
function removeEmojis(text: string): string {
    // Basic emoji removal using regex
    // This covers most Unicode emoji characters
    const emojiRegex = /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F700}-\u{1F77F}\u{1F780}-\u{1F7FF}\u{1F800}-\u{1F8FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu;
    
    // Also remove common emoticons
    const emoticonRegex = /[:;]-?[)(/\\|DPp]/g;
    
    // Remove asterisk-wrapped actions like *winks* or *smiles*
    const actionRegex = /\*[^*]+\*/g;
    
    return text
        .replace(emojiRegex, '')
        .replace(emoticonRegex, '')
        .replace(actionRegex, '');
}

// Generate the memory summary
async function generateMemorySummary(days: number, limit: number) {
    try {
        // Get recent memories
        const memories = await getRecentMemories(days, limit);
        const hasMemories = await hasAnyMemories();
        
        // Initialize Maya agent
        const agent = getMayaAgent();
        
        // Default message for no memories - only use this if there are no memories at all, not just in the date range
        if (!memories || memories.length === 0) {
            let message;
            
            if (!hasMemories) {
                // No memories exist at all
                message = "Hey Blake, no updates today. Talk soon!";
            } else {
                // Memories exist but none in the requested time period
                message = "Hey Blake, nothing new in the requested time period. Let me know if you want to look back further!";
            }
            
            // Store this message as a memory with daily-update type
            try {
                await storeDailyUpdate(message);
            } catch (storeError) {
                console.warn('Failed to store daily update:', storeError);
            }
            
            return {
                summary: message,
                count: 0,
                generated_at: new Date().toISOString()
            };
        }
        
        // Format memories for the prompt
        const formattedMemories = formatMemoriesForPrompt(memories);
        
        // Create the prompt for generating the daily summary
        const prompt = `***ABSOLUTELY NO EMOJIS OR EMOTICONS ARE ALLOWED IN YOUR RESPONSE***

Based on the following recent memories, write a quick message to Blake. It should be a few sentences long
and in the format of a text message. Start off the message with "Hey Blake" or "Hey Blakey" "hey" or "hiiii" or Hello or "hola" or something similar.
The message should highlight interesting patterns, notable conversations, and insights in an entertaining way.
Make it feel like you are just giving a quick update on what's been happening.
Be humorous and slightly irreverent, but also insightful. Keep it concise (max 80 words).

CRITICAL INSTRUCTIONS:
- DO NOT USE ANY EMOJIS - No smileys, no hearts, no symbols at all
- DO NOT USE ANY EMOTICONS - No :) or ;) or similar
- DO NOT USE ASTERISK-WRAPPED ACTIONS - No *winks* or *smiles* or similar
- DO NOT USE ANY SPECIAL CHARACTERS THAT REPRESENT FACES OR EMOTIONS
- USE ONLY PLAIN TEXT WITH STANDARD PUNCTUATION
- If you use an emoji, emoticon, or action, your response will be rejected
- This is extremely important

Recent memories:
${formattedMemories}

Your message (REMEMBER: PLAIN TEXT ONLY, NO EMOJIS, EMOTICONS, OR ACTIONS):`;
        
        // Get the summary from Maya
        let summary = await agent.chat(prompt, {
            userId: "daily-summary", // Special user ID for the daily summary
            timestamp: new Date().toISOString()
        });
        
        // Post-process to remove any emojis that might have slipped through
        summary = removeEmojis(summary);
        
        // Store the generated summary as a memory with daily-update type
        try {
            await storeDailyUpdate(summary);
        } catch (storeError) {
            console.warn('Failed to store daily update:', storeError);
        }
        
        return {
            summary,
            count: memories.length,
            generated_at: new Date().toISOString()
        };
    } catch (error) {
        // Check for rate limit errors
        if (error instanceof Error && error.message.includes('exceeded your current quota')) {
            console.error('Rate limit error when generating summary:', error.message);
            throw new Error('API rate limit exceeded. Please check your API usage and quotas.');
        }
        
        // Re-throw the error for the main handler to catch
        throw error;
    }
}

// Store daily update in maya_memories with special metadata
async function storeDailyUpdate(content: string) {
    try {
        const supabase = getSupabaseClient();
        if (!supabase) {
            console.error('Supabase client could not be initialized');
            throw new Error('Supabase client could not be initialized');
        }
        
        // Create the memory object
        const memory = {
            content,
            metadata: {
                userId: "daily-update", // Special user ID
                type: "daily-update",   // Special type for filtering
                generated_at: new Date().toISOString()
            }
        };
        
        // Store the memory
        const { error } = await supabase
            .from('maya_memories')
            .insert(memory);
            
        if (error) {
            console.error('Error storing daily update:', error);
            throw error;
        }
        
        console.log('Daily update stored successfully');
    } catch (error) {
        console.error('Failed to store daily update:', error);
        throw error;
    }
}

// Extract parameters from request (either GET or POST)
function extractParams(req: Request): { days: number, limit: number } {
    const url = new URL(req.url);
    const daysParam = url.searchParams.get('days');
    const limitParam = url.searchParams.get('limit');
    
    // Parse parameters with defaults
    const days = daysParam ? parseInt(daysParam, 10) : 1;
    const limit = limitParam ? parseInt(limitParam, 10) : 20;
    
    return { days, limit };
}

// Validate parameters
function validateParams(days: number, limit: number): { valid: boolean, error?: string } {
    if (isNaN(days) || days < 1 || days > 30) {
        return {
            valid: false,
            error: 'Invalid days parameter. Must be between 1 and 30.'
        };
    }
    
    if (isNaN(limit) || limit < 1 || limit > 100) {
        return {
            valid: false,
            error: 'Invalid limit parameter. Must be between 1 and 100.'
        };
    }
    
    return { valid: true };
}

// Handle errors in API endpoints
function handleApiError(error: unknown, errorSource: string = 'daily summary') {
    // Log the error
    console.error(`${errorSource} error:`, error);
    
    // Determine status code based on error type
    let statusCode = 500;
    let userMessage = `Failed to generate ${errorSource}`;
    
    if (error instanceof Error) {
        if (error.message.includes('rate limit') || 
            error.message.includes('quota') || 
            error.message.includes('exceeded')) {
            statusCode = 429; // Too Many Requests
            userMessage = 'API rate limit exceeded. Please try again later or check your API usage and quotas.';
        } else if (error.message.includes('Cohere API key')) {
            statusCode = 500; // Server Error for missing configuration
            userMessage = 'Embedding service configuration is missing. Please check your environment variables.';
        }
    }
    
    // Return formatted error response
    return NextResponse.json(
        { 
            error: userMessage,
            details: error instanceof Error ? error.message : String(error)
        },
        { status: statusCode }
    );
}

// GET endpoint for the daily memory summary
export async function GET(req: Request) {
    try {
        // Extract and validate parameters
        const { days, limit } = extractParams(req);
        const validation = validateParams(days, limit);
        
        if (!validation.valid) {
            return NextResponse.json(
                { error: validation.error },
                { status: 400 }
            );
        }
        
        // Generate and return summary
        const result = await generateMemorySummary(days, limit);
        return NextResponse.json(result);
    } catch (error) {
        return handleApiError(error, 'daily summary (GET)');
    }
}

// POST endpoint for the daily memory summary (for n8n webhook compatibility)
export async function POST(req: Request) {
    try {
        let days = 1;
        let limit = 20;
        
        // Try to parse request body for parameters
        try {
            const body = await req.json();
            
            // Extract parameters from body if available
            if (body) {
                if (body.days !== undefined) {
                    days = parseInt(body.days, 10);
                }
                
                if (body.limit !== undefined) {
                    limit = parseInt(body.limit, 10);
                }
            }
        } catch (e) {
            // If body parsing fails, fall back to URL parameters
            const params = extractParams(req);
            days = params.days;
            limit = params.limit;
        }
        
        // Validate parameters
        const validation = validateParams(days, limit);
        
        if (!validation.valid) {
            return NextResponse.json(
                { error: validation.error },
                { status: 400 }
            );
        }
        
        // Generate and return summary
        const result = await generateMemorySummary(days, limit);
        return NextResponse.json(result);
    } catch (error) {
        return handleApiError(error, 'daily summary (POST)');
    }
} 