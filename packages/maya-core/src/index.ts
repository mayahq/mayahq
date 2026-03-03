/**
 * @mayahq/maya-core v2.0 - Next-generation Maya AI Core
 * 
 * A standalone microservice implementation with:
 * - 🧠 Advanced RAG with vector memory search
 * - 📊 Knowledge graph facts storage
 * - 🎭 Consistent personality enforcement
 * - 📸 Multimodal processing support
 * - ⚡ Direct Supabase integration
 */

// Main service export
export { MayaService } from './service';

// Types and interfaces
export * from './types';

// Constants and configurations
export * from './constants';

// Legacy function stubs for backward compatibility
export async function upsertTriples(params: { text: string; userId: string }): Promise<void> {
  console.warn('[MAYA_CORE] upsertTriples is deprecated - consider using Maya Core service methods');
}

export async function getSemanticRelatedFacts(userId: string, query: string, limit = 5, threshold = 0.7): Promise<any[]> {
  console.warn('[MAYA_CORE] getSemanticRelatedFacts is deprecated - use Maya Core service methods');
  return [];
}

export async function testGetAllFacts(): Promise<any[]> {
  console.warn('[MAYA_CORE] testGetAllFacts is deprecated');
  return [];
}

export async function upsertCoreFactTriples(params: { 
  text: string; 
  userId: string; 
  sourceRef?: any; 
  generateEmbeddings?: boolean 
}): Promise<void> {
  console.warn('[MAYA_CORE] upsertCoreFactTriples is deprecated');
}

export function inferMemoryTagsDynamic(params: { input: any; response: string }): string[] {
  console.warn('[MAYA_CORE] inferMemoryTagsDynamic is deprecated');
  return ['general'];
}

export async function tagMessage(content: string, supabase: any): Promise<string[]> {
  console.warn('[MAYA_CORE] tagMessage is deprecated');
  return ['general'];
}

// Legacy constant for backward compatibility  
import { MAYA_PERSONALITY } from './constants';
export const MAYA_BASE_PROMPT = MAYA_PERSONALITY.CORE_PROMPT;

// Version info
export const MAYA_CORE_VERSION = '2.0.0';