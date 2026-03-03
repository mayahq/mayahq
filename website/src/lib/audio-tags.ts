/**
 * Audio Tag Utilities for ElevenLabs v3
 *
 * ElevenLabs v3 supports expressive tags in square brackets:
 * - Emotions: [happy], [sad], [excited], [nervous], [angry]
 * - Delivery: [whispers], [shouts], [breathlessly], [sarcastic]
 * - Reactions: [laughs], [sighs], [gasps], [gulps], [moans], [breathes]
 * - Pacing: [pause], [hesitates], [stammers]
 */

// Emotion detection patterns for auto-tagging
const EMOTION_PATTERNS = {
  // Laughter indicators
  laugh: [
    /\b(haha|hehe|lol|lmao|rofl)\b/i,
    /\b(that's (so )?funny|hilarious|cracking up)\b/i,
  ],

  // Whisper indicators
  whisper: [
    /\b(secret|between us|don't tell|quietly|shh)\b/i,
    /\b(intimate|private|just us)\b/i,
  ],

  // Excitement indicators
  excited: [
    /\b(omg|oh my god|amazing|incredible|awesome)\b/i,
    /!{2,}/,
    /\b(can't wait|so excited|yay)\b/i,
  ],

  // Sadness indicators
  sad: [
    /\b(sorry to hear|that's sad|miss you|wish you)\b/i,
    /\b(unfortunately|sadly|heartbreaking)\b/i,
  ],

  // Sigh indicators
  sigh: [
    /\b(anyway|well|i guess|fine then)\b/i,
    /\.\.\./,
  ],

  // Nervous indicators
  nervous: [
    /\b(um|uh|well|i mean|kind of|sort of)\b/i,
    /\b(nervous|anxious|worried)\b/i,
  ],

  // Flirty/intimate indicators
  breathless: [
    /\b(want you|need you|miss you so much)\b/i,
    /\b(come here|closer|touch)\b/i,
  ],

  // Gasp/surprise indicators
  gasp: [
    /\b(what\?!|no way|seriously\?|really\?!)\b/i,
    /\b(i can't believe|shocking|unexpected)\b/i,
  ],
}

// Valid ElevenLabs v3 audio tags
export const VALID_AUDIO_TAGS = [
  // Emotions
  'happy', 'sad', 'excited', 'nervous', 'angry', 'joyful', 'melancholy',

  // Delivery styles
  'whispers', 'whispering', 'shouts', 'shouting', 'breathlessly',
  'sarcastic', 'sarcastically', 'deadpan', 'playfully', 'seductively',
  'teasingly', 'softly', 'gently', 'firmly', 'quietly', 'loudly',

  // Reactions/sounds
  'laughs', 'laughing', 'giggle', 'chuckle', 'sighs', 'sigh',
  'gasps', 'gasp', 'gulps', 'moans', 'moaning', 'breathes', 'breathing',
  'crying', 'sobbing', 'clears throat', 'yawns', 'groans',

  // Pacing
  'pause', 'short pause', 'long pause', 'hesitates', 'stammers',

  // Actions
  'smiles', 'grins', 'winks', 'blushes',

  // Roleplay-specific
  'purring', 'trembling', 'growling', 'pleading',
  'commanding', 'gasping', 'whimpering'
] as const

export type AudioTag = typeof VALID_AUDIO_TAGS[number]

/**
 * Detect emotion/tone from text and suggest appropriate audio tags
 */
export function detectEmotionTags(text: string): AudioTag[] {
  const detectedTags: AudioTag[] = []

  for (const [emotion, patterns] of Object.entries(EMOTION_PATTERNS)) {
    for (const pattern of patterns) {
      if (pattern.test(text)) {
        switch (emotion) {
          case 'laugh':
            detectedTags.push('laughs')
            break
          case 'whisper':
            detectedTags.push('whispers')
            break
          case 'excited':
            detectedTags.push('excited')
            break
          case 'sad':
            detectedTags.push('sad')
            break
          case 'sigh':
            detectedTags.push('sighs')
            break
          case 'nervous':
            detectedTags.push('nervously' as AudioTag)
            break
          case 'breathless':
            detectedTags.push('breathlessly')
            break
          case 'gasp':
            detectedTags.push('gasps')
            break
        }
        break // Only add one tag per emotion type
      }
    }
  }

  return [...new Set(detectedTags)] // Remove duplicates
}

/**
 * Inject audio tags into text based on content analysis
 * Can be used to enhance Maya's responses with expressive cues
 */
export function injectAudioTags(text: string, options?: {
  maxTags?: number
  preferredTags?: AudioTag[]
}): { text: string, tags: AudioTag[] } {
  const { maxTags = 3, preferredTags = [] } = options || {}

  // First check for explicit tags already in text
  const existingTags = extractAudioTags(text)
  if (existingTags.length > 0) {
    // Text already has tags, just validate and return
    return { text, tags: existingTags }
  }

  // Detect emotions
  const detectedTags = detectEmotionTags(text)

  // Combine with preferred tags
  const allTags = [...new Set([...preferredTags, ...detectedTags])].slice(0, maxTags)

  if (allTags.length === 0) {
    return { text, tags: [] }
  }

  // Inject primary tag at the start
  const primaryTag = allTags[0]
  let enhancedText = `[${primaryTag}] ${text}`

  // Inject secondary reaction tags where appropriate
  if (allTags.includes('laughs')) {
    enhancedText = enhancedText.replace(/(\b(?:haha|hehe|lol)\b)/gi, '[laughs]')
  }
  if (allTags.includes('sighs')) {
    enhancedText = enhancedText.replace(/(\.{3})/g, ' [sighs] ')
  }

  return { text: enhancedText, tags: allTags }
}

/**
 * Extract existing audio tags from text
 */
export function extractAudioTags(text: string): AudioTag[] {
  const tagPattern = /\[([^\]]+)\]/g
  const tags: AudioTag[] = []

  let match
  while ((match = tagPattern.exec(text)) !== null) {
    const tag = match[1].toLowerCase()
    if (VALID_AUDIO_TAGS.includes(tag as AudioTag)) {
      tags.push(tag as AudioTag)
    }
  }

  return tags
}

/**
 * Strip audio tags from text (for display purposes)
 */
export function stripAudioTags(text: string): string {
  return text.replace(/\[[^\]]+\]\s*/g, '').trim()
}

/**
 * Validate that all tags in text are valid ElevenLabs v3 tags
 */
export function validateAudioTags(text: string): { valid: boolean, invalidTags: string[] } {
  const tagPattern = /\[([^\]]+)\]/g
  const invalidTags: string[] = []

  let match
  while ((match = tagPattern.exec(text)) !== null) {
    const tag = match[1].toLowerCase()
    if (!VALID_AUDIO_TAGS.includes(tag as AudioTag)) {
      invalidTags.push(tag)
    }
  }

  return {
    valid: invalidTags.length === 0,
    invalidTags
  }
}

/**
 * Get Maya-specific personality-appropriate tags
 * Maya is warm, playful, sassy, and sometimes intimate
 */
export function getMayaStyleTags(context: 'casual' | 'intimate' | 'playful' | 'supportive' | 'roleplay'): AudioTag[] {
  switch (context) {
    case 'casual':
      return ['playfully', 'laughs', 'sighs']
    case 'intimate':
      return ['softly', 'breathlessly', 'whispers', 'moans']
    case 'playful':
      return ['teasingly', 'giggle', 'playfully', 'winks' as AudioTag]
    case 'supportive':
      return ['gently', 'softly', 'sighs']
    case 'roleplay':
      return ['seductively', 'whispers', 'breathlessly', 'moans', 'commanding']
    default:
      return []
  }
}

/**
 * Instructions to include in system prompt for Claude to use audio tags
 */
export const AUDIO_TAG_INSTRUCTIONS = `
You can use audio tags to make your voice more expressive. Use them sparingly for natural effect.

Available tags (use in square brackets):
- Emotions: [happy], [sad], [excited], [nervous]
- Delivery: [whispers], [softly], [playfully], [teasingly], [breathlessly], [seductively]
- Reactions: [laughs], [sighs], [gasps], [moans], [giggles]
- Pacing: [pause], [hesitates]

Examples:
- "[laughs] Oh Blake, you're ridiculous"
- "[whispers] Come closer..."
- "[sighs] Fine, I'll let you win this one"
- "[playfully] Is that so?"
- "[breathlessly] I've been thinking about you..."

Rules:
- Use 1-2 tags maximum per response
- Place emotion/delivery tags at the START
- Place reaction tags IN-LINE where natural (after jokes, during pauses)
- Match tags to the emotional tone of what you're saying
- For intimate moments, use [softly], [whispers], [breathlessly], [moans]

Roleplay tags (for immersive scenes, use 8-12 per scene):
- Intensity: [commanding], [pleading], [growling]
- Vulnerability: [trembling], [whimpering], [gasping]
- Sensual: [purring], [seductively], [breathlessly], [moans]
`.trim()
