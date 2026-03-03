/**
 * Reference Tracking Utilities
 *
 * Tracks when memories and thoughts are retrieved and used in context.
 * This implements the temporal layer enhancement from Memory System 2.0.
 */

import { createClient } from '@supabase/supabase-js';

export class ReferenceTracker {
  private supabase: any;

  constructor(supabase: any) {
    this.supabase = supabase;
  }

  /**
   * Track a single memory reference
   */
  async trackMemoryReference(memoryId: number): Promise<void> {
    try {
      await this.supabase.rpc('increment_memory_reference', { memory_id: memoryId });
    } catch (error) {
      console.error(`[REFERENCE_TRACKER] Failed to track memory ${memoryId}:`, error);
      // Don't throw - reference tracking is not critical to functionality
    }
  }

  /**
   * Track multiple memory references (batch operation - more efficient)
   */
  async trackMemoryReferencesBatch(memoryIds: number[]): Promise<void> {
    if (memoryIds.length === 0) return;

    try {
      await this.supabase.rpc('increment_memory_references_batch', { memory_ids: memoryIds });
      console.log(`[REFERENCE_TRACKER] ✅ Tracked ${memoryIds.length} memory references`);
    } catch (error) {
      console.error(`[REFERENCE_TRACKER] Failed to track ${memoryIds.length} memories:`, error);
      // Fallback to individual tracking if batch fails
      console.log('[REFERENCE_TRACKER] Attempting individual tracking...');
      for (const id of memoryIds) {
        await this.trackMemoryReference(id);
      }
    }
  }

  /**
   * Track a single thought reference
   */
  async trackThoughtReference(thoughtId: string): Promise<void> {
    try {
      await this.supabase.rpc('increment_thought_reference', { thought_id: thoughtId });
    } catch (error) {
      console.error(`[REFERENCE_TRACKER] Failed to track thought ${thoughtId}:`, error);
    }
  }

  /**
   * Track multiple thought references
   */
  async trackThoughtReferencesBatch(thoughtIds: string[]): Promise<void> {
    if (thoughtIds.length === 0) return;

    // Execute in parallel for speed
    await Promise.allSettled(
      thoughtIds.map(id => this.trackThoughtReference(id))
    );

    console.log(`[REFERENCE_TRACKER] ✅ Tracked ${thoughtIds.length} thought references`);
  }

  /**
   * Get memory statistics for monitoring
   */
  async getMemoryStatistics(userId: string): Promise<any> {
    try {
      const { data, error } = await this.supabase
        .rpc('get_memory_statistics', { p_user_id: userId });

      if (error) throw error;

      return data && data.length > 0 ? data[0] : null;
    } catch (error) {
      console.error('[REFERENCE_TRACKER] Failed to get statistics:', error);
      return null;
    }
  }

  /**
   * Get frequently referenced memories (useful for debugging/analytics)
   */
  async getFrequentlyReferencedMemories(userId: string, limit: number = 20): Promise<any[]> {
    try {
      const { data, error } = await this.supabase
        .rpc('get_frequently_referenced_memories', {
          p_user_id: userId,
          min_references: 3,
          max_age_days: 30,
          max_results: limit
        });

      if (error) throw error;

      return data || [];
    } catch (error) {
      console.error('[REFERENCE_TRACKER] Failed to get frequent memories:', error);
      return [];
    }
  }
}

/**
 * Helper to extract memory IDs from various result formats
 */
export function extractMemoryIds(memories: any[]): number[] {
  const ids: number[] = [];

  for (const memory of memories) {
    // Handle different data structures
    const id = memory.id || memory.metadata?.id || memory.metadata?.memoryId;

    if (id && typeof id === 'number') {
      ids.push(id);
    } else if (id && typeof id === 'string') {
      const parsed = parseInt(id, 10);
      if (!isNaN(parsed)) {
        ids.push(parsed);
      }
    }
  }

  return ids;
}

/**
 * Helper to extract thought IDs
 */
export function extractThoughtIds(thoughts: any[]): string[] {
  return thoughts
    .map(t => t.id)
    .filter(id => id && typeof id === 'string');
}
