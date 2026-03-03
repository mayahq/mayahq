import { SupabaseClient } from '@supabase/supabase-js'
import { Database } from './database-types'

/**
 * Cleanup old or low-importance memories to save storage space
 * and improve recall performance
 */
export async function cleanupMemories(supabase: SupabaseClient<Database>) {
  try {
    console.log('Starting memory cleanup')
    
    // 1. Delete expired memories
    const { error: expiredError, count: expiredCount } = await supabase
      .from('maya_memories')
      .delete({ count: 'exact' })
      .not('expires_at', 'is', null)
      .lt('expires_at', new Date().toISOString())
    
    if (expiredError) {
      console.error('Error deleting expired memories:', expiredError)
    } else {
      console.log(`Deleted ${expiredCount || 0} expired memories`)
    }
    
    // 2. Find and delete low-importance memories older than 6 months
    const sixMonthsAgo = new Date()
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)
    
    const { error: oldMemoriesError, count: oldMemoriesCount } = await supabase
      .from('maya_memories')
      .delete({ count: 'exact' })
      .lt('created_at', sixMonthsAgo.toISOString())
      .lt('importance', 0.3) // Only delete unimportant memories
    
    if (oldMemoriesError) {
      console.error('Error deleting old memories:', oldMemoriesError)
    } else {
      console.log(`Deleted ${oldMemoriesCount || 0} old low-importance memories`)
    }
    
    // 3. Check if facts have expired
    const { error: factsError, count: factsCount } = await supabase
      .from('maya_facts')
      .delete({ count: 'exact' })
      .not('expires_at', 'is', null)
      .lt('expires_at', new Date().toISOString())
    
    if (factsError) {
      console.error('Error deleting expired facts:', factsError)
    } else {
      console.log(`Deleted ${factsCount || 0} expired facts`)
    }
    
    // 4. Run storage optimization - if your setup includes a way to optimize the vector index
    // This would be database-specific and might require admin privileges
    
    console.log('Memory cleanup complete')
    return {
      expiredMemories: expiredCount || 0,
      oldMemories: oldMemoriesCount || 0,
      expiredFacts: factsCount || 0
    }
  } catch (error) {
    console.error('Error in memory cleanup:', error)
    throw error
  }
}

/**
 * Consolidate similar memories to reduce duplication
 * This is an advanced feature that could be implemented later
 */
export async function consolidateMemories(supabase: SupabaseClient<Database>) {
  // This would use semantic similarity to find and merge duplicate memories
  // For example, multiple mentions of the same fact could be combined
  // For now, this is just a placeholder for future implementation
  console.log('Memory consolidation not yet implemented')
} 