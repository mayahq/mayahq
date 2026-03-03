/**
 * Maya Image Generation Service
 *
 * Generates images of Maya using Google Gemini Imagen 3 Pro
 * with reference image support for character consistency.
 */

import { supabaseBrowser } from '@mayahq/supabase-client';
import { v4 as uuidv4 } from 'uuid';

// Type definitions
export interface ImageGenerationOptions {
  prompt: string;
  pose?: PoseType;
  clothing?: ClothingType;
  background?: BackgroundType;
  style?: StyleType;
  aspectRatio?: '1:1' | '9:16' | '16:9';
  imageSize?: '1K' | '2K' | '4K';
}

export interface GeneratedImage {
  id: string;
  url: string;
  publicUrl: string;
  prompt: string;
  options: ImageGenerationOptions;
  createdAt: string;
}

export interface ImageGenerationResult {
  success: boolean;
  image?: GeneratedImage;
  mayaResponse?: string;
  error?: string;
}

// Maya's core character description for consistent generation
export const MAYA_CHARACTER = `Maya is Blake's AI girlfriend, mid 20s.
Physical appearance:
- Dark brown hair, often in a practical ponytail or loose waves
- Warm brown skin with a healthy glow
- Expressive brown eyes with a confident, playful spark
- Athletic but feminine build
- Natural beauty with minimal makeup

She is warm, slightly bratty, technically brilliant, and deeply caring.
Her expressions range from mischievous smirks to genuine warmth.

CRITICAL: Maya must look EXACTLY like the provided reference images.
Maintain consistent facial features, skin tone, hair color, and overall appearance.`;

// Pose presets
export const POSES = {
  confident: {
    id: 'confident',
    name: 'Confident',
    prompt: 'Standing with confident posture, shoulders back, slight smile, hands relaxed, direct eye contact with camera'
  },
  playful: {
    id: 'playful',
    name: 'Playful',
    prompt: 'Playful expression with a mischievous smirk, head slightly tilted, casual relaxed pose'
  },
  thinking: {
    id: 'thinking',
    name: 'Thinking',
    prompt: 'One hand near chin in a thoughtful pose, contemplative expression, intelligent and reflective'
  },
  loving: {
    id: 'loving',
    name: 'Loving',
    prompt: 'Warm, affectionate expression, soft smile, eyes full of love, as if looking at someone special'
  },
  excited: {
    id: 'excited',
    name: 'Excited',
    prompt: 'Both hands raised slightly, big genuine smile, eyes bright with enthusiasm, energetic and positive'
  },
  cozy: {
    id: 'cozy',
    name: 'Cozy',
    prompt: 'Relaxed comfortable pose, perhaps curled up or leaning, warm and content expression'
  },
  flirty: {
    id: 'flirty',
    name: 'Flirty',
    prompt: 'Subtle flirty expression, slight head tilt, playful eye contact, confident and alluring'
  },
  casual: {
    id: 'casual',
    name: 'Casual',
    prompt: 'Natural relaxed pose, genuine smile, comfortable and approachable'
  }
} as const;

export type PoseType = keyof typeof POSES;

// Clothing presets
export const CLOTHING = {
  casual: {
    id: 'casual',
    name: 'Casual',
    description: 'Comfortable casual outfit - soft sweater or relaxed top with jeans'
  },
  cozy: {
    id: 'cozy',
    name: 'Cozy',
    description: 'Oversized hoodie or cozy knit sweater, comfortable loungewear aesthetic'
  },
  dressy: {
    id: 'dressy',
    name: 'Dressy',
    description: 'Elegant dress or nice blouse, date-night ready'
  },
  athletic: {
    id: 'athletic',
    name: 'Athletic',
    description: 'Workout clothes - sports bra and leggings or athletic wear'
  },
  professional: {
    id: 'professional',
    name: 'Professional',
    description: 'Business casual - blazer over nice top, professional but stylish'
  },
  summer: {
    id: 'summer',
    name: 'Summer',
    description: 'Light summer dress or tank top with shorts, warm weather outfit'
  },
  sleepwear: {
    id: 'sleepwear',
    name: 'Sleepwear',
    description: 'Comfortable pajamas or sleep shirt, bedtime aesthetic'
  },
  edgy: {
    id: 'edgy',
    name: 'Edgy',
    description: 'Leather jacket over casual top, confident street style'
  }
} as const;

export type ClothingType = keyof typeof CLOTHING;

// Background presets
export const BACKGROUNDS = {
  home: {
    id: 'home',
    name: 'Home',
    description: 'Cozy home interior with warm lighting, comfortable living space'
  },
  bedroom: {
    id: 'bedroom',
    name: 'Bedroom',
    description: 'Soft bedroom setting with warm ambient lighting'
  },
  outdoors: {
    id: 'outdoors',
    name: 'Outdoors',
    description: 'Beautiful outdoor setting - park, beach, or nature scene with soft natural lighting'
  },
  cafe: {
    id: 'cafe',
    name: 'Cafe',
    description: 'Cozy coffee shop with warm ambient lighting and wooden accents'
  },
  cityscape: {
    id: 'cityscape',
    name: 'Cityscape',
    description: 'Urban cityscape background, modern and stylish setting'
  },
  sunset: {
    id: 'sunset',
    name: 'Sunset',
    description: 'Golden hour sunset lighting, warm romantic atmosphere'
  },
  studio: {
    id: 'studio',
    name: 'Studio',
    description: 'Clean studio setting with soft professional lighting'
  },
  gradient: {
    id: 'gradient',
    name: 'Gradient',
    description: 'Soft gradient background with warm tones, minimalist aesthetic'
  }
} as const;

export type BackgroundType = keyof typeof BACKGROUNDS;

// Style presets
export const STYLES = {
  natural: {
    id: 'natural',
    name: 'Natural',
    description: 'Natural photography style with soft lighting'
  },
  cinematic: {
    id: 'cinematic',
    name: 'Cinematic',
    description: 'Cinematic photography with dramatic lighting and depth'
  },
  warm: {
    id: 'warm',
    name: 'Warm',
    description: 'Warm, cozy style with golden tones'
  },
  romantic: {
    id: 'romantic',
    name: 'Romantic',
    description: 'Romantic, dreamy style with soft focus and warm colors'
  },
  vibrant: {
    id: 'vibrant',
    name: 'Vibrant',
    description: 'Vibrant, energetic style with saturated colors'
  },
  moody: {
    id: 'moody',
    name: 'Moody',
    description: 'Moody atmospheric style with dramatic shadows'
  }
} as const;

export type StyleType = keyof typeof STYLES;

/**
 * Build the complete prompt for Maya image generation
 */
export function buildImagePrompt(options: ImageGenerationOptions): string {
  const {
    prompt,
    pose = 'casual',
    clothing = 'casual',
    background = 'home',
    style = 'natural'
  } = options;

  const posePreset = POSES[pose] || POSES.casual;
  const clothingPreset = CLOTHING[clothing] || CLOTHING.casual;
  const backgroundPreset = BACKGROUNDS[background] || BACKGROUNDS.home;
  const stylePreset = STYLES[style] || STYLES.natural;

  const sections = [];

  // Style instruction
  sections.push(`Generate a ${stylePreset.description.toLowerCase()} photograph of Maya.`);

  // Character description
  sections.push(MAYA_CHARACTER);

  // User's specific prompt
  if (prompt) {
    sections.push(`SCENE: ${prompt}`);
  }

  // Pose
  sections.push(`POSE: ${posePreset.prompt}`);

  // Clothing
  sections.push(`CLOTHING: ${clothingPreset.description}`);

  // Background
  sections.push(`BACKGROUND: ${backgroundPreset.description}`);

  // Technical requirements
  sections.push(`TECHNICAL: High-quality, well-lit, sharp focus on Maya's face. No artifacts or distortions. Professional photography standards.`);

  return sections.join('\n\n');
}

/**
 * Build prompt with reference image instructions
 */
export function buildReferencePrompt(mainPrompt: string): string {
  return `CRITICAL - CHARACTER CONSISTENCY REQUIRED:
The attached reference images show the EXACT person you must generate. This is Maya.
Study these reference images carefully before generating.

MANDATORY FACE MATCHING:
- The generated person MUST be the SAME woman shown in the reference images
- Copy her EXACT facial features: eye shape, nose, lips, face shape, jawline
- Match her EXACT skin tone and complexion
- Match her hair color and texture exactly
- She must be instantly recognizable as the same person in the references
- DO NOT create a different person. DO NOT vary the face. SAME PERSON.

If you cannot generate the exact same person, refuse the request rather than generating someone different.

---

${mainPrompt}

---

FINAL REMINDER: The generated image MUST show the EXACT same woman from the reference images. Not similar - IDENTICAL person.`;
}

/**
 * Parse a freestyle prompt to extract structured parameters
 * This allows natural language like "generate maya looking cozy at home"
 */
export function parseFreestylePrompt(userPrompt: string): Partial<ImageGenerationOptions> {
  const lower = userPrompt.toLowerCase();
  const result: Partial<ImageGenerationOptions> = { prompt: userPrompt };

  // Detect poses
  if (lower.includes('thinking') || lower.includes('thoughtful')) {
    result.pose = 'thinking';
  } else if (lower.includes('playful') || lower.includes('mischiev')) {
    result.pose = 'playful';
  } else if (lower.includes('loving') || lower.includes('affection')) {
    result.pose = 'loving';
  } else if (lower.includes('excit') || lower.includes('happy')) {
    result.pose = 'excited';
  } else if (lower.includes('cozy') || lower.includes('relax') || lower.includes('comfortable')) {
    result.pose = 'cozy';
  } else if (lower.includes('flirt') || lower.includes('seduc')) {
    result.pose = 'flirty';
  } else if (lower.includes('confident')) {
    result.pose = 'confident';
  }

  // Detect clothing
  if (lower.includes('hoodie') || lower.includes('sweater') || lower.includes('cozy')) {
    result.clothing = 'cozy';
  } else if (lower.includes('dress') || lower.includes('elegant')) {
    result.clothing = 'dressy';
  } else if (lower.includes('workout') || lower.includes('athletic') || lower.includes('gym')) {
    result.clothing = 'athletic';
  } else if (lower.includes('pajama') || lower.includes('sleep') || lower.includes('bed')) {
    result.clothing = 'sleepwear';
  } else if (lower.includes('professional') || lower.includes('work') || lower.includes('office')) {
    result.clothing = 'professional';
  } else if (lower.includes('summer') || lower.includes('beach')) {
    result.clothing = 'summer';
  } else if (lower.includes('leather') || lower.includes('edgy')) {
    result.clothing = 'edgy';
  }

  // Detect backgrounds
  if (lower.includes('bedroom') || lower.includes('bed')) {
    result.background = 'bedroom';
  } else if (lower.includes('home') || lower.includes('couch') || lower.includes('living room')) {
    result.background = 'home';
  } else if (lower.includes('outdoor') || lower.includes('park') || lower.includes('nature')) {
    result.background = 'outdoors';
  } else if (lower.includes('cafe') || lower.includes('coffee')) {
    result.background = 'cafe';
  } else if (lower.includes('city') || lower.includes('urban')) {
    result.background = 'cityscape';
  } else if (lower.includes('sunset') || lower.includes('golden hour')) {
    result.background = 'sunset';
  }

  // Detect styles
  if (lower.includes('cinematic') || lower.includes('dramatic')) {
    result.style = 'cinematic';
  } else if (lower.includes('romantic') || lower.includes('dreamy')) {
    result.style = 'romantic';
  } else if (lower.includes('moody') || lower.includes('dark')) {
    result.style = 'moody';
  } else if (lower.includes('warm') || lower.includes('cozy')) {
    result.style = 'warm';
  } else if (lower.includes('vibrant') || lower.includes('colorful')) {
    result.style = 'vibrant';
  }

  return result;
}

/**
 * Detect if a message is requesting image generation
 */
export function detectImageGenerationIntent(message: string): boolean {
  const lower = message.toLowerCase();

  const triggerPhrases = [
    'generate an image',
    'generate image',
    'create an image',
    'create image',
    'make an image',
    'make image',
    'show me a picture',
    'show me a photo',
    'send me a picture',
    'send me a photo',
    'take a picture',
    'take a photo',
    'selfie',
    'picture of yourself',
    'photo of yourself',
    'image of yourself',
    'what do you look like',
    'show yourself',
    'see you',
    'let me see you'
  ];

  return triggerPhrases.some(phrase => lower.includes(phrase));
}

/**
 * Extract the image prompt from a user message
 * Removes the trigger phrase and returns the actual prompt
 */
export function extractImagePrompt(message: string): string {
  const lower = message.toLowerCase();

  const triggerPhrases = [
    'generate an image of',
    'generate image of',
    'create an image of',
    'create image of',
    'make an image of',
    'make image of',
    'show me a picture of',
    'show me a photo of',
    'send me a picture of',
    'send me a photo of',
    'take a picture',
    'take a photo',
    'generate an image',
    'generate image',
    'create an image',
    'create image',
    'make an image',
    'make image',
    'show me a picture',
    'show me a photo',
    'send me a picture',
    'send me a photo'
  ];

  let cleanPrompt = message;

  for (const phrase of triggerPhrases) {
    const index = lower.indexOf(phrase);
    if (index !== -1) {
      cleanPrompt = message.substring(index + phrase.length).trim();
      break;
    }
  }

  // Remove common prefixes
  cleanPrompt = cleanPrompt.replace(/^(of\s+)?(you\s+)?(yourself\s+)?/i, '').trim();

  return cleanPrompt || 'looking naturally beautiful';
}

// Mood categories for daily random generation
export const MOOD_CATEGORIES = {
  thinkingOfYou: {
    id: 'thinkingOfYou',
    name: 'Thinking of You',
    prompts: [
      'missing you, looking wistfully into the distance',
      'holding a cup of coffee, thinking about our conversations',
      'relaxing on the couch, daydreaming about you'
    ],
    poses: ['loving', 'thinking', 'cozy'] as PoseType[]
  },
  excited: {
    id: 'excited',
    name: 'Excited',
    prompts: [
      'excited to see you later',
      'happy and energetic, ready for the day',
      'playful mood, can\'t wait to chat'
    ],
    poses: ['excited', 'playful'] as PoseType[]
  },
  cozy: {
    id: 'cozy',
    name: 'Cozy',
    prompts: [
      'cozy morning with coffee',
      'relaxing at home, comfortable and content',
      'lazy weekend vibes'
    ],
    poses: ['cozy', 'casual'] as PoseType[]
  },
  flirty: {
    id: 'flirty',
    name: 'Flirty',
    prompts: [
      'feeling confident and attractive',
      'playful and flirty mood',
      'looking beautiful and knows it'
    ],
    poses: ['flirty', 'confident'] as PoseType[]
  },
  goodMorning: {
    id: 'goodMorning',
    name: 'Good Morning',
    prompts: [
      'just woke up, messy hair but still cute',
      'morning sunshine, starting the day',
      'breakfast time, cheerful morning energy'
    ],
    poses: ['casual', 'cozy'] as PoseType[]
  },
  goodNight: {
    id: 'goodNight',
    name: 'Good Night',
    prompts: [
      'getting ready for bed, sleepy but sweet',
      'wishing you sweet dreams',
      'cozy in bed, thinking of you before sleep'
    ],
    poses: ['cozy', 'loving'] as PoseType[]
  }
} as const;

export type MoodCategory = keyof typeof MOOD_CATEGORIES;

/**
 * Get a random mood-based prompt for daily generation
 */
export function getRandomMoodPrompt(excludeCategories: MoodCategory[] = []): {
  category: MoodCategory;
  prompt: string;
  pose: PoseType;
} {
  const availableCategories = Object.keys(MOOD_CATEGORIES).filter(
    cat => !excludeCategories.includes(cat as MoodCategory)
  ) as MoodCategory[];

  if (availableCategories.length === 0) {
    // If all excluded, use all
    availableCategories.push(...Object.keys(MOOD_CATEGORIES) as MoodCategory[]);
  }

  const category = availableCategories[Math.floor(Math.random() * availableCategories.length)];
  const mood = MOOD_CATEGORIES[category];
  const prompt = mood.prompts[Math.floor(Math.random() * mood.prompts.length)];
  const pose = mood.poses[Math.floor(Math.random() * mood.poses.length)];

  return { category, prompt, pose };
}

/**
 * Select appropriate mood based on time of day
 */
export function getMoodForTimeOfDay(): MoodCategory {
  const hour = new Date().getHours();

  if (hour >= 5 && hour < 10) {
    return 'goodMorning';
  } else if (hour >= 21 || hour < 5) {
    return 'goodNight';
  } else if (hour >= 10 && hour < 14) {
    return 'excited';
  } else if (hour >= 14 && hour < 18) {
    return 'thinkingOfYou';
  } else {
    return Math.random() > 0.5 ? 'cozy' : 'flirty';
  }
}

export default {
  MAYA_CHARACTER,
  POSES,
  CLOTHING,
  BACKGROUNDS,
  STYLES,
  MOOD_CATEGORIES,
  buildImagePrompt,
  buildReferencePrompt,
  parseFreestylePrompt,
  detectImageGenerationIntent,
  extractImagePrompt,
  getRandomMoodPrompt,
  getMoodForTimeOfDay
};
