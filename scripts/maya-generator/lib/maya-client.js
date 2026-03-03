/**
 * Maya Image Generator - Gemini API Client
 *
 * Handles image generation with reference image support for
 * character consistency using Gemini 3 Pro Image.
 */

import { GoogleGenAI } from '@google/genai';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { buildMayaPrompt, buildReferencePrompt } from './maya-prompts.js';
import { getPlatformConfig } from './maya-presets.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Model configuration
export const MODELS = {
  pro: 'gemini-3-pro-image-preview' // Nano Banana Pro - character consistency support
};

// Default configuration
const DEFAULT_CONFIG = {
  model: MODELS.pro,
  imageSize: '2K',
  maxReferenceImages: 5
};

// Reference images directory
const REFERENCE_DIR = path.join(__dirname, '../reference-images');

/**
 * Initialize the Gemini client
 * @returns {GoogleGenAI} Configured client
 */
function createClient() {
  const apiKey = process.env.GOOGLE_GENAI_API_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      'Missing API key. Set GOOGLE_GENAI_API_KEY or GEMINI_API_KEY environment variable.\n' +
      'Get your API key at: https://aistudio.google.com/apikey'
    );
  }
  return new GoogleGenAI({ apiKey });
}

/**
 * Load reference images from the reference-images directory
 * @param {number} maxImages - Maximum number of reference images to load
 * @returns {Promise<Array>} Array of { filename, base64, mimeType }
 */
export async function loadReferenceImages(maxImages = 5) {
  const references = [];

  try {
    const files = await fs.readdir(REFERENCE_DIR);
    const imageFiles = files.filter(f =>
      /\.(png|jpg|jpeg|webp)$/i.test(f) && !f.startsWith('.')
    );

    if (imageFiles.length === 0) {
      console.warn('Warning: No reference images found in reference-images directory.');
      console.warn('For best results, add 3-5 Maya reference images.');
      return [];
    }

    // Sort to ensure consistent order (prefer numbered or specific named files)
    imageFiles.sort((a, b) => {
      // Prioritize specifically named files
      const priority = ['front', 'portrait', 'three-quarter', 'full-body', 'action', 'profile'];
      const aScore = priority.findIndex(p => a.toLowerCase().includes(p));
      const bScore = priority.findIndex(p => b.toLowerCase().includes(p));
      if (aScore !== -1 && bScore !== -1) return aScore - bScore;
      if (aScore !== -1) return -1;
      if (bScore !== -1) return 1;
      return a.localeCompare(b);
    });

    // Load up to maxImages
    const toLoad = imageFiles.slice(0, maxImages);

    for (const filename of toLoad) {
      const filepath = path.join(REFERENCE_DIR, filename);
      const data = await fs.readFile(filepath);
      const base64 = data.toString('base64');

      // Determine MIME type
      const ext = path.extname(filename).toLowerCase();
      const mimeTypes = {
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.webp': 'image/webp'
      };
      const mimeType = mimeTypes[ext] || 'image/png';

      references.push({ filename, base64, mimeType });
    }

    return references;
  } catch (error) {
    if (error.code === 'ENOENT') {
      console.warn('Warning: reference-images directory not found.');
      return [];
    }
    throw error;
  }
}

/**
 * Check if reference images are available
 * @returns {Promise<boolean>}
 */
export async function hasReferenceImages() {
  const refs = await loadReferenceImages(1);
  return refs.length > 0;
}

/**
 * Generate a Maya image with reference image support
 *
 * @param {Object} options - Generation options
 * @param {string} options.pose - Pose ID
 * @param {string} options.clothing - Clothing preset ID
 * @param {string} options.background - Background preset ID
 * @param {string} options.style - Style preset ID
 * @param {string} options.platform - Platform preset ID (determines aspect ratio)
 * @param {string} options.customPrompt - Additional custom instructions
 * @param {string} options.textOverlay - Text for composition hints
 * @param {string} options.imageSize - Image size (1K, 2K, 4K)
 * @returns {Promise<Buffer>} Image data buffer
 */
export async function generateMayaImage(options = {}) {
  const config = { ...DEFAULT_CONFIG, ...options };
  const client = createClient();

  // Get platform configuration for aspect ratio
  const platformConfig = getPlatformConfig(options.platform || 'instagram-post');

  // Build the text prompt
  const textPrompt = buildMayaPrompt({
    pose: options.pose,
    clothing: options.clothing,
    background: options.background,
    style: options.style,
    customPrompt: options.customPrompt,
    textOverlay: options.textOverlay
  });

  // Load reference images for character consistency
  const references = await loadReferenceImages(config.maxReferenceImages);

  // Build the prompt with reference instructions
  const fullPrompt = references.length > 0
    ? buildReferencePrompt(textPrompt)
    : textPrompt;

  // Build contents array with text and reference images
  const parts = [{ text: fullPrompt }];

  // Add reference images to the request
  for (const ref of references) {
    parts.push({
      inlineData: {
        mimeType: ref.mimeType,
        data: ref.base64
      }
    });
  }

  // Generate the image
  const response = await client.models.generateContent({
    model: config.model || MODELS.pro,
    contents: [{ parts }],
    config: {
      responseModalities: ['TEXT', 'IMAGE'],
      imageConfig: {
        aspectRatio: platformConfig.aspectRatio || '1:1',
        imageSize: config.imageSize || '2K'
      }
    }
  });

  // Extract image data from response
  let imageData = null;

  // Try candidates[0].content.parts
  if (response.candidates?.[0]?.content?.parts) {
    for (const part of response.candidates[0].content.parts) {
      if (part.inlineData?.mimeType?.startsWith('image/')) {
        imageData = part.inlineData.data;
        break;
      }
    }
  }

  // Try response.images (some SDK versions)
  if (!imageData && response.images?.[0]) {
    imageData = response.images[0];
  }

  if (!imageData) {
    // Check if there's a text response (could be error or policy message)
    const textPart = response.candidates?.[0]?.content?.parts?.find(p => p.text);
    if (textPart?.text) {
      throw new Error(`API returned text instead of image: ${textPart.text.substring(0, 300)}`);
    }
    const responseStr = JSON.stringify(response).substring(0, 500);
    throw new Error(`No image data in response: ${responseStr}`);
  }

  return Buffer.from(imageData, 'base64');
}

/**
 * Generate Maya image and save to file
 *
 * @param {Object} options - Generation options (same as generateMayaImage)
 * @param {string} outputPath - Path to save the image
 * @returns {Promise<Object>} { success, path, error }
 */
export async function generateAndSave(options, outputPath) {
  try {
    const imageBuffer = await generateMayaImage(options);

    // Ensure output directory exists
    const outputDir = path.dirname(outputPath);
    await fs.mkdir(outputDir, { recursive: true });

    await fs.writeFile(outputPath, imageBuffer);
    return { success: true, path: outputPath };
  } catch (error) {
    return { success: false, path: outputPath, error: error.message };
  }
}

/**
 * Generate filename for Maya image
 *
 * @param {Object} options - Generation options
 * @param {string} options.platform - Platform ID
 * @param {string} options.pose - Pose ID
 * @param {string} prefix - Optional prefix
 * @returns {string} Generated filename
 */
export function generateFilename(options, prefix = '') {
  const timestamp = new Date().toISOString().split('T')[0];
  const platform = options.platform || 'generic';
  const pose = options.pose || 'default';

  const safePlatform = platform.replace(/[^a-z0-9-]/gi, '-');
  const safePose = pose.replace(/[^a-z0-9-]/gi, '-');

  const parts = [
    prefix && prefix.replace(/[^a-z0-9-]/gi, '-'),
    'maya',
    safePlatform,
    safePose,
    timestamp
  ].filter(Boolean);

  return `${parts.join('-')}.png`;
}

/**
 * Estimate cost for Maya image generation
 *
 * @param {string} size - Image size (1K, 2K, 4K)
 * @param {number} count - Number of images
 * @returns {Object} Cost estimate
 */
export function estimateCost(size = '2K', count = 1) {
  const prices = {
    '1K': 0.134,
    '2K': 0.134,
    '4K': 0.24
  };

  const pricePerImage = prices[size] || prices['2K'];
  const totalCost = count * pricePerImage;

  return {
    count,
    size,
    pricePerImage,
    totalEstimate: totalCost.toFixed(2),
    currency: 'USD'
  };
}

/**
 * Validate that all required setup is complete
 * @returns {Promise<Object>} Validation results
 */
export async function validateSetup() {
  const results = {
    apiKey: false,
    referenceImages: false,
    referenceCount: 0,
    errors: []
  };

  // Check API key
  const apiKey = process.env.GOOGLE_GENAI_API_KEY || process.env.GEMINI_API_KEY;
  results.apiKey = !!apiKey;
  if (!apiKey) {
    results.errors.push('Missing GOOGLE_GENAI_API_KEY or GEMINI_API_KEY environment variable');
  }

  // Check reference images
  const refs = await loadReferenceImages(5);
  results.referenceImages = refs.length >= 3;
  results.referenceCount = refs.length;
  if (refs.length === 0) {
    results.errors.push('No reference images found. Add 3-5 Maya images to reference-images/');
  } else if (refs.length < 3) {
    results.errors.push(`Only ${refs.length} reference images found. Recommend at least 3 for consistency.`);
  }

  return results;
}

export default {
  MODELS,
  loadReferenceImages,
  hasReferenceImages,
  generateMayaImage,
  generateAndSave,
  generateFilename,
  estimateCost,
  validateSetup
};
