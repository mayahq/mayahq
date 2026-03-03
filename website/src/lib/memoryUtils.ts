import { type Tables } from './database.types';
import { createClient } from '@supabase/supabase-js';

/**
 * Maya Memory type derived from database definition
 * with additional helper methods and utilities
 */
export type MayaMemory = Tables<'maya_memories'>;

/**
 * Memory content format for storage and retrieval
 */
export interface MemoryContent {
  input: string;
  response: string;
}

/**
 * Memory metadata format
 */
export interface MemoryMetadata {
  userId: string;
  userName: string;
  timestamp: string;
  type: MemoryType;
  isFallback?: boolean;
  modality: MemoryModality;
  // Add any additional metadata fields here
}

/**
 * Types of memories
 */
export type MemoryType = 'conversation' | 'experience' | 'knowledge' | 'fact';

/**
 * Memory modality types
 */
export type MemoryModality = 'text' | 'image' | 'audio' | 'sensor';

/**
 * Calculate a memory importance score based on various factors
 * @param content The memory content (conversation, fact, etc.)
 * @param metadata Additional metadata to inform the scoring
 * @returns Score from 0-1 with 1 being most important
 */
export function calculateMemoryImportance(
  content: string | MemoryContent,
  metadata?: Partial<MemoryMetadata>
): number {
  // Assign higher importance to image memories
  if (metadata?.modality === 'image') {
    return 0.7;
  }
  // Default for text
  return 0.5;
}

/**
 * Calculate when a memory should expire based on its importance and other factors
 * @param importance The memory importance score (0-1)
 * @param baseExpiryDays The default number of days before a memory expires
 * @returns Date when the memory should expire or null for no expiration
 */
export function calculateMemoryExpiry(
  importance: number,
  baseExpiryDays: number = 90
): Date | null {
  // High importance memories (>0.7) don't expire
  if (importance > 0.7) {
    return null;
  }
  
  // Lower importance = shorter expiry
  const expiryDays = Math.round(baseExpiryDays * importance);
  
  // Create expiry date
  const expiryDate = new Date();
  expiryDate.setDate(expiryDate.getDate() + expiryDays);
  
  return expiryDate;
}

/**
 * Format a memory for display
 * @param memory The memory to format
 * @returns Formatted string representation
 */
export function formatMemory(memory: MayaMemory): string {
  // Extract content
  let content = memory.content;
  
  // Handle image modality
  if (memory.modality === 'image') {
    // If content is base64, show a placeholder or URL reference
    if (typeof content === 'string' && content.startsWith('data:image/')) {
      return '[Image uploaded]';
    }
    // If content is a URL
    if (typeof content === 'string' && content.startsWith('http')) {
      return `[Image: ${content}]`;
    }
  }
  
  // Format based on content type
  if (typeof content === 'string') {
    if (content.includes('User: ') && content.includes('Maya: ')) {
      // Already in the correct format
      return content;
    }
    
    // Try to parse as JSON
    try {
      if (content.startsWith('{') || content.startsWith('[')) {
        const parsed = JSON.parse(content);
        if (parsed.input && parsed.response) {
          return `User: ${parsed.input}\nMaya: ${parsed.response}`;
        }
      }
    } catch (e) {
      // Not valid JSON, use as is
    }
  }
  
  return typeof content === 'string' ? content : JSON.stringify(content);
}

/**
 * Filter memories that have expired
 * @param memories Array of memories to filter
 * @returns Only non-expired memories
 */
export function filterExpiredMemories(memories: MayaMemory[]): MayaMemory[] {
  const now = new Date();
  return memories.filter(memory => {
    // If no expiry date, keep the memory
    if (!memory.expires_at) return true;
    
    // Parse expiry date and compare with current date
    const expiryDate = new Date(memory.expires_at);
    return expiryDate > now;
  });
}

// Tag cache for dynamic tag inference
let TAG_CACHE: Record<string, string[]> = {};

/**
 * Load tag definitions from Supabase and cache them
 */
export async function loadTags(supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
)) {
  const { data, error } = await supabase.from('tag_defs').select('slug, keywords');
  if (error) {
    console.error('Failed to load tag definitions from Supabase:', error);
    return;
  }
  TAG_CACHE = Object.fromEntries((data || []).map((r: any) => [r.slug, r.keywords]));
  console.log('[memoryUtils] Loaded tag definitions:', TAG_CACHE);
}

/**
 * Infer tags for a memory using dynamic tag cache
 * Falls back to baked-in tags if cache is empty
 */
export function inferMemoryTagsDynamic(content: string | MemoryContent): string[] {
  let text = '';
  if (typeof content === 'string') {
    text = content.toLowerCase();
  } else if (content && typeof content === 'object') {
    text = `${content.input || ''} ${content.response || ''}`.toLowerCase();
  }
  const found: string[] = [];
  const tagDict = Object.keys(TAG_CACHE).length > 0 ? TAG_CACHE : DEFAULT_TAGS;
  for (const [tag, words] of Object.entries(tagDict)) {
    if (words.some(w => text.includes(w))) found.push(tag);
  }
  return found;
}

// Baked-in fallback tag dictionary
const DEFAULT_TAGS: Record<string, string[]> = {
  sleep: ['sleep', 'nap', 'rest', 'insomnia', 'tired', 'awake'],
  productivity: ['productive', 'productivity', 'focus', 'work', 'task', 'procrastinate', 'efficiency'],
  goals: ['goal', 'objective', 'target', 'aim', 'plan', 'milestone'],
  health: ['health', 'wellness', 'sick', 'ill', 'doctor', 'medicine', 'hospital'],
  exercise: ['exercise', 'workout', 'run', 'gym', 'yoga', 'fitness', 'training', 'cardio', 'lift'],
  diet: ['diet', 'food', 'eat', 'meal', 'nutrition', 'calorie', 'snack', 'breakfast', 'lunch', 'dinner'],
  focus: ['focus', 'concentrate', 'attention', 'distraction'],
  habit: ['habit', 'routine', 'ritual', 'consistency'],
  mood: ['mood', 'happy', 'sad', 'angry', 'upset', 'emotion', 'feeling', 'depressed', 'anxious'],
  energy: ['energy', 'fatigue', 'tired', 'exhausted', 'rested'],
  stress: ['stress', 'anxiety', 'overwhelmed', 'pressure', 'relax'],
  relationship: ['relationship', 'friend', 'partner', 'family', 'connection', 'social'],
  work: ['work', 'job', 'career', 'office', 'project', 'meeting'],
  learning: ['learn', 'study', 'read', 'course', 'class', 'education', 'lesson'],
  gratitude: ['grateful', 'gratitude', 'thankful', 'appreciate'],
  // 'core-fact': ['fact:', 'core fact', 'remember this', 'note:'],
};

/**
 * Infer tags for a memory based on its content
 * @param content The memory content (string or MemoryContent)
 * @returns Array of tags
 */
export function inferMemoryTags(content: string | MemoryContent): string[] {
  const tagKeywords: { [tag: string]: string[] } = {
    sleep: ['sleep', 'nap', 'rest', 'insomnia', 'tired', 'awake'],
    productivity: ['productive', 'productivity', 'focus', 'work', 'task', 'procrastinate', 'efficiency'],
    goals: ['goal', 'objective', 'target', 'aim', 'plan', 'milestone'],
    health: ['health', 'wellness', 'sick', 'ill', 'doctor', 'medicine', 'hospital'],
    exercise: ['exercise', 'workout', 'run', 'gym', 'yoga', 'fitness', 'training', 'cardio', 'lift'],
    diet: ['diet', 'food', 'eat', 'meal', 'nutrition', 'calorie', 'snack', 'breakfast', 'lunch', 'dinner'],
    focus: ['focus', 'concentrate', 'attention', 'distraction'],
    habit: ['habit', 'routine', 'ritual', 'consistency'],
    mood: ['mood', 'happy', 'sad', 'angry', 'upset', 'emotion', 'feeling', 'depressed', 'anxious'],
    energy: ['energy', 'fatigue', 'tired', 'exhausted', 'rested'],
    stress: ['stress', 'anxiety', 'overwhelmed', 'pressure', 'relax'],
    relationship: ['relationship', 'friend', 'partner', 'family', 'connection', 'social'],
    work: ['work', 'job', 'career', 'office', 'project', 'meeting'],
    learning: ['learn', 'study', 'read', 'course', 'class', 'education', 'lesson'],
    gratitude: ['grateful', 'gratitude', 'thankful', 'appreciate'],
    // 'core-fact': ['fact:', 'core fact', 'remember this', 'note:'],
  };

  let text = '';
  if (typeof content === 'string') {
    text = content.toLowerCase();
  } else if (content && typeof content === 'object') {
    text = `${content.input || ''} ${content.response || ''}`.toLowerCase();
  }

  const tags = new Set<string>();
  for (const [tag, keywords] of Object.entries(tagKeywords)) {
    for (const keyword of keywords) {
      if (text.includes(keyword)) {
        tags.add(tag);
        break;
      }
    }
  }
  return Array.from(tags);
} 