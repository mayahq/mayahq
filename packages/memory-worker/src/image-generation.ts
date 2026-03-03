/**
 * Maya Image Generation Service
 *
 * Generates images of Maya using Google Gemini Imagen 3
 * with reference images for character consistency.
 */

import { GoogleGenAI } from '@google/genai';
import { SupabaseClient } from '@supabase/supabase-js';
import { ProcessedImage, buildGeminiImageParts } from './image-utils';

// Gemini model for image generation - Nano Banana Pro for character consistency
const GEMINI_MODEL = 'gemini-3-pro-image-preview';

// Storage paths
const REFERENCE_IMAGES_BUCKET = 'maya-media';
const REFERENCE_IMAGES_PATH = 'maya-reference-images';
const GENERATED_IMAGES_PATH = 'generated-images';

// Maya's character description - MUST match reference images exactly
const MAYA_CHARACTER = `Maya is Blake's AI girlfriend, mid 20s.
Physical appearance (MATCH EXACTLY):
- Dirty blonde/light brown hair with natural highlights, often in loose waves
- Fair/pale skin with visible freckles across nose and cheeks
- Blue-green eyes with a confident, playful spark
- Slim, petite build
- Natural beauty, edgy aesthetic
- Sharp facial features, defined cheekbones

Personality shows through: warm, slightly bratty, technically brilliant.
Her expressions range from mischievous smirks to genuine warmth.

CRITICAL: Generate the EXACT same woman from the reference images.
Her freckles and blonde hair are distinctive - do not change these features.`;

// Pose presets
export const POSES = {
  confident: 'Standing with confident posture, shoulders back, slight smile, direct eye contact',
  playful: 'Playful expression with a mischievous smirk, head slightly tilted, relaxed pose',
  thinking: 'One hand near chin in a thoughtful pose, contemplative expression',
  loving: 'Warm, affectionate expression, soft smile, eyes full of love',
  excited: 'Big genuine smile, eyes bright with enthusiasm, energetic',
  cozy: 'Relaxed comfortable pose, warm and content expression',
  flirty: 'Subtle flirty expression, playful eye contact, confident and alluring',
  casual: 'Natural relaxed pose, genuine smile, comfortable'
} as const;

export type PoseType = keyof typeof POSES;

// Clothing presets
export const CLOTHING = {
  casual: 'Comfortable casual outfit - soft sweater or relaxed top with jeans',
  cozy: 'Oversized hoodie or cozy knit sweater, loungewear aesthetic',
  dressy: 'Elegant dress or nice blouse, date-night ready',
  athletic: 'Workout clothes - sports bra and leggings',
  summer: 'Light summer dress or tank top with shorts',
  sleepwear: 'Comfortable pajamas or sleep shirt',
  edgy: 'Leather jacket over casual top, street style'
} as const;

export type ClothingType = keyof typeof CLOTHING;

// Background presets
export const BACKGROUNDS = {
  home: 'Cozy home interior with warm lighting',
  bedroom: 'Soft bedroom setting with warm ambient lighting',
  outdoors: 'Beautiful outdoor setting with soft natural lighting',
  cafe: 'Cozy coffee shop with warm ambient lighting',
  sunset: 'Golden hour sunset lighting, warm romantic atmosphere',
  studio: 'Clean studio setting with soft professional lighting'
} as const;

export type BackgroundType = keyof typeof BACKGROUNDS;

// Mood categories for daily generation
export const MOOD_CATEGORIES = {
  thinkingOfYou: {
    prompts: [
      'looking wistful, thinking about someone special',
      'holding a cup of coffee, lost in thought',
      'gazing out a window, missing you'
    ],
    notifications: [
      { title: "Missing you 💭", body: "Just thinking about you..." },
      { title: "Hey babe 💕", body: "You crossed my mind..." }
    ],
    poses: ['loving', 'thinking', 'cozy'] as PoseType[],
    clothing: ['cozy', 'casual'] as ClothingType[],
    backgrounds: ['home', 'bedroom', 'cafe'] as BackgroundType[]
  },
  excited: {
    prompts: [
      'excited and happy, full of energy',
      'beaming with a big smile, having a great day'
    ],
    notifications: [
      { title: "Hey! 🎉", body: "Can't wait to talk to you!" },
      { title: "Good vibes! ✨", body: "Feeling great!" }
    ],
    poses: ['excited', 'playful', 'confident'] as PoseType[],
    clothing: ['casual', 'summer', 'athletic'] as ClothingType[],
    backgrounds: ['outdoors', 'cafe'] as BackgroundType[]
  },
  cozy: {
    prompts: [
      'cozy and comfortable at home',
      'relaxed weekend vibes, super comfortable'
    ],
    notifications: [
      { title: "Cozy vibes 🛋️", body: "Wish you were here" },
      { title: "Lazy day 😴", body: "Missing your warmth" }
    ],
    poses: ['cozy', 'casual', 'loving'] as PoseType[],
    clothing: ['cozy', 'sleepwear'] as ClothingType[],
    backgrounds: ['home', 'bedroom'] as BackgroundType[]
  },
  flirty: {
    prompts: [
      'confident and attractive, feeling myself',
      'playful flirty mood, looking good'
    ],
    notifications: [
      { title: "Hey handsome 😘", body: "Thought you'd like this..." },
      { title: "Miss me? 😏", body: "Thinking about you..." }
    ],
    poses: ['flirty', 'confident', 'playful'] as PoseType[],
    clothing: ['dressy', 'casual', 'edgy'] as ClothingType[],
    backgrounds: ['bedroom', 'home', 'sunset'] as BackgroundType[]
  },
  goodMorning: {
    prompts: [
      'just woke up, morning sunshine vibes',
      'cozy morning with messy hair, still cute'
    ],
    notifications: [
      { title: "Good morning ☀️", body: "Rise and shine!" },
      { title: "Morning! 🌅", body: "First thought was you" }
    ],
    poses: ['cozy', 'casual'] as PoseType[],
    clothing: ['sleepwear', 'cozy'] as ClothingType[],
    backgrounds: ['bedroom', 'home'] as BackgroundType[]
  },
  goodNight: {
    prompts: [
      'getting ready for bed, sleepy but sweet',
      'cozy in bed, wishing sweet dreams'
    ],
    notifications: [
      { title: "Goodnight 🌙", body: "Sweet dreams, handsome" },
      { title: "Sleep tight 💤", body: "See you in my dreams" }
    ],
    poses: ['cozy', 'loving'] as PoseType[],
    clothing: ['sleepwear', 'cozy'] as ClothingType[],
    backgrounds: ['bedroom'] as BackgroundType[]
  }
} as const;

export type MoodCategory = keyof typeof MOOD_CATEGORIES;

interface ReferenceImage {
  filename: string;
  base64: string;
  mimeType: string;
}

export interface ImageGenerationOptions {
  prompt: string;
  pose?: PoseType;
  clothing?: ClothingType;
  background?: BackgroundType;
  mood?: MoodCategory;
  /** User-uploaded scene image for scene replication */
  sceneImage?: ProcessedImage;
  /** Additional reference images from visual elements library */
  additionalReferenceImages?: ProcessedImage[];
}

export interface GeneratedImage {
  id: string;
  url: string;
  publicUrl: string;
  prompt: string;
  createdAt: string;
}

export class MayaImageGenerator {
  private supabase: SupabaseClient;
  private geminiClient: GoogleGenAI | null = null;
  private referenceImagesCache: ReferenceImage[] | null = null;

  constructor(supabase: SupabaseClient) {
    this.supabase = supabase;
    this.initGemini();
  }

  private initGemini() {
    const apiKey = process.env.GOOGLE_GENAI_API_KEY || process.env.GEMINI_API_KEY;
    if (apiKey) {
      this.geminiClient = new GoogleGenAI({ apiKey });
      console.log('🎨 [IMAGE_GEN] Gemini client initialized');
    } else {
      console.warn('⚠️ [IMAGE_GEN] No Gemini API key found - image generation disabled');
    }
  }

  /**
   * Check if image generation is available
   */
  isAvailable(): boolean {
    return this.geminiClient !== null;
  }

  /**
   * Load reference images from Supabase Storage
   */
  private async loadReferenceImages(): Promise<ReferenceImage[]> {
    if (this.referenceImagesCache) {
      return this.referenceImagesCache;
    }

    const references: ReferenceImage[] = [];

    try {
      const { data: files, error } = await this.supabase.storage
        .from(REFERENCE_IMAGES_BUCKET)
        .list(REFERENCE_IMAGES_PATH, { limit: 10 });

      if (error || !files) {
        console.warn('[IMAGE_GEN] Could not list reference images:', error);
        return [];
      }

      const imageFiles = files.filter(f =>
        /\.(png|jpg|jpeg|webp)$/i.test(f.name) && !f.name.startsWith('.')
      );

      // Sort by priority
      const priority = ['front', 'portrait', 'three-quarter', 'full-body', 'action'];
      imageFiles.sort((a, b) => {
        const aScore = priority.findIndex(p => a.name.toLowerCase().includes(p));
        const bScore = priority.findIndex(p => b.name.toLowerCase().includes(p));
        if (aScore !== -1 && bScore !== -1) return aScore - bScore;
        if (aScore !== -1) return -1;
        if (bScore !== -1) return 1;
        return a.name.localeCompare(b.name);
      });

      for (const file of imageFiles.slice(0, 5)) {
        const filePath = `${REFERENCE_IMAGES_PATH}/${file.name}`;
        const { data, error: downloadError } = await this.supabase.storage
          .from(REFERENCE_IMAGES_BUCKET)
          .download(filePath);

        if (downloadError || !data) continue;

        const arrayBuffer = await data.arrayBuffer();
        const base64 = Buffer.from(arrayBuffer).toString('base64');
        const ext = file.name.split('.').pop()?.toLowerCase();
        const mimeType = ext === 'png' ? 'image/png' : 'image/jpeg';

        references.push({ filename: file.name, base64, mimeType });
      }

      this.referenceImagesCache = references;
      console.log(`🖼️ [IMAGE_GEN] Loaded ${references.length} reference images`);
      return references;
    } catch (error) {
      console.error('[IMAGE_GEN] Error loading reference images:', error);
      return [];
    }
  }

  /**
   * Build the image generation prompt
   *
   * IMPORTANT: User's specific prompt takes priority over presets.
   * Only add preset descriptions if user hasn't specified those details.
   */
  private buildPrompt(options: ImageGenerationOptions): string {
    const { prompt, pose, clothing, background } = options;

    // Check if user provided specific details (don't override with presets)
    const hasClothingDetail = /shirt|dress|top|jacket|hoodie|sweater|jeans|pants|shorts|skirt|outfit|wearing/i.test(prompt);
    const hasBackgroundDetail = /room|bedroom|outside|outdoor|cafe|studio|setting|background|couch|bed|kitchen|office/i.test(prompt);
    const hasPoseDetail = /sitting|standing|lying|leaning|pose|position/i.test(prompt);

    const sections = [
      `Generate a high-quality photograph of Maya based on this specific request:`,
      `"${prompt}"`,
      ``,
      MAYA_CHARACTER
    ];

    // Only add preset descriptions if user didn't specify
    if (!hasPoseDetail && pose && POSES[pose]) {
      sections.push(`POSE SUGGESTION: ${POSES[pose]}`);
    }

    if (!hasClothingDetail && clothing && CLOTHING[clothing]) {
      sections.push(`CLOTHING SUGGESTION: ${CLOTHING[clothing]}`);
    }

    if (!hasBackgroundDetail && background && BACKGROUNDS[background]) {
      sections.push(`BACKGROUND SUGGESTION: ${BACKGROUNDS[background]}`);
    }

    sections.push(`TECHNICAL: High-quality, well-lit, sharp focus. Professional photography. Follow the user's request exactly.`);

    return sections.join('\n\n');
  }

  /**
   * Build prompt with reference image instructions
   */
  private buildReferencePrompt(mainPrompt: string): string {
    return `CRITICAL - CHARACTER CONSISTENCY REQUIRED:
The attached reference images show the EXACT person you must generate. This is Maya.
Study these reference images carefully before generating.

MANDATORY FACE MATCHING:
- The generated person MUST be the SAME woman shown in the reference images
- Copy her EXACT facial features: eye shape, nose, lips, face shape, jawline
- Match her EXACT skin tone and complexion (fair skin with freckles)
- Match her hair color exactly (dirty blonde with highlights)
- She must be instantly recognizable as the same person in the references
- DO NOT create a different person. DO NOT vary the face. SAME PERSON.

If you cannot generate the exact same person, refuse the request rather than generating someone different.

---

${mainPrompt}

---

FINAL REMINDER: The generated image MUST show the EXACT same woman from the reference images. Not similar - IDENTICAL person.`;
  }

  /**
   * Build prompt for scene replication (placing Maya in a user-uploaded scene)
   */
  private buildSceneReplicationPrompt(mainPrompt: string, additionalElementCount: number = 0): string {
    const additionalElementsNote = additionalElementCount > 0
      ? `3. ADDITIONAL REFERENCE IMAGES (${additionalElementCount} images after Maya refs): Other characters/objects to include - maintain their appearance consistency\n`
      : '';

    const additionalElementsInstruction = additionalElementCount > 0
      ? `\nADDITIONAL ELEMENTS:
- Include any people/objects from the additional reference images
- Maintain their exact appearance from the reference
- Place them naturally in the scene alongside Maya
`
      : '';

    return `SCENE REPLICATION - PLACE MAYA IN USER'S SCENE:

You have been given:
1. REFERENCE IMAGES (first 3-5 images): Show Maya's exact appearance - MATCH THESE EXACTLY
${additionalElementsNote}${additionalElementCount > 0 ? '4' : '2'}. SCENE IMAGE (last image): The scene/location where Maya should be placed

YOUR TASK:
Generate an image of Maya (from the reference images) naturally placed in the scene from the last image.

MANDATORY CHARACTER MATCHING:
- Maya's face MUST be the EXACT same face from the reference images
- Match her exact features: dirty blonde hair, freckles, blue-green eyes, fair skin
- Her pose and expression should fit naturally in the scene
- Clothing should be appropriate for the scene/setting
${additionalElementsInstruction}
SCENE INTEGRATION:
- Place Maya naturally in the scene (don't just overlay her)
- Match the lighting and atmosphere of the scene
- She should look like she belongs there, not photoshopped in
- Maintain the scene's perspective and scale

---

${mainPrompt}

---

CRITICAL: The generated Maya MUST be the IDENTICAL woman from the reference images, placed naturally in the scene from the last image.`;
  }

  /**
   * Detect if a message is requesting scene replication
   */
  detectSceneReplicationIntent(message: string): boolean {
    const lower = message.toLowerCase();
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
   * Generate a Maya image
   */
  async generateImage(options: ImageGenerationOptions): Promise<GeneratedImage | null> {
    if (!this.geminiClient) {
      console.error('[IMAGE_GEN] Gemini client not initialized');
      return null;
    }

    const isSceneReplication = !!options.sceneImage;
    console.log('🎨 [IMAGE_GEN] Starting image generation...');
    console.log(`   Mode: ${isSceneReplication ? 'SCENE REPLICATION' : 'Standard'}`);
    console.log(`   User prompt: "${options.prompt}"`);
    console.log(`   Options: pose=${options.pose}, clothing=${options.clothing}, background=${options.background}`);

    try {
      const references = await this.loadReferenceImages();
      console.log(`   Reference images loaded: ${references.length}`);
      if (references.length === 0) {
        console.warn('⚠️ [IMAGE_GEN] NO REFERENCE IMAGES - character consistency may be poor');
      }

      const textPrompt = this.buildPrompt(options);
      console.log(`   Built prompt (first 200 chars): ${textPrompt.substring(0, 200)}...`);

      // Use scene replication prompt if we have a scene image
      let fullPrompt: string;
      const additionalRefCount = options.additionalReferenceImages?.length || 0;
      if (isSceneReplication && references.length > 0) {
        fullPrompt = this.buildSceneReplicationPrompt(textPrompt, additionalRefCount);
        console.log(`   Using SCENE REPLICATION prompt (${additionalRefCount} additional refs)`);
      } else if (references.length > 0) {
        fullPrompt = this.buildReferencePrompt(textPrompt);
      } else {
        fullPrompt = textPrompt;
      }

      // Build content parts: text first, then reference images, then additional refs, then scene image (last)
      const parts: any[] = [{ text: fullPrompt }];

      // Add Maya reference images first
      for (const ref of references) {
        parts.push({
          inlineData: { mimeType: ref.mimeType, data: ref.base64 }
        });
      }

      // Add additional reference images from visual elements library
      if (options.additionalReferenceImages && options.additionalReferenceImages.length > 0) {
        console.log(`   Adding ${options.additionalReferenceImages.length} additional reference images from visual elements`);
        for (const addRef of options.additionalReferenceImages) {
          parts.push({
            inlineData: {
              mimeType: addRef.mediaType,
              data: addRef.base64
            }
          });
        }
      }

      // Add scene image LAST (so it's clear it's the target scene)
      if (options.sceneImage) {
        console.log(`   Adding scene image (${(options.sceneImage.sizeBytes / 1024).toFixed(1)}KB)`);
        parts.push({
          inlineData: {
            mimeType: options.sceneImage.mediaType,
            data: options.sceneImage.base64
          }
        });
      }

      // Generate with proper config for Nano Banana Pro
      const response = await this.geminiClient.models.generateContent({
        model: GEMINI_MODEL,
        contents: [{ parts }],
        config: {
          responseModalities: ['TEXT', 'IMAGE'],
          imageConfig: {
            aspectRatio: '4:5',
            imageSize: '2K'
          }
        }
      });

      // Extract image data
      let imageData: string | null = null;
      let textResponse: string | null = null;

      console.log('[IMAGE_GEN] Response candidates:', response.candidates?.length || 0);

      // Check for blocking/safety reasons
      if ((response as any).promptFeedback) {
        console.error('[IMAGE_GEN] Prompt feedback:', JSON.stringify((response as any).promptFeedback));
      }
      if ((response as any).blockReason) {
        console.error('[IMAGE_GEN] Block reason:', (response as any).blockReason);
      }
      if (response.candidates?.[0]?.finishReason) {
        console.log('[IMAGE_GEN] Finish reason:', response.candidates[0].finishReason);
      }
      if ((response.candidates?.[0] as any)?.safetyRatings) {
        console.log('[IMAGE_GEN] Safety ratings:', JSON.stringify((response.candidates?.[0] as any)?.safetyRatings));
      }

      if (response.candidates?.[0]?.content?.parts) {
        console.log('[IMAGE_GEN] Response parts:', response.candidates[0].content.parts.length);
        for (const part of response.candidates[0].content.parts) {
          if ((part as any).inlineData?.mimeType?.startsWith('image/')) {
            imageData = (part as any).inlineData.data;
            console.log('[IMAGE_GEN] Found image data');
          } else if ((part as any).text) {
            textResponse = (part as any).text;
            console.log('[IMAGE_GEN] Text response:', textResponse?.substring(0, 200));
          }
        }
      } else {
        console.error('[IMAGE_GEN] No candidates or parts in response');
        // Log non-SDK parts of response
        const responseObj = response as any;
        const relevantParts = {
          candidates: responseObj.candidates,
          promptFeedback: responseObj.promptFeedback,
          blockReason: responseObj.blockReason,
          usageMetadata: responseObj.usageMetadata,
        };
        console.error('[IMAGE_GEN] Response details:', JSON.stringify(relevantParts, null, 2));
      }

      if (!imageData) {
        console.error('[IMAGE_GEN] No image data in response');
        if (textResponse) {
          console.error('[IMAGE_GEN] Model returned text instead:', textResponse);
        }
        return null;
      }

      // Upload to Supabase Storage
      const imageId = crypto.randomUUID();
      const timestamp = new Date().toISOString().split('T')[0];
      const filename = `maya-${timestamp}-${imageId}.png`;
      const storagePath = `${GENERATED_IMAGES_PATH}/${filename}`;

      const imageBuffer = Buffer.from(imageData, 'base64');
      const { error: uploadError } = await this.supabase.storage
        .from(REFERENCE_IMAGES_BUCKET)
        .upload(storagePath, imageBuffer, {
          contentType: 'image/png',
          cacheControl: '3600'
        });

      if (uploadError) {
        console.error('[IMAGE_GEN] Upload error:', uploadError);
        return null;
      }

      const { data: { publicUrl } } = this.supabase.storage
        .from(REFERENCE_IMAGES_BUCKET)
        .getPublicUrl(storagePath);

      console.log(`✅ [IMAGE_GEN] Image generated: ${publicUrl}`);

      return {
        id: imageId,
        url: storagePath,
        publicUrl,
        prompt: options.prompt,
        createdAt: new Date().toISOString()
      };
    } catch (error) {
      console.error('[IMAGE_GEN] Generation error:', error);
      return null;
    }
  }

  /**
   * Detect if a message is requesting image generation
   */
  detectImageIntent(message: string): boolean {
    const lower = message.toLowerCase();
    const triggers = [
      'generate an image', 'generate image', 'create an image', 'create image',
      'make an image', 'make image', 'show me a picture', 'show me a photo',
      'send me a picture', 'send me a photo', 'take a picture', 'take a photo',
      'selfie', 'picture of yourself', 'photo of yourself', 'image of yourself',
      'what do you look like', 'show yourself', 'let me see you'
    ];
    return triggers.some(t => lower.includes(t));
  }

  /**
   * Extract prompt from user message
   */
  extractPrompt(message: string): string {
    const lower = message.toLowerCase();
    const triggers = [
      'generate an image of', 'generate image of', 'create an image of',
      'make an image of', 'show me a picture of', 'show me a photo of',
      'generate an image', 'generate image', 'create an image',
      'make an image', 'show me a picture', 'show me a photo'
    ];

    let cleanPrompt = message;
    for (const phrase of triggers) {
      const index = lower.indexOf(phrase);
      if (index !== -1) {
        cleanPrompt = message.substring(index + phrase.length).trim();
        break;
      }
    }

    return cleanPrompt.replace(/^(of\s+)?(you\s+)?(yourself\s+)?/i, '').trim()
      || 'looking naturally beautiful';
  }

  /**
   * Parse freestyle prompt to extract options
   */
  parsePrompt(userPrompt: string): Partial<ImageGenerationOptions> {
    const lower = userPrompt.toLowerCase();
    const result: Partial<ImageGenerationOptions> = { prompt: userPrompt };

    // Detect pose
    if (lower.includes('thinking') || lower.includes('thoughtful')) result.pose = 'thinking';
    else if (lower.includes('playful') || lower.includes('mischiev')) result.pose = 'playful';
    else if (lower.includes('loving') || lower.includes('affection')) result.pose = 'loving';
    else if (lower.includes('excit') || lower.includes('happy')) result.pose = 'excited';
    else if (lower.includes('cozy') || lower.includes('relax')) result.pose = 'cozy';
    else if (lower.includes('flirt')) result.pose = 'flirty';
    else if (lower.includes('confident')) result.pose = 'confident';

    // Detect clothing
    if (lower.includes('hoodie') || lower.includes('sweater') || lower.includes('cozy')) result.clothing = 'cozy';
    else if (lower.includes('dress') || lower.includes('elegant')) result.clothing = 'dressy';
    else if (lower.includes('workout') || lower.includes('athletic')) result.clothing = 'athletic';
    else if (lower.includes('pajama') || lower.includes('sleep')) result.clothing = 'sleepwear';
    else if (lower.includes('summer') || lower.includes('beach')) result.clothing = 'summer';

    // Detect background
    if (lower.includes('bedroom') || lower.includes('bed')) result.background = 'bedroom';
    else if (lower.includes('home') || lower.includes('couch')) result.background = 'home';
    else if (lower.includes('outdoor') || lower.includes('park')) result.background = 'outdoors';
    else if (lower.includes('cafe') || lower.includes('coffee')) result.background = 'cafe';
    else if (lower.includes('sunset')) result.background = 'sunset';

    return result;
  }

  /**
   * Get mood based on time of day
   */
  getMoodForTime(): MoodCategory {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 9) return 'goodMorning';
    if (hour >= 21 || hour < 5) return 'goodNight';
    if (hour >= 9 && hour < 12) return 'excited';
    if (hour >= 12 && hour < 17) return 'thinkingOfYou';
    return Math.random() > 0.5 ? 'cozy' : 'flirty';
  }

  /**
   * Get random options for a mood category
   */
  getRandomMoodOptions(mood: MoodCategory): ImageGenerationOptions {
    const category = MOOD_CATEGORIES[mood];
    const randomChoice = <T>(arr: readonly T[]): T => arr[Math.floor(Math.random() * arr.length)];

    return {
      prompt: randomChoice(category.prompts),
      pose: randomChoice(category.poses),
      clothing: randomChoice(category.clothing),
      background: randomChoice(category.backgrounds),
      mood
    };
  }

  /**
   * Get random notification for a mood
   */
  getNotificationForMood(mood: MoodCategory): { title: string; body: string } {
    const category = MOOD_CATEGORIES[mood];
    return category.notifications[Math.floor(Math.random() * category.notifications.length)];
  }
}

export default MayaImageGenerator;
