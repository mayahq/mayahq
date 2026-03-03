import { SupabaseClient } from '@supabase/supabase-js';
import { MayaMemory, MayaFact, CoreFact, Database } from './types';

/**
 * Gets semantic memories related to a query
 */
export async function getRelatedMemories(
  client: SupabaseClient<Database>,
  queryEmbedding: number[],
  matchThreshold: number = 0.7,
  matchCount: number = 10
) {
  const { data, error } = await client.rpc('match_memories', {
    query_embedding: JSON.stringify(queryEmbedding),
    match_threshold: matchThreshold,
    match_count: matchCount
  });
  
  if (error) throw error;
  return data || [];
}

/**
 * Stores a new memory with its embedding
 */
export async function storeMemory(
  client: SupabaseClient<Database>,
  memory: Omit<MayaMemory, 'id' | 'created_at'>
) {
  return client
    .from('maya_memories')
    .insert(memory)
    .select()
    .single();
}

/**
 * Gets semantic facts related to a query
 */
export async function getRelatedFacts(
  client: SupabaseClient<Database>,
  userId: string,
  queryEmbedding: number[],
  matchThreshold: number = 0.7,
  matchCount: number = 10
) {
  // Using a generic rpc call since match_facts may not exist in DB types yet
  const { data, error } = await client.rpc('match_memories', {
    query_embedding: JSON.stringify(queryEmbedding),
    match_threshold: matchThreshold,
    match_count: matchCount,
    user_id: userId
  } as any);
  
  if (error) throw error;
  return data || [];
}

/**
 * Stores a new fact
 */
export async function storeFact(
  client: SupabaseClient<Database>,
  fact: Omit<MayaFact, 'created_at'>
) {
  return client
    .from('maya_facts')
    .insert(fact)
    .select()
    .single();
}

/**
 * Gets core facts for a user
 */
export async function getCoreFacts(
  client: SupabaseClient<Database>,
  userId: string
) {
  return client
    .from('maya_core_facts')
    .select('*')
    .eq('user_id', userId)
    .eq('active', true);
}

/**
 * Updates or inserts a core fact
 */
export async function upsertCoreFact(
  client: SupabaseClient<Database>,
  fact: Omit<CoreFact, 'ts' | 'last_updated'>
) {
  const now = new Date().toISOString();
  
  return client
    .from('maya_core_facts')
    .upsert({
      ...fact,
      ts: now,
      last_updated: now
    })
    .select()
    .single();
}

/**
 * Extracts facts from text using NLP techniques
 * This is a placeholder that would be implemented in the memory-worker
 */
export async function extractFactsFromText(
  text: string,
  userId: string,
  sourceRef: any
): Promise<Omit<MayaFact, 'id' | 'created_at' | 'embedding'>[]> {
  // This would be implemented in the memory-worker package
  // For now, return an empty array as a placeholder
  return [];
}

export class MemoryService {
  private supabase: SupabaseClient<Database>;

  constructor(supabaseClient: SupabaseClient<Database>) {
    this.supabase = supabaseClient;
  }

  // Fetch all memories
  async getAllMemories(): Promise<MayaMemory[]> {
    const { data, error } = await this.supabase.from('maya_memories').select('*');
    if (error) throw error;
    return data || [];
  }

  // Add a new memory
  async addMemory(memoryData: Omit<MayaMemory, 'created_at' | 'id'>): Promise<MayaMemory | null> {
    const { data, error } = await this.supabase
      .from('maya_memories')
      .insert(memoryData)
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  // Fetch all facts
  async getAllFacts(): Promise<MayaFact[]> {
    const { data, error } = await this.supabase.from('maya_facts').select('*');
    if (error) throw error;
    return data || [];
  }

  // Add a new fact
  async addFact(factData: Omit<MayaFact, 'created_at'>): Promise<MayaFact | null> {
    const { data, error } = await this.supabase
      .from('maya_facts')
      .insert(factData)
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  // Fetch all core facts
  async getAllCoreFacts(): Promise<CoreFact[]> {
    const { data, error } = await this.supabase.from('maya_core_facts').select('*');
    if (error) throw error;
    return data || [];
  }

  // Add a new core fact - assuming CoreFact might also have an ID and created_at managed by DB
  // If CoreFact structure is different (e.g., no auto-generated ID or timestamps from DB), adjust Omit<> accordingly
  async addCoreFact(coreFactData: Omit<CoreFact, 'id' | 'created_at' | 'last_updated' | 'ts'> & { ts?: string | null, last_updated?: string | null }): Promise<CoreFact | null> {
     const payload: Partial<CoreFact> = {
      ...coreFactData,
      ts: coreFactData.ts !== undefined ? coreFactData.ts : new Date().toISOString(),
      last_updated: coreFactData.last_updated !== undefined ? coreFactData.last_updated : new Date().toISOString(),
    };
    
    // Explicitly cast to the expected insert type if necessary, or ensure payload matches Insert type from TablesInsert<>
    const { data, error } = await this.supabase
      .from('maya_core_facts')
      .insert(payload as any) // Using `as any` for now, ideally match with TablesInsert<'maya_core_facts'>
      .select()
      .single();
    if (error) {
        console.error("Error adding core fact:", error);
        throw error;
    }
    return data;
  }

  // Example of updating a core fact, ensure you have an ID
  async updateCoreFact(id: string, updates: Partial<Omit<CoreFact, 'id' | 'created_at' | 'ts'> & { last_updated?: string }>): Promise<CoreFact | null> {
    const payload = {
        ...updates,
        last_updated: updates.last_updated || new Date().toISOString(),
    };
    const { data, error } = await this.supabase
      .from('maya_core_facts')
      .update(payload)
      .eq('id', id)
      .select()
      .single();
    if (error) {
        console.error(`Error updating core fact ${id}:`, error);
        throw error;
    }
    return data;
  }

  // Get related facts (placeholder - needs actual implementation based on your logic)
  // This was the function with the problematic type { subject: any; predicate: any; object: any; weight: any; source_ref: any; user_info: any; }
  // We should use the actual return type from your DB function if defined, or a more specific type.
  // For now, returning any[] to resolve the immediate TS error.
  async getRelatedFacts(userId: string, query: string, k: number): Promise<any[]> { 
    const { data, error } = await this.supabase.rpc('get_related_facts', {
      p_user_id: userId,
      query: query,
      k: k,
    });
    if (error) throw error;
    return data || [];
  }
} 