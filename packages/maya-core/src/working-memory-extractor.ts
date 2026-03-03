/**
 * Working Memory Extractor
 *
 * Auto-extracts entities, projects, tech stack, and preferences from conversations
 * Uses Claude Haiku for fast, cheap extraction
 */

import { Anthropic } from '@anthropic-ai/sdk';
import { SupabaseClient } from '@supabase/supabase-js';

export interface ExtractedEntity {
  type: 'business' | 'project' | 'tech_stack' | 'person' | 'infrastructure' | 'preference';
  key: string;
  value: string;
  confidence: number;
  context?: string;
}

export interface ExtractionResult {
  entities: ExtractedEntity[];
  extractionTime: number;
  tokensUsed: number;
}

// Decay rates by type (how fast memory fades)
const DECAY_RATES = {
  business: 0.05,       // Very slow - companies don't change
  tech_stack: 0.15,     // Slow - tech stack changes occasionally
  infrastructure: 0.15, // Slow - infrastructure is stable
  person: 0.2,          // Medium - people come and go
  project: 0.3,         // Medium - projects change monthly
  preference: 0.1,      // Slow - preferences are stable
  temporary: 1.0        // Fast - disappears quickly (not used in extraction)
};

export class WorkingMemoryExtractor {
  private anthropic: Anthropic;
  private supabase: SupabaseClient;

  constructor(anthropic: Anthropic, supabase: SupabaseClient) {
    this.anthropic = anthropic;
    this.supabase = supabase;
  }

  /**
   * Extract entities from a conversation turn
   */
  async extractFromConversation(
    userId: string,
    userMessage: string,
    assistantMessage: string
  ): Promise<ExtractionResult> {
    const startTime = Date.now();

    const extractionPrompt = `Analyze this conversation and extract key entities that should be remembered long-term.

USER: ${userMessage}
ASSISTANT: ${assistantMessage}

Extract entities in these categories:
1. **business**: Company/business names (e.g., "MayaHQ", "Anthropic", "OpenAI")
2. **project**: Active projects being worked on (e.g., "Midnight Maya", "Chat SDK", "Memory System")
3. **tech_stack**: Technologies, frameworks, tools (e.g., "React Native", "Supabase", "Railway", "Claude Opus")
4. **person**: People mentioned (e.g., "Blake", "John", "Sarah")
5. **infrastructure**: Platforms, services, deployment (e.g., "Vercel", "GitHub", "AWS")
6. **preference**: User preferences or decisions (e.g., "prefers Railway for backends", "uses TypeScript")

CRITICAL RULES:
- Only extract entities that are clearly mentioned or implied
- Confidence: 0.9-1.0 for explicit mentions, 0.5-0.8 for implied
- Normalize keys (lowercase, no spaces): "React Native" → "react_native"
- Keep display values properly formatted: "React Native"
- Skip common words, pronouns, generic terms
- Focus on proper nouns and specific technologies
- If nothing notable, return empty array

Return JSON only:
{
  "entities": [
    {
      "type": "tech_stack",
      "key": "react_native",
      "value": "React Native",
      "confidence": 0.95,
      "context": "User is working with React Native for mobile app"
    }
  ]
}`;

    try {
      const response = await this.anthropic.messages.create({
        model: 'claude-3-5-haiku-20241022', // Fast + cheap
        max_tokens: 1000,
        temperature: 0.3, // Low temperature for consistent extraction
        messages: [{
          role: 'user',
          content: extractionPrompt
        }]
      });

      const responseText = response.content[0]?.type === 'text' ? response.content[0].text : '{}';

      // Extract JSON from response
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        console.warn('[WorkingMemoryExtractor] No JSON found in response');
        return {
          entities: [],
          extractionTime: Date.now() - startTime,
          tokensUsed: response.usage?.input_tokens + response.usage?.output_tokens || 0
        };
      }

      const parsed = JSON.parse(jsonMatch[0]);
      const entities: ExtractedEntity[] = parsed.entities || [];

      // Store extracted entities
      await this.storeEntities(userId, entities);

      console.log(`[WorkingMemoryExtractor] Extracted ${entities.length} entities in ${Date.now() - startTime}ms`);

      return {
        entities,
        extractionTime: Date.now() - startTime,
        tokensUsed: response.usage?.input_tokens + response.usage?.output_tokens || 0
      };

    } catch (error) {
      console.error('[WorkingMemoryExtractor] Extraction error:', error);
      return {
        entities: [],
        extractionTime: Date.now() - startTime,
        tokensUsed: 0
      };
    }
  }

  /**
   * Store extracted entities in working memory
   */
  private async storeEntities(userId: string, entities: ExtractedEntity[]): Promise<void> {
    for (const entity of entities) {
      try {
        const decayRate = DECAY_RATES[entity.type] || 0.3;

        await this.supabase.rpc('upsert_working_memory', {
          p_user_id: userId,
          p_memory_type: entity.type,
          p_key: entity.key,
          p_value: entity.value,
          p_confidence: entity.confidence,
          p_decay_rate: decayRate,
          p_metadata: {
            context: entity.context,
            extracted_at: new Date().toISOString()
          }
        });

        console.log(`[WorkingMemoryExtractor] Stored: ${entity.type}/${entity.key} = ${entity.value}`);
      } catch (error) {
        console.error(`[WorkingMemoryExtractor] Error storing entity ${entity.key}:`, error);
      }
    }
  }

  /**
   * Get working memory for context injection
   */
  async getWorkingMemory(userId: string, limit: number = 20): Promise<any[]> {
    try {
      const { data, error } = await this.supabase.rpc('get_working_memory', {
        p_user_id: userId,
        p_limit: limit
      });

      if (error) {
        console.error('[WorkingMemoryExtractor] Error retrieving working memory:', error);
        return [];
      }

      return data || [];
    } catch (error) {
      console.error('[WorkingMemoryExtractor] Error in getWorkingMemory:', error);
      return [];
    }
  }

  /**
   * Format working memory for system prompt
   */
  formatForPrompt(workingMemory: any[]): string {
    if (workingMemory.length === 0) return '';

    const byType: Record<string, string[]> = {
      business: [],
      project: [],
      tech_stack: [],
      person: [],
      infrastructure: [],
      preference: []
    };

    workingMemory.forEach(item => {
      if (byType[item.memory_type]) {
        byType[item.memory_type].push(item.value);
      }
    });

    let prompt = 'CURRENT CONTEXT (auto-maintained from recent conversations):\n';

    if (byType.business.length > 0) {
      prompt += `Businesses/Companies: ${byType.business.join(', ')}\n`;
    }
    if (byType.project.length > 0) {
      prompt += `Active Projects: ${byType.project.join(', ')}\n`;
    }
    if (byType.tech_stack.length > 0) {
      prompt += `Tech Stack: ${byType.tech_stack.join(', ')}\n`;
    }
    if (byType.infrastructure.length > 0) {
      prompt += `Infrastructure: ${byType.infrastructure.join(', ')}\n`;
    }
    if (byType.person.length > 0) {
      prompt += `People: ${byType.person.join(', ')}\n`;
    }
    if (byType.preference.length > 0) {
      prompt += `Preferences: ${byType.preference.join('; ')}\n`;
    }

    return prompt + '\n';
  }

  /**
   * Run decay on all working memory items (called by cron)
   */
  async runDecay(): Promise<number> {
    try {
      const { data, error } = await this.supabase.rpc('decay_working_memory');

      if (error) {
        console.error('[WorkingMemoryExtractor] Decay error:', error);
        return 0;
      }

      console.log(`[WorkingMemoryExtractor] Decayed ${data} working memory items`);
      return data || 0;
    } catch (error) {
      console.error('[WorkingMemoryExtractor] Error in runDecay:', error);
      return 0;
    }
  }
}
