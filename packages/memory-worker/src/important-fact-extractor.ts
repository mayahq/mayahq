/**
 * Important Fact Extractor
 *
 * Uses Claude Haiku to intelligently extract important facts from messages.
 * Focuses on dates, plans, timelines, relationships, preferences, and locations.
 *
 * Part of Memory System 3.0 - LLM-based fact extraction
 */

import { Anthropic } from '@anthropic-ai/sdk';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { generateEmbedding } from './ai-client';

// Types for extracted facts
export type FactType = 'date' | 'plan' | 'relationship' | 'preference' | 'location' | 'important' | 'general';

export interface ExtractedFact {
  subject: string;
  predicate: string;
  object: string;
  factType: FactType;
  isPermanent: boolean;
  confidence: number;
  timeReference?: string;
  rawContent: string;
}

interface ExtractionResult {
  facts: ExtractedFact[];
  reasoning?: string;
}

// Initialize Anthropic client
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || ''
});

// Fact types that should always be marked as permanent
const PERMANENT_FACT_TYPES: FactType[] = ['date', 'plan', 'relationship', 'location', 'important'];

/**
 * Extract important facts from a message using Claude Haiku
 * This provides more intelligent extraction than regex patterns
 */
export async function extractImportantFacts(
  message: string,
  userId: string,
  contextMessages?: string[]
): Promise<ExtractedFact[]> {
  if (!message || message.trim().length < 10) {
    return [];
  }

  try {
    console.log('[FACT_EXTRACTOR] Extracting facts from message:', message.substring(0, 100) + '...');

    // Build context string if we have previous messages
    const contextStr = contextMessages && contextMessages.length > 0
      ? `\nRecent conversation context:\n${contextMessages.slice(-3).join('\n')}\n`
      : '';

    const systemPrompt = `You are a fact extraction assistant. Your job is to identify important personal facts from user messages that should be remembered long-term.

Focus on extracting facts about:
1. DATES/TIMELINES: Move dates, lease dates, deadlines, appointments, planned events with specific times
2. PLANS: Life changes, moving plans, job changes, major decisions, goals
3. RELATIONSHIPS: Family members, partners, close friends, pets, important people mentioned by name
4. PREFERENCES: Strong likes/dislikes, dietary restrictions, allergies, habits, routines
5. LOCATIONS: Where they live, work, frequently visit, plan to move to
6. IMPORTANT: Any other critically important personal information

Rules:
- Only extract CONCRETE facts, not opinions or passing mentions
- Each fact should be something worth remembering for future conversations
- Be specific - include names, dates, and details when present
- Mark confidence level (0.0-1.0) based on how clear the fact is
- If a time reference is mentioned (in X months, by DATE), include it

Return a JSON array of facts. If no important facts found, return empty array [].`;

    const userPrompt = `Extract important personal facts from this message:${contextStr}
"${message}"

Return ONLY a valid JSON array with this structure (no markdown, no explanation):
[
  {
    "subject": "the person/entity (use 'User' for the speaker)",
    "predicate": "the relationship/action verb",
    "object": "the target/value",
    "factType": "date|plan|relationship|preference|location|important|general",
    "confidence": 0.0-1.0,
    "timeReference": "optional time context",
    "rawContent": "the original text this fact was extracted from"
  }
]`;

    const response = await anthropic.messages.create({
      model: 'claude-3-5-haiku-20241022', // Fast and cheap for extraction
      max_tokens: 1024,
      temperature: 0.1, // Low temperature for consistent extraction
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }]
    });

    // Extract text from response
    const responseText = response.content
      .filter(block => block.type === 'text')
      .map(block => (block as Anthropic.TextBlock).text)
      .join('');

    console.log('[FACT_EXTRACTOR] Raw response:', responseText.substring(0, 500));

    // Parse JSON response
    let facts: ExtractedFact[] = [];
    try {
      // Clean up response - remove any markdown formatting
      let cleanedResponse = responseText.trim();
      if (cleanedResponse.startsWith('```json')) {
        cleanedResponse = cleanedResponse.slice(7);
      }
      if (cleanedResponse.startsWith('```')) {
        cleanedResponse = cleanedResponse.slice(3);
      }
      if (cleanedResponse.endsWith('```')) {
        cleanedResponse = cleanedResponse.slice(0, -3);
      }
      cleanedResponse = cleanedResponse.trim();

      const parsed = JSON.parse(cleanedResponse);

      if (Array.isArray(parsed)) {
        facts = parsed.map(f => ({
          subject: f.subject || 'User',
          predicate: f.predicate || 'has',
          object: f.object || '',
          factType: (f.factType as FactType) || 'general',
          confidence: typeof f.confidence === 'number' ? f.confidence : 0.7,
          isPermanent: PERMANENT_FACT_TYPES.includes(f.factType as FactType),
          timeReference: f.timeReference,
          rawContent: f.rawContent || message
        })).filter(f => f.object && f.object.length > 0);
      }
    } catch (parseError) {
      console.error('[FACT_EXTRACTOR] Failed to parse LLM response:', parseError);
      console.error('[FACT_EXTRACTOR] Response was:', responseText);
      return [];
    }

    console.log(`[FACT_EXTRACTOR] Extracted ${facts.length} facts:`, facts.map(f => `${f.subject} ${f.predicate} ${f.object} (${f.factType})`));

    return facts;
  } catch (error: any) {
    console.error('[FACT_EXTRACTOR] Error extracting facts:', error.message);
    return [];
  }
}

/**
 * Store extracted facts to the database with proper deduplication
 */
export async function storeExtractedFacts(
  facts: ExtractedFact[],
  userId: string,
  supabase: SupabaseClient
): Promise<{ stored: number; boosted: number; skipped: number }> {
  let stored = 0;
  let boosted = 0;
  let skipped = 0;

  for (const fact of facts) {
    try {
      // Skip low-confidence facts
      if (fact.confidence < 0.5) {
        console.log(`[FACT_EXTRACTOR] Skipping low-confidence fact: ${fact.subject} ${fact.predicate} ${fact.object}`);
        skipped++;
        continue;
      }

      // Generate content string for the fact
      const factContent = `${fact.subject} ${fact.predicate} ${fact.object}`;

      // Check if similar fact already exists
      const { data: existingFact, error: searchError } = await supabase.rpc('find_similar_fact', {
        p_user_id: userId,
        p_content: factContent,
        p_similarity_threshold: 0.85
      });

      if (searchError) {
        console.error('[FACT_EXTRACTOR] Error searching for similar fact:', searchError);
      }

      if (existingFact && existingFact.length > 0) {
        // Similar fact exists - boost its importance
        console.log(`[FACT_EXTRACTOR] Similar fact exists, boosting: ${factContent}`);

        const { error: boostError } = await supabase.rpc('boost_fact_importance', {
          p_fact_id: existingFact[0].id,
          p_weight_boost: 0.1
        });

        if (boostError) {
          console.error('[FACT_EXTRACTOR] Error boosting fact:', boostError);
        } else {
          boosted++;
        }

        // If the existing fact isn't permanent but this one should be, mark it
        if (fact.isPermanent && !existingFact[0].is_permanent) {
          await supabase.rpc('mark_fact_permanent', {
            p_fact_id: existingFact[0].id,
            p_fact_type: fact.factType
          });
        }
      } else {
        // New fact - generate embedding and store
        console.log(`[FACT_EXTRACTOR] Storing new fact: ${factContent}`);

        const embedding = await generateEmbedding(factContent);
        if (!embedding || embedding.length === 0) {
          console.error('[FACT_EXTRACTOR] Failed to generate embedding for fact');
          skipped++;
          continue;
        }

        const { error: insertError } = await supabase
          .from('maya_facts')
          .insert({
            user_id: userId,
            subject: fact.subject,
            predicate: fact.predicate,
            object: fact.object,
            content: factContent,
            embedding: embedding,
            is_permanent: fact.isPermanent,
            fact_type: fact.factType,
            weight: fact.confidence,
            reference_count: 1,
            last_mentioned_at: new Date().toISOString(),
            metadata: {
              source: 'llm_extraction',
              confidence: fact.confidence,
              timeReference: fact.timeReference,
              rawContent: fact.rawContent
            }
          });

        if (insertError) {
          console.error('[FACT_EXTRACTOR] Error storing fact:', insertError);
          skipped++;
        } else {
          stored++;
        }
      }
    } catch (factError: any) {
      console.error('[FACT_EXTRACTOR] Error processing fact:', factError.message);
      skipped++;
    }
  }

  console.log(`[FACT_EXTRACTOR] Results: ${stored} stored, ${boosted} boosted, ${skipped} skipped`);
  return { stored, boosted, skipped };
}

/**
 * Main function to extract and store important facts from a message
 * Call this from the message processing pipeline
 */
export async function processMessageForFacts(
  message: string,
  userId: string,
  contextMessages?: string[]
): Promise<{ extracted: number; stored: number; boosted: number }> {
  try {
    // Initialize Supabase client
    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Extract facts using LLM
    const facts = await extractImportantFacts(message, userId, contextMessages);

    if (facts.length === 0) {
      return { extracted: 0, stored: 0, boosted: 0 };
    }

    // Store facts with deduplication
    const result = await storeExtractedFacts(facts, userId, supabase);

    return {
      extracted: facts.length,
      stored: result.stored,
      boosted: result.boosted
    };
  } catch (error: any) {
    console.error('[FACT_EXTRACTOR] Error in processMessageForFacts:', error.message);
    return { extracted: 0, stored: 0, boosted: 0 };
  }
}

/**
 * Batch extract facts from multiple messages (for consolidation jobs)
 */
export async function batchExtractFacts(
  messages: Array<{ content: string; userId: string; timestamp?: string }>,
  supabase: SupabaseClient
): Promise<{ total: number; stored: number; boosted: number }> {
  let total = 0;
  let stored = 0;
  let boosted = 0;

  for (const msg of messages) {
    try {
      const facts = await extractImportantFacts(msg.content, msg.userId);
      total += facts.length;

      if (facts.length > 0) {
        const result = await storeExtractedFacts(facts, msg.userId, supabase);
        stored += result.stored;
        boosted += result.boosted;
      }
    } catch (error) {
      console.error('[FACT_EXTRACTOR] Error processing message in batch:', error);
    }
  }

  return { total, stored, boosted };
}
