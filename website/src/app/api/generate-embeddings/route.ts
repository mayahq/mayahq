import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Make initialization conditional to handle build-time missing env vars
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const cohereApiKey = process.env.COHERE_API_KEY || '';

// Initialize Supabase client only if keys are available
const getSupabaseClient = () => {
  // Skip during build if keys are missing
  if (!supabaseUrl || !supabaseServiceKey) {
    console.log('Supabase configuration missing');
    return null;
  }
  
  return createClient(supabaseUrl, supabaseServiceKey);
};

/**
 * API endpoint to generate embeddings for memories that don't have them yet
 * This uses Cohere for embeddings
 */
export async function POST(request: NextRequest) {
  console.log('[EMBEDDING_API] Received request to generate embeddings');
  
  // Check for API key
  const apiKey = request.headers.get('x-api-key');
  if (!apiKey || apiKey !== process.env.EMBEDDING_GENERATION_API_KEY) {
    console.error('[EMBEDDING_API] Invalid or missing API key');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  
  try {
    // Check if required configuration exists
    if (!cohereApiKey) {
      console.error('[EMBEDDING_API] Cohere API Key missing (required for embeddings)');
      return NextResponse.json(
        { error: 'Missing Cohere API key in server configuration' },
        { status: 500 }
      );
    }
    
    const supabaseClient = getSupabaseClient();
    if (!supabaseClient) {
      console.error('[EMBEDDING_API] Supabase client could not be initialized');
      return NextResponse.json(
        { error: 'Failed to initialize Supabase client' },
        { status: 500 }
      );
    }
    
    // Get request body, defaulting to a batch size of 20
    const { batchSize = 20 } = await request.json().catch(() => ({}));
    console.log(`[EMBEDDING_API] Processing embeddings with batch size: ${batchSize}`);
    
    // 1. Mark memories that need embeddings
    const { data: markedData, error: markedError } = await supabaseClient.rpc(
      'mark_memories_for_embedding',
      { batch_size: batchSize }
    );
    
    if (markedError) {
      console.error('[EMBEDDING_API] Error marking memories:', markedError);
      return NextResponse.json(
        { error: 'Failed to mark memories for embedding', details: markedError.message },
        { status: 500 }
      );
    }
    
    console.log(`[EMBEDDING_API] Marked ${markedData.count} memories for embedding generation`);
    
    if (markedData.count === 0) {
      return NextResponse.json({
        success: true,
        message: 'No memories found that need embeddings',
        processed: 0
      });
    }
    
    // 2. Get the content of the marked memories
    const { data: memories, error: memoriesError } = await supabaseClient
      .from('maya_memories')
      .select('id, content')
      .in('id', markedData.memory_ids)
      .order('created_at', { ascending: true });
      
    if (memoriesError) {
      console.error('[EMBEDDING_API] Error fetching memories:', memoriesError);
      return NextResponse.json(
        { error: 'Failed to fetch memories', details: memoriesError.message },
        { status: 500 }
      );
    }
    
    console.log(`[EMBEDDING_API] Retrieved ${memories.length} memories for embedding generation`);
    
    // 3. Generate embeddings using Cohere
    const successCount = await processMemoriesWithCohere(memories, supabaseClient);
    
    // 4. Return success response
    return NextResponse.json({
      success: true,
      processed: memories.length,
      successful: successCount,
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    console.error('[EMBEDDING_API] Unhandled error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}

/**
 * Process a batch of memories with Cohere embeddings
 */
async function processMemoriesWithCohere(memories: any[], supabaseClient: any) {
  let successCount = 0;
  
  // Process memories sequentially to avoid rate limiting
  for (const memory of memories) {
    try {
      // Call Cohere API to generate embedding
      const embedding = await generateCohereEmbedding(memory.content);
      
      if (!embedding) {
        console.error(`[EMBEDDING_API] Failed to generate embedding for memory ${memory.id}`);
        continue;
      }
      
      // Update the memory with the embedding
      const { data, error } = await supabaseClient.rpc(
        'update_memory_with_embedding',
        {
          memory_id: memory.id,
          p_embedding: embedding,
          p_model: 'embed-english-v3.0',
          p_version: '1.0'
        }
      );
      
      if (error) {
        console.error(`[EMBEDDING_API] Error updating memory ${memory.id}:`, error);
      } else {
        console.log(`[EMBEDDING_API] Successfully updated memory ${memory.id} with embedding`);
        successCount++;
      }
    } catch (error) {
      console.error(`[EMBEDDING_API] Error processing memory ${memory.id}:`, error);
    }
  }
  
  return successCount;
}

/**
 * Generate an embedding using Cohere's API
 */
async function generateCohereEmbedding(text: string): Promise<number[] | null> {
  try {
    const response = await fetch('https://api.cohere.ai/v1/embed', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${cohereApiKey}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        texts: [text],
        model: 'embed-english-v3.0',
        truncate: 'END'
      })
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('[EMBEDDING_API] Cohere API error:', response.status, errorText);
      return null;
    }
    
    const data = await response.json();
    
    if (!data.embeddings || !data.embeddings[0]) {
      console.error('[EMBEDDING_API] Unexpected Cohere API response format:', data);
      return null;
    }
    
    return data.embeddings[0];
  } catch (error) {
    console.error('[EMBEDDING_API] Error calling Cohere API:', error);
    return null;
  }
} 