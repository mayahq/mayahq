// Export types
export * from './types';
export type { Message, Room } from './types';

// Export hooks
export { useRoomMessages } from './useRoomMessages';
export { useMayaChat, useMayaVoiceChat } from './useMayaChat';

// Export utilities
export { sendMessage } from './sendMessage';
export { sendMessageV2, triggerMayaResponse } from './sendMessageV2';
export type { Attachment, MessageAttachment } from './sendMessageV2';

// Export image generation
export {
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
} from './imageGeneration';
export type {
  ImageGenerationOptions,
  GeneratedImage,
  ImageGenerationResult,
  PoseType,
  ClothingType,
  BackgroundType,
  StyleType,
  MoodCategory
} from './imageGeneration';

// Export constants
export const CHAT_SDK_VERSION = '0.3.0'; 