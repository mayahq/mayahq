'use server'

import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { type Tables, type Database } from '@/lib/database.types'
import OpenAI from 'openai'

// Helper function to create Supabase client within actions
function getSupabaseClient() { // Renamed for consistency with other files
  const cookieStore = cookies()
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value
        },
        set(name: string, value: string, options: CookieOptions) {
          try {
            cookieStore.set(name, value, options)
          } catch (error) {
            // Errors can be ignored in Server Actions
          }
        },
        remove(name: string, options: CookieOptions) {
          try {
            cookieStore.set(name, '', options)
          } catch (error) {
            // Errors can be ignored in Server Actions
          }
        },
      },
    }
  )
}

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || '',
})

// Generate embedding function to replace the one from the deleted module
async function generateEmbedding(text: string): Promise<number[]> {
  try {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OpenAI API key is not configured');
    }

    const response = await openai.embeddings.create({
      model: "text-embedding-ada-002",
      input: text,
      encoding_format: "float",
    })

    if (!response.data?.[0]?.embedding) {
      throw new Error('Failed to generate embedding');
    }
    
    return response.data[0].embedding;
  } catch (error) {
    console.error('Error generating embedding:', error);
    if (error instanceof Error) {
      throw new Error(`Embedding Error: ${error.message}`);
    }
    throw error;
  }
}

// Validate that the embedding is a valid vector
function isValidEmbedding(embedding: number[]): boolean {
  return (
    Array.isArray(embedding) &&
    embedding.length === 1536 && // OpenAI embeddings are 1536-dimensional
    embedding.every(value => typeof value === 'number' && !isNaN(value))
  )
}

export async function getMemories() {
  const supabase = getSupabaseClient()

  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) throw new Error('User not authenticated for getMemories')

    const { data, error } = await supabase
      .from('maya_memories')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) throw error

    return { success: true, data }
  } catch (error) {
    console.error('Error fetching memories:', error)
    return { success: false, error: error instanceof Error ? error.message : String(error) }
  }
}

export async function searchMemories(query: string) {
  if (!query) {
    return getMemories() // Return all memories if query is empty
  }

  const supabase = getSupabaseClient()

  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) throw new Error('User not authenticated for searchMemories')

    // Generate embedding for the search query
    const queryEmbedding = await generateEmbedding(query)

    // Validate the embedding
    if (!isValidEmbedding(queryEmbedding)) {
      throw new Error('Invalid embedding generated for query')
    }

    console.log(`Searching for: "${query}" with threshold: 0.78`)

    // Define the expected return type for the RPC
    type MatchResult = Tables<'maya_memories'> & { similarity: number }

    // Call the match_documents RPC function with explicit type casting
    const { data, error } = await supabase.rpc('match_documents' as any, {
      query_embedding: queryEmbedding,
      match_count: 10, // Limit results for performance
      filter: {}, // Use empty filter instead of match_threshold since the SQL function expects a filter parameter
    })

    if (error) {
      console.error('Search error details:', error)
      throw error
    }

    // Cast the result data to the expected type
    const searchResults = data as MatchResult[] | null

    if (!searchResults) {
      console.log('No search results found')
      return { success: true, data: [] }
    }

    console.log(`Found ${searchResults.length} results. Top similarity:`, 
      searchResults.length > 0 ? searchResults[0].similarity : 'N/A')

    // The data should already be in the correct format (including metadata)
    return { success: true, data: searchResults }
  } catch (error) {
    console.error('Error searching memories:', error)
    return { success: false, error: error instanceof Error ? error.message : String(error) }
  }
}

export async function addMemory(data: { modality: string; content: string }) {
  const supabase = getSupabaseClient()

  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) throw new Error('User not authenticated for addMemory')

    // Generate embedding for the content
    const embedding = await generateEmbedding(data.content)

    // Validate the embedding
    if (!isValidEmbedding(embedding)) {
      throw new Error('Invalid embedding generated')
    }

    // Current timestamp
    const now = new Date().toISOString()

    // Insert the memory with its embedding and metadata
    const { error } = await supabase
      .from('maya_memories')
      .insert({
        content: data.content,
        embedding: JSON.stringify(embedding),
        modality: data.modality,
        created_at: now,
        // Also add metadata with modality and created_at for consistency
        metadata: {
          modality: data.modality,
          created_at: now
        }
      })

    if (error) throw error

    revalidatePath('/admin/memories')
    return { success: true }
  } catch (error) {
    console.error('Error adding memory:', error)
    return { success: false, error: error instanceof Error ? error.message : String(error) }
  }
}

export async function updateMemory(data: { id: string; modality: string; content: string }) {
  const supabase = getSupabaseClient()

  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) throw new Error('User not authenticated for updateMemory')

    // Convert string ID to number
    const memoryId = parseInt(data.id, 10)
    if (isNaN(memoryId)) throw new Error('Invalid memory ID')

    // Generate new embedding for the updated content
    const embedding = await generateEmbedding(data.content)

    // Validate the embedding
    if (!isValidEmbedding(embedding)) {
      throw new Error('Invalid embedding generated')
    }

    // First, get the existing record to preserve created_at in metadata
    const { data: existingMemory, error: fetchError } = await supabase
      .from('maya_memories')
      .select('metadata, created_at')
      .eq('id', memoryId)
      .single()

    if (fetchError) throw fetchError
    
    // Type assertion for metadata
    const metadata = existingMemory?.metadata as { modality?: string; created_at?: string } | null

    // Get the created_at timestamp, either from metadata or the column
    const createdAt = metadata?.created_at || 
                     existingMemory?.created_at || 
                     new Date().toISOString()

    // Update the memory with its new embedding and updated metadata
    const { error } = await supabase
      .from('maya_memories')
      .update({
        content: data.content,
        embedding: JSON.stringify(embedding),
        modality: data.modality,
        // Update metadata with current modality and preserve original created_at
        metadata: {
          modality: data.modality,
          created_at: createdAt
        }
      })
      .eq('id', memoryId)

    if (error) throw error

    revalidatePath('/admin/memories')
    return { success: true }
  } catch (error) {
    console.error('Error updating memory:', error)
    return { success: false, error: error instanceof Error ? error.message : String(error) }
  }
}

export async function deleteMemory(id: string) {
  const supabase = getSupabaseClient()

  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) throw new Error('User not authenticated for deleteMemory')
    
    // Convert string ID to number
    const memoryId = parseInt(id, 10)
    if (isNaN(memoryId)) throw new Error('Invalid memory ID')
    
    const { error } = await supabase
      .from('maya_memories')
      .delete()
      .eq('id', memoryId)

    if (error) throw error

    revalidatePath('/admin/memories')
    return { success: true }
  } catch (error) {
    console.error('Error deleting memory:', error)
    return { success: false, error: error instanceof Error ? error.message : String(error) }
  }
} 