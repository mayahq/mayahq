import { createClient } from '@supabase/supabase-js';

/**
 * Tag a message using the database PL/pgSQL function
 * More efficient than client-side tagging
 * 
 * @param message The message to tag
 * @param supabaseClient Optional Supabase client (if not provided, creates a new one)
 * @returns Array of tags associated with the message
 */
export async function tagMessage(
  message: string,
  supabaseClient?: ReturnType<typeof createClient>
): Promise<string[]> {
  // Create Supabase client if not provided
  const supabase = supabaseClient || createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
  );

  try {
    // Call the database function
    const { data, error } = await supabase.rpc('tag_message', { msg: message });
    
    if (error) {
      console.error('Tag RPC failed, falling back to client-side tagging', error);
      // Import the fallback function only when needed (to avoid circular dependencies)
      const { inferMemoryTagsDynamic } = await import('../memoryUtils');
      return inferMemoryTagsDynamic(message);
    }
    
    return (data as string[]) || [];
  } catch (error) {
    console.error('Tagging failed with error:', error);
    return [];
  }
}

/**
 * Get stats about tag usage
 * @param supabaseClient Optional Supabase client
 * @returns Array of tag stats with hit counts
 */
export async function getTagStats(
  supabaseClient?: ReturnType<typeof createClient>
): Promise<Array<{ slug: string, hit_count: number, last_hit: string }>> {
  const supabase = supabaseClient || createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
  );

  try {
    const { data, error } = await supabase
      .from('tag_stats')
      .select('slug, hit_count, last_hit')
      .order('hit_count', { ascending: false });
      
    if (error) {
      console.error('Failed to get tag stats:', error);
      return [];
    }
    
    return (data as Array<{ slug: string, hit_count: number, last_hit: string }>) || [];
  } catch (error) {
    console.error('Tag stats retrieval failed:', error);
    return [];
  }
}

/**
 * Get all defined tags with their metadata
 * @param supabaseClient Optional Supabase client
 * @returns Array of tag definitions
 */
export async function getTagDefinitions(
  supabaseClient?: ReturnType<typeof createClient>
): Promise<Array<{
  id: number;
  slug: string;
  description: string;
  report_section: string;
  keywords: string[];
  is_enabled: boolean;
}>> {
  const supabase = supabaseClient || createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
  );

  try {
    const { data, error } = await supabase
      .from('tag_defs')
      .select('id, slug, description, report_section, keywords, is_enabled')
      .order('slug');
      
    if (error) {
      console.error('Failed to get tag definitions:', error);
      return [];
    }
    
    return (data as Array<{
      id: number;
      slug: string;
      description: string;
      report_section: string;
      keywords: string[];
      is_enabled: boolean;
    }>) || [];
  } catch (error) {
    console.error('Tag definitions retrieval failed:', error);
    return [];
  }
} 