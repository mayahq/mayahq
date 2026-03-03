/**
 * Fix Blank Feed Entries Script
 * Reprocesses existing HackerNews feed items that have blank or malformed content
 */

import { createClient } from '@mayahq/supabase-client';
import { processContent } from './processors/content-processor';
import { RawFeedItem } from './types';

/**
 * Find feed items with blank or missing processed_content
 */
async function findBlankEntries(): Promise<any[]> {
  console.log('[Fix Blank Entries] Searching for blank/malformed entries...');
  const supabase = createClient();

  try {
    // Find HackerNews items where processed_content is missing or empty
    // Using a simpler approach - just get recent HN items and filter in JS
    const { data, error } = await supabase
      .from('feed_items')
      .select('*')
      .eq('source_system', 'HackerNews')
      .order('created_at', { ascending: false })
      .limit(200); // Get more and filter client-side

    if (error) {
      console.error('[Fix Blank Entries] Error querying database:', error);
      return [];
    }

    // Filter client-side for blank/missing processed_content
    const blankEntries = (data || []).filter(item => {
      const contentData = item.content_data as any;
      const processedContent = contentData?.processed_content;
      return !processedContent || String(processedContent).trim() === '' || processedContent === 'null';
    });

    console.log(`[Fix Blank Entries] Found ${blankEntries.length} blank entries out of ${data?.length || 0} total`);
    return blankEntries;
  } catch (error) {
    console.error('[Fix Blank Entries] Error in findBlankEntries:', error);
    return [];
  }
}

/**
 * Convert database feed item to RawFeedItem format
 */
function convertToRawItem(dbItem: any): RawFeedItem | null {
  try {
    const contentData = dbItem.content_data || {};
    const sourceMetadata = contentData.source_metadata || {};

    // Need at least a title
    if (!contentData.original_title && !contentData.title) {
      console.warn(`[Fix Blank Entries] Item ${dbItem.id} has no title, skipping`);
      return null;
    }

    return {
      id: dbItem.original_context?.source_identifier || dbItem.id,
      title: contentData.original_title || contentData.title || 'Unknown Title',
      url: contentData.url || contentData.hn_url,
      text: contentData.text || '',
      author: sourceMetadata.author || 'unknown',
      score: sourceMetadata.score || 0,
      comment_count: sourceMetadata.comment_count || 0,
      timestamp: new Date(dbItem.created_at).getTime() / 1000,
      source: 'hackernews',
      metadata: {
        hn_url: contentData.hn_url,
        original_db_id: dbItem.id,
      },
    };
  } catch (error) {
    console.error(`[Fix Blank Entries] Error converting item ${dbItem.id}:`, error);
    return null;
  }
}

/**
 * Update a feed item with newly generated content
 */
async function updateFeedItem(dbId: string, processedContent: string): Promise<boolean> {
  const supabase = createClient();

  try {
    // Get the current item
    const { data: currentItem, error: fetchError } = await supabase
      .from('feed_items')
      .select('content_data')
      .eq('id', dbId)
      .single();

    if (fetchError || !currentItem) {
      console.error(`[Fix Blank Entries] Error fetching item ${dbId}:`, fetchError);
      return false;
    }

    // Update with new processed_content
    const updatedContentData = {
      ...(currentItem.content_data as Record<string, any>),
      processed_content: processedContent,
    };

    const { error: updateError } = await supabase
      .from('feed_items')
      .update({
        content_data: updatedContentData,
        updated_at: new Date().toISOString(),
      })
      .eq('id', dbId);

    if (updateError) {
      console.error(`[Fix Blank Entries] Error updating item ${dbId}:`, updateError);
      return false;
    }

    console.log(`[Fix Blank Entries] ✓ Updated item ${dbId}`);
    return true;
  } catch (error) {
    console.error(`[Fix Blank Entries] Error in updateFeedItem for ${dbId}:`, error);
    return false;
  }
}

/**
 * Main function to fix blank entries
 */
export async function fixBlankEntries(batchSize: number = 20): Promise<void> {
  console.log('=== Fix Blank Entries Script Started ===');

  const blankEntries = await findBlankEntries();

  if (blankEntries.length === 0) {
    console.log('[Fix Blank Entries] No blank entries found. Exiting.');
    return;
  }

  console.log(`[Fix Blank Entries] Processing ${Math.min(batchSize, blankEntries.length)} entries...`);

  let successCount = 0;
  let failCount = 0;
  const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  const entriesToProcess = blankEntries.slice(0, batchSize);

  for (let i = 0; i < entriesToProcess.length; i++) {
    const entry = entriesToProcess[i];
    console.log(`\n[Fix Blank Entries] [${i + 1}/${entriesToProcess.length}] Processing item ${entry.id}`);

    try {
      // Convert to RawFeedItem
      const rawItem = convertToRawItem(entry);
      if (!rawItem) {
        failCount++;
        continue;
      }

      console.log(`[Fix Blank Entries] Title: "${rawItem.title}"`);

      // Process with AI
      const processedContent = await processContent(rawItem);

      // Update in database
      const updated = await updateFeedItem(entry.id, processedContent);

      if (updated) {
        successCount++;
        console.log(`[Fix Blank Entries] ✓ Successfully fixed item ${entry.id}`);
      } else {
        failCount++;
      }

      // Delay to respect rate limits
      if (i < entriesToProcess.length - 1) {
        await delay(1500); // 1.5 seconds between requests
      }

    } catch (error: any) {
      console.error(`[Fix Blank Entries] Failed to process item ${entry.id}:`, error.message);
      failCount++;
    }
  }

  console.log('\n=== Fix Blank Entries Script Complete ===');
  console.log(`[Fix Blank Entries] Success: ${successCount}, Failed: ${failCount}`);

  if (blankEntries.length > batchSize) {
    console.log(`[Fix Blank Entries] Note: ${blankEntries.length - batchSize} entries remain. Run again to process more.`);
  }
}

/**
 * Run the script
 */
if (require.main === module) {
  fixBlankEntries(20)
    .then(() => {
      console.log('[Fix Blank Entries] Script finished');
      process.exit(0);
    })
    .catch((error) => {
      console.error('[Fix Blank Entries] Script failed:', error);
      process.exit(1);
    });
}
