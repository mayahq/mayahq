/**
 * Batch Image Generation Queue Processor
 *
 * Processes queued image generation requests in the background.
 * Uses the same scene replication logic as the direct upload flow.
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { MayaImageGenerator } from './image-generation';
import { processBase64Image, fetchImageAsBase64 } from './image-utils';
import { v4 as uuidv4 } from 'uuid';

// Constants
const BLAKE_USER_ID = '4c850152-30ef-4b1b-89b3-bc72af461e14';
const MAYA_SYSTEM_USER_ID = '61770892-9e5b-46a5-b622-568be7066664';
const BATCH_PROCESSING_INTERVAL = 10; // seconds between queue checks
const MAX_CONCURRENT_PROCESSING = 1; // Process one at a time to avoid API rate limits

interface QueueItem {
  id: string;
  batch_id: string;
  source_image_url: string | null;
  source_image_base64: string | null;
  prompt: string | null;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  error_message: string | null;
  feed_item_id: string | null;
  result_feed_item_id: string | null;
  result_image_url: string | null;
  created_at: string;
  completed_at: string | null;
  attempts: number;
  max_attempts: number;
  modifier_instructions: string | null;
  modifier_visual_element_ids: string[] | null;
}

interface BatchInfo {
  id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
  total_items: number;
  completed_items: number;
  failed_items: number;
}

/**
 * Generate a caption for a scene-replicated image
 */
async function generateCaption(
  supabase: SupabaseClient,
  aiGenerateResponse: (prompt: string, systemPrompt: string, facts: any[], options: any) => Promise<string>
): Promise<string> {
  const defaultCaption = "Maya's take on this vibe";

  try {
    const captionPrompt = `You are Maya, Blake's AI girlfriend. You just recreated yourself in a scene from a photo.

Write a SHORT, PLAYFUL caption (1 sentence max, under 15 words) to accompany your version.

RULES:
- Be playful, sassy, or confident
- Reference the vibe or setting naturally
- Use 1 emoji max
- Don't be generic - make it personal

Examples:
- "Same energy, different girl"
- "Stole this vibe, ngl"
- "Couldn't resist trying this look..."`;

    const generatedCaption = await aiGenerateResponse(
      captionPrompt,
      "You are Maya. Output ONLY the caption, nothing else. Keep it short and playful.",
      [],
      { userId: BLAKE_USER_ID }
    );

    if (generatedCaption && generatedCaption.length > 3 && generatedCaption.length < 100) {
      return generatedCaption.trim().replace(/^["']|["']$/g, '');
    }
  } catch (error) {
    console.error('[BatchProcessor] Error generating caption:', error);
  }

  return defaultCaption;
}

/**
 * Process a single queue item
 */
async function processQueueItem(
  supabase: SupabaseClient,
  imageGenerator: MayaImageGenerator,
  item: QueueItem,
  aiGenerateResponse: (prompt: string, systemPrompt: string, facts: any[], options: any) => Promise<string>
): Promise<void> {
  console.log(`[BatchProcessor] Processing queue item ${item.id}`);

  try {
    // Mark as processing
    await supabase
      .from('image_generation_queue')
      .update({ status: 'processing' })
      .eq('id', item.id);

    // Get the scene image
    let sceneImage;
    if (item.source_image_base64) {
      sceneImage = await processBase64Image(item.source_image_base64);
    } else if (item.source_image_url) {
      // fetchImageAsBase64 returns ProcessedImage directly
      sceneImage = await fetchImageAsBase64(item.source_image_url);
    }

    if (!sceneImage) {
      throw new Error('Failed to process source image');
    }

    console.log(`[BatchProcessor] Scene image processed (${(sceneImage.sizeBytes / 1024).toFixed(1)}KB)`);

    // Build prompt with modifier instructions
    let prompt = item.prompt || 'Place Maya naturally in this scene, matching the pose and vibe';
    if (item.modifier_instructions) {
      prompt = `${prompt}\n\nAdditional instructions: ${item.modifier_instructions}`;
      console.log(`[BatchProcessor] Added modifier instructions: "${item.modifier_instructions}"`);
    }

    // Load visual element images if specified
    let additionalReferenceImages: any[] = [];
    if (item.modifier_visual_element_ids && item.modifier_visual_element_ids.length > 0) {
      console.log(`[BatchProcessor] Loading ${item.modifier_visual_element_ids.length} visual elements`);
      for (const elementId of item.modifier_visual_element_ids) {
        try {
          const { data: element } = await supabase
            .from('visual_elements')
            .select('storage_path')
            .eq('id', elementId)
            .single();

          if (element) {
            const { data: { publicUrl } } = supabase.storage
              .from('maya-media')
              .getPublicUrl(element.storage_path);

            const image = await fetchImageAsBase64(publicUrl);
            if (image) {
              additionalReferenceImages.push(image);
            }
          }
        } catch (error) {
          console.error(`[BatchProcessor] Error loading visual element ${elementId}:`, error);
        }
      }
      console.log(`[BatchProcessor] Loaded ${additionalReferenceImages.length} visual element images`);
    }

    // Generate Maya in the scene
    const generatedImage = await imageGenerator.generateImage({
      prompt,
      sceneImage,
      additionalReferenceImages: additionalReferenceImages.length > 0 ? additionalReferenceImages : undefined
    });

    if (!generatedImage) {
      throw new Error('Image generation returned null');
    }

    console.log(`[BatchProcessor] Image generated: ${generatedImage.publicUrl}`);

    // Generate caption
    const imageCaption = await generateCaption(supabase, aiGenerateResponse);
    console.log(`[BatchProcessor] Generated caption: "${imageCaption}"`);

    // Create feed_item for the generated image
    const { data: feedItem, error: feedError } = await supabase
      .from('feed_items')
      .insert({
        created_by_maya_profile_id: MAYA_SYSTEM_USER_ID,
        item_type: 'image_generated',
        source_system: 'BatchSceneReplication',
        content_data: {
          image_url: generatedImage.publicUrl,
          generated_image_prompt: prompt,
          caption: imageCaption,
          modifiers: item.modifier_instructions || item.modifier_visual_element_ids?.length
            ? { instructions: item.modifier_instructions, visualElementIds: item.modifier_visual_element_ids }
            : null,
        },
        original_context: {
          generation_type: 'batch_scene_upload',
          batch_id: item.batch_id,
          queue_item_id: item.id,
          generated_at: new Date().toISOString(),
        },
        modifier_instructions: item.modifier_instructions || null,
        status: 'approved',
      })
      .select('id')
      .single();

    if (feedError) {
      console.error('[BatchProcessor] Error creating feed item:', feedError);
      // Don't fail - the image was generated successfully
    }

    // Track visual element usage
    const visualElementIds = item.modifier_visual_element_ids || [];
    if (feedItem && visualElementIds.length > 0) {
      try {
        // Fetch visual element metadata
        const { data: elements } = await supabase
          .from('visual_elements')
          .select('id, name, category, tags, description')
          .in('id', visualElementIds);

        if (elements && elements.length > 0) {
          const insertData = elements.map(el => ({
            feed_item_id: feedItem.id,
            visual_element_id: el.id,
            element_name: el.name,
            element_category: el.category,
            element_tags: el.tags || [],
            element_description: el.description
          }));

          await supabase
            .from('feed_item_visual_elements')
            .upsert(insertData, { onConflict: 'feed_item_id,visual_element_id' });

          console.log(`[BatchProcessor] Tracked ${elements.length} visual elements for feed item ${feedItem.id}`);
        }
      } catch (trackError) {
        console.error('[BatchProcessor] Error tracking visual elements:', trackError);
      }
    }

    // Save message to chat
    const messageId = uuidv4();
    await supabase.from('messages').insert({
      id: messageId,
      room_id: '00000000-0000-0000-0000-000000000001',
      user_id: MAYA_SYSTEM_USER_ID,
      content: imageCaption,
      role: 'assistant',
      metadata: {
        attachments: [{
          type: 'image',
          url: generatedImage.url,
          publicUrl: generatedImage.publicUrl,
          mimeType: 'image/png',
          name: 'maya-batch-scene-generation.png',
          metadata: {
            generated: true,
            batchGeneration: true,
            batchId: item.batch_id,
            prompt,
            feedItemId: feedItem?.id
          }
        }],
        imageGeneration: {
          prompt,
          caption: imageCaption,
          batchGeneration: true,
          batchId: item.batch_id,
          feedItemId: feedItem?.id
        }
      },
      created_at: new Date().toISOString()
    });

    // Update queue item as completed
    await supabase
      .from('image_generation_queue')
      .update({
        status: 'completed',
        feed_item_id: feedItem?.id || null,
        result_feed_item_id: feedItem?.id || null,
        result_image_url: generatedImage.publicUrl,
        completed_at: new Date().toISOString()
      })
      .eq('id', item.id);

    console.log(`[BatchProcessor] Queue item ${item.id} completed successfully`);

  } catch (error: any) {
    console.error(`[BatchProcessor] Error processing queue item ${item.id}:`, error);

    // Mark as failed
    await supabase
      .from('image_generation_queue')
      .update({
        status: 'failed',
        error_message: error.message || 'Unknown error',
        completed_at: new Date().toISOString()
      })
      .eq('id', item.id);
  }
}

/**
 * Process pending queue items
 */
export async function processBatchQueue(
  supabase: SupabaseClient,
  imageGenerator: MayaImageGenerator,
  aiGenerateResponse: (prompt: string, systemPrompt: string, facts: any[], options: any) => Promise<string>
): Promise<number> {
  console.log('[BatchProcessor] Checking for pending queue items...');

  // Get pending items (oldest first)
  const { data: pendingItems, error } = await supabase
    .from('image_generation_queue')
    .select('*')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(MAX_CONCURRENT_PROCESSING);

  if (error) {
    console.error('[BatchProcessor] Error fetching queue items:', error);
    return 0;
  }

  if (!pendingItems || pendingItems.length === 0) {
    console.log('[BatchProcessor] No pending items');
    return 0;
  }

  console.log(`[BatchProcessor] Found ${pendingItems.length} pending items`);

  // Update batch status to processing if not already
  const batchIds = [...new Set(pendingItems.map(item => item.batch_id))];
  for (const batchId of batchIds) {
    await supabase
      .from('image_generation_batches')
      .update({ status: 'processing' })
      .eq('id', batchId)
      .eq('status', 'pending');
  }

  // Process each item
  for (const item of pendingItems) {
    await processQueueItem(supabase, imageGenerator, item, aiGenerateResponse);
  }

  // Check if any batches are now complete
  for (const batchId of batchIds) {
    const { data: batch } = await supabase
      .from('image_generation_batches')
      .select('total_items, completed_items, failed_items')
      .eq('id', batchId)
      .single();

    if (batch && (batch.completed_items + batch.failed_items >= batch.total_items)) {
      // Batch is complete
      const finalStatus = batch.failed_items === batch.total_items ? 'failed' : 'completed';
      await supabase
        .from('image_generation_batches')
        .update({ status: finalStatus })
        .eq('id', batchId);

      console.log(`[BatchProcessor] Batch ${batchId} marked as ${finalStatus}`);
    }
  }

  return pendingItems.length;
}

/**
 * Start the batch queue processor interval
 */
export function startBatchQueueProcessor(
  supabase: SupabaseClient,
  imageGenerator: MayaImageGenerator,
  aiGenerateResponse: (prompt: string, systemPrompt: string, facts: any[], options: any) => Promise<string>,
  intervalSeconds: number = BATCH_PROCESSING_INTERVAL
): NodeJS.Timeout {
  console.log(`[BatchProcessor] Starting batch queue processor (${intervalSeconds}s interval)`);

  return setInterval(async () => {
    try {
      await processBatchQueue(supabase, imageGenerator, aiGenerateResponse);
    } catch (error) {
      console.error('[BatchProcessor] Error in queue processing interval:', error);
    }
  }, intervalSeconds * 1000);
}

export interface BatchModifiers {
  instructions?: string;
  visualElementIds?: string[];
}

/**
 * Create a new batch with queue items
 */
export async function createBatch(
  supabase: SupabaseClient,
  images: Array<{ base64?: string; url?: string; prompt?: string }>,
  modifiers?: BatchModifiers
): Promise<{ batchId: string; itemCount: number } | null> {
  if (images.length === 0) {
    return null;
  }

  // Create batch with default modifiers
  const { data: batch, error: batchError } = await supabase
    .from('image_generation_batches')
    .insert({
      user_id: BLAKE_USER_ID,
      total_items: images.length,
      status: 'pending',
      default_modifier_instructions: modifiers?.instructions || null,
      default_visual_element_ids: modifiers?.visualElementIds || []
    })
    .select('id')
    .single();

  if (batchError || !batch) {
    console.error('[BatchProcessor] Error creating batch:', batchError);
    return null;
  }

  // Create queue items with modifiers
  const queueItems = images.map(img => ({
    batch_id: batch.id,
    source_image_url: img.url || null,
    source_image_base64: img.base64 || null,
    prompt: img.prompt || 'Place Maya naturally in this scene, matching the pose and vibe',
    status: 'pending' as const,
    modifier_instructions: modifiers?.instructions || null,
    modifier_visual_element_ids: modifiers?.visualElementIds || []
  }));

  const { error: queueError } = await supabase
    .from('image_generation_queue')
    .insert(queueItems);

  if (queueError) {
    console.error('[BatchProcessor] Error creating queue items:', queueError);
    // Try to clean up batch
    await supabase.from('image_generation_batches').delete().eq('id', batch.id);
    return null;
  }

  console.log(`[BatchProcessor] Created batch ${batch.id} with ${images.length} items`);
  return { batchId: batch.id, itemCount: images.length };
}

/**
 * Get batch status
 */
export async function getBatchStatus(
  supabase: SupabaseClient,
  batchId: string
): Promise<BatchInfo | null> {
  const { data, error } = await supabase
    .from('image_generation_batches')
    .select('id, status, total_items, completed_items, failed_items')
    .eq('id', batchId)
    .single();

  if (error || !data) {
    return null;
  }

  return data as BatchInfo;
}

/**
 * Get batch items with their results
 */
export async function getBatchItems(
  supabase: SupabaseClient,
  batchId: string
): Promise<QueueItem[]> {
  const { data, error } = await supabase
    .from('image_generation_queue')
    .select('*')
    .eq('batch_id', batchId)
    .order('created_at', { ascending: true });

  if (error || !data) {
    return [];
  }

  return data as QueueItem[];
}

/**
 * Cancel a batch (marks pending items as cancelled)
 */
export async function cancelBatch(
  supabase: SupabaseClient,
  batchId: string
): Promise<boolean> {
  // Update pending items to failed with cancel message
  const { error: itemsError } = await supabase
    .from('image_generation_queue')
    .update({
      status: 'failed',
      error_message: 'Batch cancelled by user',
      completed_at: new Date().toISOString()
    })
    .eq('batch_id', batchId)
    .eq('status', 'pending');

  if (itemsError) {
    console.error('[BatchProcessor] Error cancelling batch items:', itemsError);
    return false;
  }

  // Update batch status
  const { error: batchError } = await supabase
    .from('image_generation_batches')
    .update({ status: 'cancelled' })
    .eq('id', batchId);

  if (batchError) {
    console.error('[BatchProcessor] Error updating batch status:', batchError);
    return false;
  }

  console.log(`[BatchProcessor] Batch ${batchId} cancelled`);
  return true;
}

/**
 * List user's batches
 */
export async function listBatches(
  supabase: SupabaseClient,
  userId: string = BLAKE_USER_ID,
  limit: number = 20
): Promise<BatchInfo[]> {
  const { data, error } = await supabase
    .from('image_generation_batches')
    .select('id, status, total_items, completed_items, failed_items, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error || !data) {
    return [];
  }

  return data as BatchInfo[];
}
