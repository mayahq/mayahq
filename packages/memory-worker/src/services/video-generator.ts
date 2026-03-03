import { SupabaseClient } from '@supabase/supabase-js';

const GOOGLE_GENAI_API_KEY = process.env.GOOGLE_GENAI_API_KEY;
const XAI_API_KEY = process.env.XAI_API_KEY;
const VEO_MODEL = 'veo-3.1-generate-preview';
const VEO_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';
const XAI_BASE_URL = 'https://api.x.ai/v1';
const STORAGE_BUCKET = 'maya-media';
const GENERATED_VIDEOS_PATH = 'generated-videos';

export interface VideoGenerationConfig {
  aspectRatio?: '16:9' | '9:16';
  resolution?: '720p' | '1080p';
  durationSeconds?: 4 | 6 | 8;
}

export interface VideoGenerationResult {
  operationName: string;
}

export interface VideoOperationStatus {
  done: boolean;
  videoUri?: string;
  error?: string;
}

const DEFAULT_CONFIG: VideoGenerationConfig = {
  aspectRatio: '9:16',
  resolution: '720p',
  durationSeconds: 8,
};

/**
 * Downloads an image from a URL and returns the raw buffer + mime type.
 */
async function downloadImage(imageUrl: string): Promise<{ buffer: Buffer; mimeType: string }> {
  const response = await fetch(imageUrl);
  if (!response.ok) {
    throw new Error(`Failed to download image: ${response.status} ${response.statusText}`);
  }

  const contentType = response.headers.get('content-type') || 'image/jpeg';
  const arrayBuffer = await response.arrayBuffer();

  return { buffer: Buffer.from(arrayBuffer), mimeType: contentType };
}

/**
 * Calls Veo 3.1 image-to-video API. Returns an operation name for polling.
 *
 * Veo predictLongRunning uses bytesBase64Encoded (not inlineData or fileData).
 */
export async function generateVideoFromImage(
  imageUrl: string,
  prompt?: string,
  config?: VideoGenerationConfig
): Promise<VideoGenerationResult> {
  if (!GOOGLE_GENAI_API_KEY) {
    throw new Error('GOOGLE_GENAI_API_KEY is not set');
  }

  const mergedConfig = { ...DEFAULT_CONFIG, ...config };

  // Download the source image
  console.log(`[VideoGen] Downloading source image: ${imageUrl.substring(0, 80)}...`);
  const { buffer, mimeType } = await downloadImage(imageUrl);
  const base64 = buffer.toString('base64');
  console.log(`[VideoGen] Downloaded image: ${(buffer.length / 1024).toFixed(0)}KB (${mimeType})`);

  // Call Veo with bytesBase64Encoded (Vertex AI / predictLongRunning format)
  const requestBody: any = {
    instances: [{
      prompt: prompt || 'Subtle natural motion, cinematic quality',
      image: {
        bytesBase64Encoded: base64,
        mimeType: mimeType,
      },
    }],
    parameters: {
      aspectRatio: mergedConfig.aspectRatio,
      resolution: mergedConfig.resolution,
      durationSeconds: mergedConfig.durationSeconds,
    },
  };

  console.log(`[VideoGen] Calling Veo 3.1 API (${mergedConfig.aspectRatio}, ${mergedConfig.resolution}, ${mergedConfig.durationSeconds}s)...`);

  const response = await fetch(
    `${VEO_BASE_URL}/models/${VEO_MODEL}:predictLongRunning`,
    {
      method: 'POST',
      headers: {
        'x-goog-api-key': GOOGLE_GENAI_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    }
  );

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Veo API error (${response.status}): ${errorBody}`);
  }

  const result = await response.json();
  const operationName = result.name;

  if (!operationName) {
    throw new Error('Veo API did not return an operation name');
  }

  console.log(`[VideoGen] Operation started: ${operationName}`);
  return { operationName };
}

/**
 * Polls a Veo operation until done. Returns the video URI.
 */
export async function pollVideoOperation(operationName: string): Promise<VideoOperationStatus> {
  if (!GOOGLE_GENAI_API_KEY) {
    throw new Error('GOOGLE_GENAI_API_KEY is not set');
  }

  const response = await fetch(
    `${VEO_BASE_URL}/${operationName}`,
    {
      headers: {
        'x-goog-api-key': GOOGLE_GENAI_API_KEY,
      },
    }
  );

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Veo poll error (${response.status}): ${errorBody}`);
  }

  const result = await response.json();

  if (result.error) {
    return { done: true, error: result.error.message || JSON.stringify(result.error) };
  }

  if (!result.done) {
    return { done: false };
  }

  // Log full response structure for debugging
  console.log('[VideoGen] Poll complete response:', JSON.stringify(result, null, 2));

  const generateVideoResponse = result.response?.generateVideoResponse;
  const raiFiltered = generateVideoResponse?.raiMediaFilteredCount;
  if (raiFiltered) {
    const reasons = generateVideoResponse?.raiMediaFilteredReasons?.join('; ') || 'Unknown reason';
    return { done: true, error: `RAI_FILTERED: ${reasons}` };
  }

  const videoUri = generateVideoResponse?.generatedSamples?.[0]?.video?.uri;
  if (!videoUri) {
    return { done: true, error: `No video URI in response. Keys: ${JSON.stringify(Object.keys(result.response || {}))}` };
  }

  return { done: true, videoUri };
}

/**
 * Downloads video from Google's temporary URI and uploads to Supabase storage.
 * Returns the public URL. Supports both Google (requires API key) and external URLs.
 */
export async function downloadAndUploadVideo(
  videoUri: string,
  supabase: SupabaseClient
): Promise<string> {
  console.log(`[VideoGen] Downloading generated video...`);

  const headers: Record<string, string> = {};
  if (videoUri.includes('googleapis.com')) {
    if (!GOOGLE_GENAI_API_KEY) {
      throw new Error('GOOGLE_GENAI_API_KEY is not set');
    }
    headers['x-goog-api-key'] = GOOGLE_GENAI_API_KEY;
  }

  const downloadResponse = await fetch(videoUri, { headers });

  if (!downloadResponse.ok) {
    throw new Error(`Failed to download video: ${downloadResponse.status}`);
  }

  const videoBuffer = Buffer.from(await downloadResponse.arrayBuffer());
  console.log(`[VideoGen] Downloaded video: ${(videoBuffer.length / 1024 / 1024).toFixed(1)}MB`);

  // Upload to Supabase Storage
  const videoId = crypto.randomUUID();
  const timestamp = new Date().toISOString().split('T')[0];
  const filename = `video-${timestamp}-${videoId}.mp4`;
  const storagePath = `${GENERATED_VIDEOS_PATH}/${filename}`;

  const { error: uploadError } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(storagePath, videoBuffer, {
      contentType: 'video/mp4',
      cacheControl: '3600',
    });

  if (uploadError) {
    throw new Error(`Failed to upload video to storage: ${uploadError.message}`);
  }

  const { data: { publicUrl } } = supabase.storage
    .from(STORAGE_BUCKET)
    .getPublicUrl(storagePath);

  console.log(`[VideoGen] Video uploaded: ${publicUrl}`);
  return publicUrl;
}

// ──────────────────────────────────────────────
// xAI Grok Imagine Video
// ──────────────────────────────────────────────

export interface XaiVideoGenerationResult {
  requestId: string;
}

export interface XaiVideoOperationStatus {
  done: boolean;
  videoUrl?: string;
  error?: string;
}

/**
 * Calls xAI Grok Imagine Video API (image-to-video). Returns a request ID for polling.
 */
export async function xaiGenerateVideoFromImage(
  imageUrl: string,
  prompt?: string,
  config?: VideoGenerationConfig
): Promise<XaiVideoGenerationResult> {
  if (!XAI_API_KEY) {
    throw new Error('XAI_API_KEY is not set');
  }

  const mergedConfig = { ...DEFAULT_CONFIG, ...config };

  // For image-to-video, omit aspect_ratio so xAI auto-detects from the input image
  const requestBody: Record<string, any> = {
    model: 'grok-imagine-video',
    prompt: prompt || 'Subtle natural motion, cinematic quality',
    image: { url: imageUrl },
    duration: mergedConfig.durationSeconds ?? 8,
  };

  console.log(`[VideoGen] Calling xAI Grok Imagine Video (auto aspect ratio, ${mergedConfig.durationSeconds}s)...`);

  const response = await fetch(`${XAI_BASE_URL}/videos/generations`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${XAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`xAI Video API error (${response.status}): ${errorBody}`);
  }

  const result = await response.json();
  const requestId = result.request_id;

  if (!requestId) {
    throw new Error(`xAI Video API did not return a request ID. Response: ${JSON.stringify(result)}`);
  }

  console.log(`[VideoGen] xAI request started: ${requestId}`);
  return { requestId };
}

/**
 * Polls an xAI video generation request until done.
 */
export async function xaiPollVideoOperation(requestId: string): Promise<XaiVideoOperationStatus> {
  if (!XAI_API_KEY) {
    throw new Error('XAI_API_KEY is not set');
  }

  const response = await fetch(`${XAI_BASE_URL}/videos/${requestId}`, {
    headers: {
      'Authorization': `Bearer ${XAI_API_KEY}`,
    },
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`xAI poll error (${response.status}): ${errorBody}`);
  }

  const result = await response.json();

  console.log('[VideoGen] xAI poll response:', JSON.stringify(result, null, 2));

  // xAI returns video.url directly when done — no status field
  const videoUrl = result.video?.url;
  if (videoUrl) {
    return { done: true, videoUrl };
  }

  if (result.status === 'expired') {
    return { done: true, error: 'xAI video generation expired' };
  }

  if (result.status === 'failed' || result.error) {
    return { done: true, error: result.error?.message || result.error || 'xAI generation failed' };
  }

  // Still processing
  return { done: false };
}
