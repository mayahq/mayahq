/**
 * Image Utilities for Maya Vision
 *
 * Handles fetching, processing, and validating images for:
 * 1. Claude Vision (Maya seeing uploaded images)
 * 2. Scene Replication (placing Maya in user-uploaded scenes)
 */

import { createClient } from '@supabase/supabase-js';

// Supported image types for Claude Vision
export const SUPPORTED_IMAGE_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp'
] as const;

export type SupportedImageType = typeof SUPPORTED_IMAGE_TYPES[number];

// Maximum image size (4MB for Claude)
export const MAX_IMAGE_SIZE = 4 * 1024 * 1024;

// Maximum images per request
export const MAX_IMAGES_PER_REQUEST = 3;

export interface ProcessedImage {
  base64: string;
  mediaType: SupportedImageType;
  sizeBytes: number;
  sourceUrl?: string;
}

export interface ImageAttachment {
  url: string;
  type?: string;
  name?: string;
  size?: number;
}

/**
 * Check if a MIME type is a supported image type
 */
export function isImageType(mimeType: string | undefined): mimeType is SupportedImageType {
  if (!mimeType) return false;
  return SUPPORTED_IMAGE_TYPES.includes(mimeType as SupportedImageType);
}

/**
 * Detect MIME type from URL extension or content
 */
export function detectMimeType(url: string, providedType?: string): SupportedImageType {
  // Use provided type if valid
  if (providedType && isImageType(providedType)) {
    return providedType;
  }

  // Detect from URL extension
  const extension = url.split('.').pop()?.toLowerCase().split('?')[0];
  switch (extension) {
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'png':
      return 'image/png';
    case 'gif':
      return 'image/gif';
    case 'webp':
      return 'image/webp';
    default:
      return 'image/jpeg'; // Default to JPEG
  }
}

/**
 * Check if an attachment is an image
 */
export function isImageAttachment(attachment: any): attachment is ImageAttachment {
  if (!attachment || !attachment.url) return false;

  // Check explicit type
  if (attachment.type && isImageType(attachment.type)) return true;

  // Check URL for image extensions
  const url = attachment.url.toLowerCase();
  return (
    url.includes('.jpg') ||
    url.includes('.jpeg') ||
    url.includes('.png') ||
    url.includes('.gif') ||
    url.includes('.webp') ||
    url.includes('/image/') ||
    url.includes('image%2F')
  );
}

/**
 * Fetch an image and convert to base64
 * Handles both public URLs and Supabase Storage URLs
 */
export async function fetchImageAsBase64(
  url: string,
  providedType?: string
): Promise<ProcessedImage | null> {
  try {
    console.log(`[VISION] Fetching image: ${url.substring(0, 100)}...`);

    // Check if it's a Supabase Storage URL
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
    const isSupabaseStorage = url.includes(supabaseUrl || 'supabase') &&
                              (url.includes('/storage/') || url.includes('/object/'));

    let response: Response;

    if (isSupabaseStorage) {
      // For Supabase Storage, we might need the service role key for private buckets
      const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      response = await fetch(url, {
        headers: supabaseKey ? { 'Authorization': `Bearer ${supabaseKey}` } : {}
      });
    } else {
      // For external URLs
      response = await fetch(url, {
        headers: {
          'User-Agent': 'Maya-Vision/1.0'
        }
      });
    }

    if (!response.ok) {
      console.error(`[VISION] ❌ FAILED to fetch image: ${response.status} ${response.statusText}`);
      console.error(`[VISION] ❌ URL attempted: ${url}`);
      console.error(`[VISION] ❌ Is Supabase Storage: ${isSupabaseStorage}`);
      return null;
    }

    const contentType = response.headers.get('content-type') || providedType;
    const mediaType = detectMimeType(url, contentType || undefined);

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const sizeBytes = buffer.length;

    // Check size limit
    if (sizeBytes > MAX_IMAGE_SIZE) {
      console.warn(`[VISION] Image too large (${(sizeBytes / 1024 / 1024).toFixed(2)}MB > 4MB), skipping`);
      return null;
    }

    const base64 = buffer.toString('base64');

    console.log(`[VISION] Image fetched: ${mediaType}, ${(sizeBytes / 1024).toFixed(1)}KB`);

    return {
      base64,
      mediaType,
      sizeBytes,
      sourceUrl: url
    };
  } catch (error: any) {
    console.error(`[VISION] Error fetching image:`, error.message);
    return null;
  }
}

/**
 * Process multiple image attachments
 * Returns processed images, limited to MAX_IMAGES_PER_REQUEST
 */
export async function processAttachments(
  attachments: any[]
): Promise<ProcessedImage[]> {
  if (!attachments || !Array.isArray(attachments) || attachments.length === 0) {
    return [];
  }

  console.log(`[VISION] Processing ${attachments.length} attachments...`);

  // Filter to only image attachments
  const imageAttachments = attachments.filter(isImageAttachment);

  if (imageAttachments.length === 0) {
    console.log('[VISION] No image attachments found');
    return [];
  }

  console.log(`[VISION] Found ${imageAttachments.length} image attachments`);

  // Limit to max images
  const toProcess = imageAttachments.slice(0, MAX_IMAGES_PER_REQUEST);
  if (imageAttachments.length > MAX_IMAGES_PER_REQUEST) {
    console.warn(`[VISION] Limiting to ${MAX_IMAGES_PER_REQUEST} images (${imageAttachments.length} provided)`);
  }

  // Fetch all images in parallel
  const results = await Promise.all(
    toProcess.map(async (attachment) => {
      try {
        return await fetchImageAsBase64(attachment.url, attachment.type);
      } catch (error) {
        console.error(`[VISION] Error processing attachment:`, error);
        return null;
      }
    })
  );

  // Filter out failures
  const processedImages = results.filter((img): img is ProcessedImage => img !== null);

  console.log(`[VISION] Successfully processed ${processedImages.length}/${toProcess.length} images`);

  return processedImages;
}

/**
 * Build Claude multimodal content blocks from processed images
 */
export function buildImageContentBlocks(images: ProcessedImage[]): Array<{
  type: 'image';
  source: {
    type: 'base64';
    media_type: SupportedImageType;
    data: string;
  };
}> {
  return images.map(img => ({
    type: 'image' as const,
    source: {
      type: 'base64' as const,
      media_type: img.mediaType,
      data: img.base64
    }
  }));
}

/**
 * Build Gemini inline data parts from processed images
 */
export function buildGeminiImageParts(images: ProcessedImage[]): Array<{
  inlineData: {
    mimeType: string;
    data: string;
  };
}> {
  return images.map(img => ({
    inlineData: {
      mimeType: img.mediaType,
      data: img.base64
    }
  }));
}

/**
 * Detect if a message is asking to generate Maya in a scene
 * (user has uploaded an image + asking for generation)
 */
export function detectSceneReplicationIntent(message: string): boolean {
  const lower = message.toLowerCase();

  // Keywords suggesting scene replication
  const sceneKeywords = [
    'generate you in this',
    'generate yourself in this',
    'put yourself in this',
    'place yourself in this',
    'generate you at this',
    'generate you here',
    'picture of you at this',
    'picture of you in this',
    'photo of you at this',
    'photo of you in this',
    'you in this scene',
    'you in this photo',
    'you in this picture',
    'you at this place',
    'you at this location',
    'what would you look like here',
    'what would you look like in this'
  ];

  return sceneKeywords.some(kw => lower.includes(kw));
}

/**
 * Get the total size of processed images in bytes
 */
export function getTotalImageSize(images: ProcessedImage[]): number {
  return images.reduce((total, img) => total + img.sizeBytes, 0);
}

/**
 * Format image size for logging
 */
export function formatImageSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)}MB`;
}

/**
 * Process a base64 data URL into a ProcessedImage
 * Handles data URLs in format: data:image/jpeg;base64,/9j/4AAQ...
 */
export async function processBase64Image(dataUrl: string): Promise<ProcessedImage | null> {
  try {
    // Parse the data URL
    const matches = dataUrl.match(/^data:([^;]+);base64,(.+)$/);

    if (!matches) {
      console.error('[VISION] Invalid data URL format');
      return null;
    }

    const [, mimeType, base64Data] = matches;

    // Validate mime type
    const mediaType = isImageType(mimeType) ? mimeType : detectMimeType('', mimeType);

    // Calculate size
    const sizeBytes = Math.ceil((base64Data.length * 3) / 4);

    // Check size limit
    if (sizeBytes > MAX_IMAGE_SIZE) {
      console.warn(`[VISION] Base64 image too large (${formatImageSize(sizeBytes)} > 4MB)`);
      return null;
    }

    console.log(`[VISION] Base64 image processed: ${mediaType}, ${formatImageSize(sizeBytes)}`);

    return {
      base64: base64Data,
      mediaType,
      sizeBytes
    };
  } catch (error: any) {
    console.error('[VISION] Error processing base64 image:', error.message);
    return null;
  }
}
