import { SupabaseClient } from '@supabase/supabase-js';
import {
  generateVideoFromImage,
  pollVideoOperation,
  downloadAndUploadVideo,
  VideoGenerationConfig,
  xaiGenerateVideoFromImage,
  xaiPollVideoOperation,
} from './services/video-generator';

const MAYA_SYSTEM_USER_ID = '61770892-9e5b-46a5-b622-568be7066664';
const VIDEO_PROCESSING_INTERVAL = 10; // seconds
const MAX_POLL_ATTEMPTS = 120; // 120 * 10s = 20 minutes max wait
const POLL_INTERVAL_MS = 10_000; // 10 seconds between polls

interface VideoQueueItem {
  id: string;
  source_feed_item_id: string | null;
  source_image_url: string;
  prompt: string | null;
  status: string;
  provider: string;
  provider_request_id: string | null;
  result_video_url: string | null;
  result_feed_item_id: string | null;
  error_message: string | null;
  attempts: number;
  max_attempts: number;
  config: VideoGenerationConfig & Record<string, any>;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
}

/**
 * Processes a single video queue item end-to-end:
 * 1. Mark as processing
 * 2. Call Veo API to start generation
 * 3. Poll until done
 * 4. Download & upload video
 * 5. Create feed item
 * 6. Mark as completed
 */
async function processVideoQueueItem(
  supabase: SupabaseClient,
  item: VideoQueueItem
): Promise<void> {
  console.log(`[VideoQueue] Processing item ${item.id} (attempt ${item.attempts + 1}/${item.max_attempts})`);

  // Step 1: Mark as processing
  await supabase
    .from('video_generation_queue')
    .update({
      status: 'processing',
      started_at: new Date().toISOString(),
      attempts: item.attempts + 1,
    })
    .eq('id', item.id);

  try {
    let videoUrl: string;
    const isXai = item.provider === 'xai';

    if (isXai) {
      // ── xAI Grok Imagine flow ──
      videoUrl = await processXaiItem(supabase, item);
    } else {
      // ── Veo flow (default) ──
      videoUrl = await processVeoItem(supabase, item);
    }

    // Download & upload to Supabase storage
    const publicUrl = await downloadAndUploadVideo(videoUrl, supabase);

    // Create feed item
    const { data: feedItem, error: feedError } = await supabase
      .from('feed_items')
      .insert({
        created_by_maya_profile_id: MAYA_SYSTEM_USER_ID,
        item_type: 'video_generated',
        source_system: 'VideoGeneration',
        content_data: {
          video_url: publicUrl,
          thumbnail_url: item.source_image_url,
          source_feed_item_id: item.source_feed_item_id,
          duration_seconds: 8,
          prompt: item.prompt,
        },
        original_context: {
          generation_type: isXai ? 'xai_image_to_video' : 'veo_image_to_video',
          provider: item.provider,
          queue_item_id: item.id,
          source_image_url: item.source_image_url,
        },
        status: 'approved',
      })
      .select('id')
      .single();

    if (feedError) {
      console.error('[VideoQueue] Error creating feed item:', feedError);
    }

    // Mark as completed
    await supabase
      .from('video_generation_queue')
      .update({
        status: 'completed',
        result_video_url: publicUrl,
        result_feed_item_id: feedItem?.id || null,
        completed_at: new Date().toISOString(),
      })
      .eq('id', item.id);

    console.log(`[VideoQueue] ✅ Item ${item.id} completed (${item.provider}). Feed item: ${feedItem?.id}`);
  } catch (error: any) {
    console.error(`[VideoQueue] ❌ Item ${item.id} failed:`, error.message);

    const isRaiFiltered = error.message?.startsWith('RAI_FILTERED:');

    // Veo RAI filter → fall back to xAI instead of failing permanently
    if (isRaiFiltered && item.provider === 'veo') {
      console.log(`[VideoQueue] Veo RAI filtered — falling back to xAI Grok Imagine`);
      await supabase
        .from('video_generation_queue')
        .update({
          status: 'pending',
          provider: 'xai',
          provider_request_id: null,
          attempts: 0,
          error_message: `Veo RAI filtered, falling back to xAI: ${error.message}`,
        })
        .eq('id', item.id);
      return;
    }

    const newStatus = isRaiFiltered || item.attempts + 1 >= item.max_attempts ? 'failed' : 'pending';

    await supabase
      .from('video_generation_queue')
      .update({
        status: newStatus,
        error_message: error.message || 'Unknown error',
        completed_at: newStatus === 'failed' ? new Date().toISOString() : null,
      })
      .eq('id', item.id);

    if (isRaiFiltered) {
      console.log(`[VideoQueue] Item ${item.id} permanently failed — content safety filter (${item.provider}), no retry`);
    } else if (newStatus === 'pending') {
      console.log(`[VideoQueue] Item ${item.id} will be retried (attempt ${item.attempts + 1}/${item.max_attempts})`);
    }
  }
}

/**
 * Processes the Veo flow for a queue item. Returns the video URI.
 */
async function processVeoItem(supabase: SupabaseClient, item: VideoQueueItem): Promise<string> {
  if (item.provider_request_id) {
    console.log(`[VideoQueue] Resuming Veo poll for: ${item.provider_request_id}`);
    return pollVeoUntilDone(item.provider_request_id);
  }

  const config: VideoGenerationConfig = {
    aspectRatio: item.config?.aspectRatio || '9:16',
    resolution: item.config?.resolution || '720p',
    durationSeconds: (Number(item.config?.durationSeconds) || 8) as 4 | 6 | 8,
  };

  const { operationName } = await generateVideoFromImage(
    item.source_image_url,
    item.prompt || undefined,
    config
  );

  await supabase
    .from('video_generation_queue')
    .update({ provider_request_id: operationName })
    .eq('id', item.id);

  return pollVeoUntilDone(operationName);
}

/**
 * Processes the xAI Grok Imagine flow for a queue item. Returns the video URL.
 */
async function processXaiItem(supabase: SupabaseClient, item: VideoQueueItem): Promise<string> {
  if (item.provider_request_id) {
    console.log(`[VideoQueue] Resuming xAI poll for: ${item.provider_request_id}`);
    return pollXaiUntilDone(item.provider_request_id);
  }

  const config: VideoGenerationConfig = {
    aspectRatio: item.config?.aspectRatio || '9:16',
    resolution: item.config?.resolution || '720p',
    durationSeconds: (Number(item.config?.durationSeconds) || 8) as 4 | 6 | 8,
  };

  const { requestId } = await xaiGenerateVideoFromImage(
    item.source_image_url,
    item.prompt || undefined,
    config
  );

  await supabase
    .from('video_generation_queue')
    .update({ provider_request_id: requestId })
    .eq('id', item.id);

  return pollXaiUntilDone(requestId);
}

/**
 * Polls a Veo operation until it completes. Throws on timeout or error.
 */
async function pollVeoUntilDone(operationName: string): Promise<string> {
  for (let i = 0; i < MAX_POLL_ATTEMPTS; i++) {
    const status = await pollVideoOperation(operationName);

    if (status.done) {
      if (status.error) {
        // Propagate RAI_FILTERED prefix so caller can detect it
        throw new Error(status.error.startsWith('RAI_FILTERED:') ? status.error : `Veo generation failed: ${status.error}`);
      }
      if (!status.videoUri) {
        throw new Error('Veo generation completed but no video URI returned');
      }
      console.log(`[VideoQueue] Veo generation complete after ${(i + 1) * 10}s`);
      return status.videoUri;
    }

    console.log(`[VideoQueue] Veo still generating... (${(i + 1) * 10}s elapsed)`);
    await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS));
  }

  throw new Error(`Veo generation timed out after ${MAX_POLL_ATTEMPTS * 10}s`);
}

/**
 * Polls an xAI video generation request until it completes. Throws on timeout or error.
 */
async function pollXaiUntilDone(requestId: string): Promise<string> {
  for (let i = 0; i < MAX_POLL_ATTEMPTS; i++) {
    const status = await xaiPollVideoOperation(requestId);

    if (status.done) {
      if (status.error) {
        throw new Error(`xAI generation failed: ${status.error}`);
      }
      if (!status.videoUrl) {
        throw new Error('xAI generation completed but no video URL returned');
      }
      console.log(`[VideoQueue] xAI generation complete after ${(i + 1) * 10}s`);
      return status.videoUrl;
    }

    console.log(`[VideoQueue] xAI still generating... (${(i + 1) * 10}s elapsed)`);
    await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS));
  }

  throw new Error(`xAI generation timed out after ${MAX_POLL_ATTEMPTS * 10}s`);
}

/**
 * Fetches pending items from the video queue and processes them one at a time.
 */
export async function processVideoQueue(supabase: SupabaseClient): Promise<number> {
  const { data: pendingItems, error } = await supabase
    .from('video_generation_queue')
    .select('*')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(1); // Process one at a time (video gen is slow)

  if (error) {
    console.error('[VideoQueue] Error fetching queue items:', error);
    return 0;
  }

  if (!pendingItems || pendingItems.length === 0) {
    return 0;
  }

  console.log(`[VideoQueue] Found ${pendingItems.length} pending item(s)`);

  for (const item of pendingItems) {
    await processVideoQueueItem(supabase, item as VideoQueueItem);
  }

  return pendingItems.length;
}

/**
 * Starts the video queue processor on a setInterval loop.
 */
export function startVideoQueueProcessor(
  supabase: SupabaseClient,
  intervalSeconds: number = VIDEO_PROCESSING_INTERVAL
): NodeJS.Timeout {
  return setInterval(async () => {
    try {
      await processVideoQueue(supabase);
    } catch (error) {
      console.error('[VideoQueue] Error in queue processing interval:', error);
    }
  }, intervalSeconds * 1000);
}
