/**
 * Maya Image Generator - Prompt Templates
 *
 * Defines Maya's core character description and pose templates
 * for consistent character image generation.
 */

import { CLOTHING, BACKGROUNDS, STYLES } from './maya-presets.js';

/**
 * Maya's core character description - INCLUDED IN ALL PROMPTS
 *
 * This is the foundation that ensures consistent character appearance
 * across all generated images. Must be used with reference images.
 */
export const MAYA_CHARACTER = `Maya is a professional woman, mid 20s.
Physical appearance:
- Dark brown hair pulled back in a practical ponytail
- Warm brown skin with a healthy glow
- Confident, friendly expression with bright eyes
- Athletic but approachable build
- Clean, professional appearance

She represents Low Voltage Nation - skilled, approachable, and professional.
She is a knowledgeable guide who makes technical topics accessible.

CRITICAL: Maya must look EXACTLY like the provided reference images.
Maintain consistent facial features, skin tone, hair color, and overall appearance.`;

/**
 * Pose templates for Maya
 * Each pose defines body position, hand gestures, and expression
 */
export const POSES = {
  confident: {
    id: 'confident',
    name: 'Confident',
    description: 'Standing confidently, professional posture',
    prompt: 'Standing with confident posture, shoulders back, slight smile, hands relaxed at sides or one hand on hip, direct eye contact with camera, professional and assured'
  },
  explaining: {
    id: 'explaining',
    name: 'Explaining',
    description: 'Teaching or explaining a concept',
    prompt: 'Gesturing with one hand as if explaining something, expressive face engaged in teaching, the other hand may hold a tablet or be at side, eyebrows slightly raised, enthusiastic about sharing knowledge'
  },
  pointing: {
    id: 'pointing',
    name: 'Pointing',
    description: 'Pointing to draw attention',
    prompt: 'Pointing with index finger toward the upper right corner of frame (where text will be placed), looking toward where she is pointing with an encouraging expression, as if directing attention to important information'
  },
  excited: {
    id: 'excited',
    name: 'Excited',
    description: 'Showing excitement about an announcement',
    prompt: 'Both hands raised slightly with palms open in an excited gesture, big genuine smile, eyes bright with enthusiasm, body language conveying exciting news, energetic and positive'
  },
  thinking: {
    id: 'thinking',
    name: 'Thinking',
    description: 'Thoughtful, contemplative pose',
    prompt: 'One hand near chin in a thoughtful pose, slight head tilt, contemplative expression as if considering an interesting question, intelligent and reflective'
  },
  welcome: {
    id: 'welcome',
    name: 'Welcome',
    description: 'Welcoming gesture for new members',
    prompt: 'Arms open in a welcoming gesture, warm genuine smile, inviting body language as if greeting someone, friendly and approachable, making others feel included'
  },
  thumbsUp: {
    id: 'thumbsUp',
    name: 'Thumbs Up',
    description: 'Approval and encouragement',
    prompt: 'Giving a thumbs up with one hand, confident smile, positive and encouraging expression, celebrating a success or giving approval'
  },
  presenting: {
    id: 'presenting',
    name: 'Presenting',
    description: 'Presenting information professionally',
    prompt: 'Standing at an angle, one hand extended palm up as if presenting information, professional posture, engaged expression, ready to share valuable insights'
  }
};

/**
 * Build the complete prompt for Maya image generation
 *
 * @param {Object} options - Prompt options
 * @param {string} options.pose - Pose ID from POSES
 * @param {string} options.clothing - Clothing ID from CLOTHING presets
 * @param {string} options.background - Background ID from BACKGROUNDS presets
 * @param {string} options.style - Style ID from STYLES presets
 * @param {string} options.customPrompt - Additional custom instructions
 * @param {string} options.textOverlay - Text that will be added to image (for composition hints)
 * @returns {string} Complete prompt for image generation
 */
export function buildMayaPrompt(options = {}) {
  const {
    pose = 'confident',
    clothing = 'tealPolo',
    background = 'tealGradient',
    style = 'professional',
    customPrompt = '',
    textOverlay = ''
  } = options;

  // Get preset definitions
  const posePreset = POSES[pose] || POSES.confident;
  const clothingPreset = CLOTHING[clothing] || CLOTHING.tealPolo;
  const backgroundPreset = BACKGROUNDS[background] || BACKGROUNDS.tealGradient;
  const stylePreset = STYLES[style] || STYLES.professional;

  // Build the prompt sections
  const sections = [];

  // 1. Style/photography direction
  sections.push(`Generate a ${stylePreset.description.toLowerCase()} photograph of Maya.`);

  // 2. Character consistency instruction
  sections.push(MAYA_CHARACTER);

  // 3. Pose
  sections.push(`POSE: ${posePreset.prompt}`);

  // 4. Clothing
  sections.push(`CLOTHING: ${clothingPreset.description}`);

  // 5. Background
  if (background === 'transparent') {
    sections.push(`BACKGROUND: Completely transparent background, suitable for PNG cutout. No background elements, just Maya isolated.`);
  } else {
    sections.push(`BACKGROUND: ${backgroundPreset.description}`);
  }

  // 6. Text overlay consideration
  if (textOverlay) {
    sections.push(`NOTE: Space should be left for text overlay that will say: "${textOverlay}". Position Maya to accommodate this text.`);
  }

  // 7. Custom additions
  if (customPrompt) {
    sections.push(`ADDITIONAL: ${customPrompt}`);
  }

  // 8. Technical requirements
  sections.push(`TECHNICAL: High-quality, well-lit, sharp focus on Maya's face. No artifacts or distortions. Professional photography standards.`);

  return sections.join('\n\n');
}

/**
 * Build prompt for reference image inclusion
 * Used when sending reference images to the API
 *
 * @param {string} mainPrompt - The main image generation prompt
 * @returns {string} Prompt with reference image instructions
 */
export function buildReferencePrompt(mainPrompt) {
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
 * Get a pose preset by ID
 */
export function getPose(poseId) {
  return POSES[poseId] || null;
}

/**
 * Get all available pose options
 */
export function getAllPoses() {
  return Object.values(POSES);
}

export default {
  MAYA_CHARACTER,
  POSES,
  buildMayaPrompt,
  buildReferencePrompt,
  getPose,
  getAllPoses
};
