/**
 * Feed Processor Service
 * Main orchestrator for polling, processing, and ingesting feed items
 */

import { createClient } from '@mayahq/supabase-client';
import { pollHackerNews, DEFAULT_HN_FILTERS } from './sources/hackernews';
import { processBatch } from './processors/content-processor';
import { RawFeedItem, ProcessedFeedItem, FeedProcessorStats, SourceConfig } from './types';

const MAYA_SYSTEM_USER_ID = '61770892-9e5b-46a5-b622-568be7066664';

/**
 * Default configuration
 */
export const DEFAULT_CONFIG: SourceConfig = {
  enabled: true,
  pollIntervalMinutes: 30,
  batchSize: 10, // Process max 10 items per run
  filters: DEFAULT_HN_FILTERS,
};

/**
 * Track which HN items we've already processed
 */
const processedItemsCache = new Set<string>();
const MAX_CACHE_SIZE = 1000;

/**
 * Check if we've already ingested this item
 */
async function isAlreadyIngested(itemId: string, sourceIdentifier: string): Promise<boolean> {
  // Check cache first
  if (processedItemsCache.has(itemId)) {
    return true;
  }

  // Check database
  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('feed_items')
      .select('id')
      .eq('original_context->>source_identifier', sourceIdentifier)
      .limit(1);

    if (error) {
      console.error('[Feed Processor] Error checking if item exists:', error);
      return false;
    }

    const exists = data && data.length > 0;
    if (exists) {
      processedItemsCache.add(itemId);
      // Prevent cache from growing indefinitely
      if (processedItemsCache.size > MAX_CACHE_SIZE) {
        const firstItem = processedItemsCache.values().next().value as string;
        if (firstItem) {
          processedItemsCache.delete(firstItem);
        }
      }
    }

    return exists;
  } catch (error) {
    console.error('[Feed Processor] Error in isAlreadyIngested:', error);
    return false;
  }
}

/**
 * Convert raw item + AI content into ProcessedFeedItem for database
 */
function createProcessedItem(raw: RawFeedItem, mayaTake: string): ProcessedFeedItem {
  return {
    item_type: `text_from_${raw.source}`,
    source_system: 'n8n_maya_processor', // Keep same source_system for compatibility
    content_data: {
      processed_content: mayaTake, // Maya's AI-generated take
      text: null, // No raw text for HN items
      original_title: raw.title,
      url: raw.url,
      source_metadata: {
        score: raw.score,
        comment_count: raw.comment_count,
        author: raw.author,
      },
      hn_url: raw.metadata?.hn_url,
    },
    original_context: {
      source_id: raw.id,
      ingested_at: new Date().toISOString(),
      source_type: 'api_poll',
      source_identifier: raw.id,
      raw_item: raw,
    },
    created_by_maya_profile_id: MAYA_SYSTEM_USER_ID,
  };
}

/**
 * Ingest processed items into the database
 */
async function ingestItems(items: ProcessedFeedItem[]): Promise<number> {
  if (items.length === 0) {
    return 0;
  }

  const supabase = createClient();
  let successCount = 0;

  for (const item of items) {
    try {
      const { data, error } = await supabase
        .from('feed_items')
        .insert({
          created_by_maya_profile_id: item.created_by_maya_profile_id,
          item_type: item.item_type,
          source_system: item.source_system,
          content_data: item.content_data as any,
          original_context: item.original_context as any,
          status: 'pending_review',
        } as any)
        .select('id')
        .single();

      if (error) {
        console.error('[Feed Processor] Error inserting feed item:', error);
        continue;
      }

      console.log(`[Feed Processor] ✓ Ingested item: ${data.id} - "${item.content_data.original_title?.substring(0, 50)}..."`);
      successCount++;
    } catch (error) {
      console.error('[Feed Processor] Error during ingest:', error);
    }
  }

  return successCount;
}

/**
 * Main processing run
 */
export async function runFeedProcessor(config: SourceConfig = DEFAULT_CONFIG): Promise<FeedProcessorStats> {
  const stats: FeedProcessorStats = {
    itemsPolled: 0,
    itemsFiltered: 0,
    itemsProcessed: 0,
    itemsFailed: 0,
    lastRunAt: new Date().toISOString(),
    errors: [],
  };

  console.log('=== Feed Processor Run Started ===');
  console.log(`[Feed Processor] Config: batchSize=${config.batchSize}, interval=${config.pollIntervalMinutes}min`);

  try {
    // Step 1: Poll HackerNews
    console.log('[Feed Processor] Step 1: Polling HackerNews...');
    const rawItems = await pollHackerNews(config.filters, config.batchSize);
    stats.itemsPolled = rawItems.length;
    console.log(`[Feed Processor] Polled ${rawItems.length} items from HackerNews`);

    if (rawItems.length === 0) {
      console.log('[Feed Processor] No new items found. Exiting.');
      return stats;
    }

    // Step 2: Filter out already-processed items
    console.log('[Feed Processor] Step 2: Filtering out already-processed items...');
    const newItems: RawFeedItem[] = [];
    for (const item of rawItems) {
      const alreadyProcessed = await isAlreadyIngested(item.id, item.id);
      if (!alreadyProcessed) {
        newItems.push(item);
      }
    }
    stats.itemsFiltered = newItems.length;
    console.log(`[Feed Processor] ${newItems.length} new items after filtering duplicates`);

    if (newItems.length === 0) {
      console.log('[Feed Processor] All items already processed. Exiting.');
      return stats;
    }

    // Step 3: Process with AI (batch)
    console.log('[Feed Processor] Step 3: Processing with Claude Opus 4.5...');
    const processedContent = await processBatch(newItems);
    console.log(`[Feed Processor] AI processing complete: ${processedContent.size} successful`);

    // Step 4: Create ProcessedFeedItems
    const processedItems: ProcessedFeedItem[] = [];
    for (const [itemId, mayaTake] of processedContent.entries()) {
      const rawItem = newItems.find(i => i.id === itemId);
      if (rawItem) {
        processedItems.push(createProcessedItem(rawItem, mayaTake));
      }
    }

    stats.itemsProcessed = processedItems.length;
    stats.itemsFailed = newItems.length - processedItems.length;

    // Step 5: Ingest into database
    console.log('[Feed Processor] Step 4: Ingesting into database...');
    const ingestedCount = await ingestItems(processedItems);
    console.log(`[Feed Processor] Successfully ingested ${ingestedCount}/${processedItems.length} items`);

    console.log('=== Feed Processor Run Complete ===');
    console.log(`[Feed Processor] Summary - Polled: ${stats.itemsPolled}, New: ${stats.itemsFiltered}, Processed: ${stats.itemsProcessed}, Failed: ${stats.itemsFailed}`);

  } catch (error: any) {
    console.error('[Feed Processor] Fatal error during run:', error);
    stats.errors.push(error.message);
  }

  return stats;
}

/**
 * Test run (useful for manual testing)
 */
export async function testRun(): Promise<void> {
  console.log('[Feed Processor] Running test...');
  const testConfig: SourceConfig = {
    ...DEFAULT_CONFIG,
    batchSize: 3, // Small batch for testing
  };

  const stats = await runFeedProcessor(testConfig);
  console.log('[Feed Processor] Test complete:', stats);
}
