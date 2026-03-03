/**
 * Fact Consolidation Job
 *
 * Daily job to analyze maya_memories and extract/consolidate important facts.
 * This catches facts that might have been missed during real-time extraction.
 *
 * Part of Memory System 3.0 - Daily fact consolidation
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Anthropic } from '@anthropic-ai/sdk';
import { batchExtractFacts } from './important-fact-extractor';
import { generateEmbedding } from './ai-client';

// Initialize clients
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || ''
});

interface ConsolidationResult {
  memoriesProcessed: number;
  factsExtracted: number;
  factsStored: number;
  factsBoosted: number;
  frequentTopics: string[];
  duration: number;
}

interface TopicCluster {
  topic: string;
  count: number;
  sampleMemories: string[];
}

/**
 * Get memories from the last N days for a user
 */
async function getRecentMemories(
  userId: string,
  days: number = 7,
  limit: number = 100
): Promise<Array<{ id: string; content: string; created_at: string }>> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);

  const { data, error } = await supabase
    .from('maya_memories')
    .select('id, content, created_at')
    .eq('metadata->>userId', userId)
    .gte('created_at', cutoffDate.toISOString())
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('[CONSOLIDATION] Error fetching recent memories:', error);
    return [];
  }

  return data || [];
}

/**
 * Use LLM to identify frequently mentioned topics in memories
 */
async function identifyFrequentTopics(
  memories: Array<{ content: string }>
): Promise<TopicCluster[]> {
  if (memories.length === 0) return [];

  try {
    // Sample up to 50 memories for topic analysis
    const sampleMemories = memories.slice(0, 50);
    const memoriesText = sampleMemories.map((m, i) => `${i + 1}. ${m.content}`).join('\n');

    const response = await anthropic.messages.create({
      model: 'claude-3-5-haiku-20241022',
      max_tokens: 1024,
      temperature: 0.1,
      system: `You are analyzing conversation memories to identify recurring topics and themes.
Focus on identifying:
- Repeated mentions of specific people, places, or things
- Recurring plans, goals, or intentions
- Frequent discussions about particular topics
- Important life events or changes mentioned multiple times`,
      messages: [{
        role: 'user',
        content: `Analyze these conversation memories and identify the most frequently mentioned topics or themes:

${memoriesText}

Return a JSON array of topics with their frequency. Format:
[{"topic": "topic name", "count": estimated_frequency, "sampleMemories": ["quote 1", "quote 2"]}]

Only include topics mentioned at least 2 times. Return [] if no recurring topics found.`
      }]
    });

    const responseText = response.content
      .filter(block => block.type === 'text')
      .map(block => (block as Anthropic.TextBlock).text)
      .join('');

    // Parse JSON response
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

    return JSON.parse(cleanedResponse.trim());
  } catch (error: any) {
    console.error('[CONSOLIDATION] Error identifying topics:', error.message);
    return [];
  }
}

/**
 * Extract facts from a cluster of related memories
 */
async function extractFactsFromCluster(
  topic: string,
  memories: string[],
  userId: string
): Promise<Array<{
  subject: string;
  predicate: string;
  object: string;
  factType: string;
  isPermanent: boolean;
  confidence: number;
}>> {
  try {
    const memoriesText = memories.slice(0, 10).join('\n- ');

    const response = await anthropic.messages.create({
      model: 'claude-3-5-haiku-20241022',
      max_tokens: 1024,
      temperature: 0.1,
      system: `You are extracting concrete facts from related conversation memories.
Focus on extracting:
- Confirmed personal details (names, places, dates)
- Stated preferences and habits
- Plans with specific details
- Important relationships mentioned
- Life changes or decisions`,
      messages: [{
        role: 'user',
        content: `Topic: "${topic}"

Related memories:
- ${memoriesText}

Extract any concrete facts that can be derived from these memories.
Return a JSON array:
[{
  "subject": "User or person name",
  "predicate": "relationship verb",
  "object": "the fact/detail",
  "factType": "date|plan|relationship|preference|location|important|general",
  "confidence": 0.0-1.0
}]

Only include facts with confidence >= 0.7. Return [] if no clear facts.`
      }]
    });

    const responseText = response.content
      .filter(block => block.type === 'text')
      .map(block => (block as Anthropic.TextBlock).text)
      .join('');

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

    const parsed = JSON.parse(cleanedResponse.trim());

    // Mark permanent fact types
    const permanentTypes = ['date', 'plan', 'relationship', 'location', 'important'];
    return parsed.map((f: any) => ({
      ...f,
      isPermanent: permanentTypes.includes(f.factType)
    }));
  } catch (error: any) {
    console.error('[CONSOLIDATION] Error extracting facts from cluster:', error.message);
    return [];
  }
}

/**
 * Store consolidated facts with deduplication
 */
async function storeConsolidatedFacts(
  facts: Array<{
    subject: string;
    predicate: string;
    object: string;
    factType: string;
    isPermanent: boolean;
    confidence: number;
  }>,
  userId: string
): Promise<{ stored: number; boosted: number }> {
  let stored = 0;
  let boosted = 0;

  for (const fact of facts) {
    try {
      const factContent = `${fact.subject} ${fact.predicate} ${fact.object}`;

      // Check for similar existing fact
      const { data: existingFact, error: searchError } = await supabase.rpc('find_similar_fact', {
        p_user_id: userId,
        p_content: factContent,
        p_similarity_threshold: 0.85
      });

      if (existingFact && existingFact.length > 0) {
        // Boost existing fact
        await supabase.rpc('boost_fact_importance', {
          p_fact_id: existingFact[0].id,
          p_weight_boost: 0.15 // Higher boost for consolidated facts
        });

        // Mark as permanent if needed
        if (fact.isPermanent && !existingFact[0].is_permanent) {
          await supabase.rpc('mark_fact_permanent', {
            p_fact_id: existingFact[0].id,
            p_fact_type: fact.factType
          });
        }

        boosted++;
      } else {
        // Generate embedding and store new fact
        const embedding = await generateEmbedding(factContent);
        if (!embedding || embedding.length === 0) {
          console.error('[CONSOLIDATION] Failed to generate embedding');
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
            weight: Math.min(fact.confidence + 0.1, 1.0), // Boost confidence for consolidated facts
            reference_count: 2, // Start with higher reference count (was mentioned multiple times)
            last_mentioned_at: new Date().toISOString(),
            metadata: {
              source: 'daily_consolidation',
              confidence: fact.confidence
            }
          });

        if (!insertError) {
          stored++;
        }
      }
    } catch (error: any) {
      console.error('[CONSOLIDATION] Error storing consolidated fact:', error.message);
    }
  }

  return { stored, boosted };
}

/**
 * Identify facts that have been boosted frequently and should be marked permanent
 */
async function promoteFrequentFacts(userId: string): Promise<number> {
  try {
    // Find facts with high reference counts that aren't permanent yet
    const { data: frequentFacts, error } = await supabase
      .from('maya_facts')
      .select('id, subject, predicate, object, reference_count, fact_type')
      .eq('user_id', userId)
      .eq('is_permanent', false)
      .gte('reference_count', 5)
      .order('reference_count', { ascending: false })
      .limit(20);

    if (error || !frequentFacts) {
      return 0;
    }

    let promoted = 0;
    for (const fact of frequentFacts) {
      const { error: updateError } = await supabase.rpc('mark_fact_permanent', {
        p_fact_id: fact.id,
        p_fact_type: fact.fact_type || 'important'
      });

      if (!updateError) {
        promoted++;
        console.log(`[CONSOLIDATION] Promoted fact to permanent: ${fact.subject} ${fact.predicate} ${fact.object}`);
      }
    }

    return promoted;
  } catch (error: any) {
    console.error('[CONSOLIDATION] Error promoting facts:', error.message);
    return 0;
  }
}

/**
 * Main consolidation job - run daily
 */
export async function runFactConsolidation(userId: string): Promise<ConsolidationResult> {
  const startTime = Date.now();
  console.log(`[CONSOLIDATION] Starting fact consolidation for user ${userId}`);

  const result: ConsolidationResult = {
    memoriesProcessed: 0,
    factsExtracted: 0,
    factsStored: 0,
    factsBoosted: 0,
    frequentTopics: [],
    duration: 0
  };

  try {
    // 1. Get recent memories
    const memories = await getRecentMemories(userId, 7, 100);
    result.memoriesProcessed = memories.length;
    console.log(`[CONSOLIDATION] Found ${memories.length} memories from last 7 days`);

    if (memories.length < 5) {
      console.log('[CONSOLIDATION] Not enough memories to analyze');
      result.duration = Date.now() - startTime;
      return result;
    }

    // 2. Identify frequent topics
    const topics = await identifyFrequentTopics(memories);
    result.frequentTopics = topics.map(t => t.topic);
    console.log(`[CONSOLIDATION] Identified ${topics.length} recurring topics:`, result.frequentTopics);

    // 3. Extract facts from each topic cluster
    for (const topic of topics) {
      console.log(`[CONSOLIDATION] Processing topic: ${topic.topic}`);
      const facts = await extractFactsFromCluster(topic.topic, topic.sampleMemories, userId);
      result.factsExtracted += facts.length;

      if (facts.length > 0) {
        const storeResult = await storeConsolidatedFacts(facts, userId);
        result.factsStored += storeResult.stored;
        result.factsBoosted += storeResult.boosted;
      }
    }

    // 4. Promote frequently referenced facts to permanent
    const promoted = await promoteFrequentFacts(userId);
    console.log(`[CONSOLIDATION] Promoted ${promoted} frequently referenced facts to permanent`);

    result.duration = Date.now() - startTime;
    console.log(`[CONSOLIDATION] Completed in ${result.duration}ms:`, result);

    return result;
  } catch (error: any) {
    console.error('[CONSOLIDATION] Error in consolidation job:', error.message);
    result.duration = Date.now() - startTime;
    return result;
  }
}

/**
 * Run consolidation for all active users
 */
export async function runConsolidationForAllUsers(): Promise<{
  usersProcessed: number;
  totalFacts: number;
  totalDuration: number;
}> {
  const startTime = Date.now();
  console.log('[CONSOLIDATION] Starting consolidation for all users');

  try {
    // Get distinct user IDs from recent memories
    const { data: userIds, error } = await supabase
      .from('maya_memories')
      .select('metadata->>userId')
      .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
      .limit(100);

    if (error || !userIds) {
      console.error('[CONSOLIDATION] Error fetching user IDs:', error);
      return { usersProcessed: 0, totalFacts: 0, totalDuration: Date.now() - startTime };
    }

    // Deduplicate user IDs
    const uniqueUserIds = [...new Set(userIds.map((r: any) => r['metadata->>userId']).filter(Boolean))];
    console.log(`[CONSOLIDATION] Found ${uniqueUserIds.length} users with recent activity`);

    let totalFacts = 0;
    for (const userId of uniqueUserIds) {
      try {
        const result = await runFactConsolidation(userId as string);
        totalFacts += result.factsStored + result.factsBoosted;
      } catch (error: any) {
        console.error(`[CONSOLIDATION] Error processing user ${userId}:`, error.message);
      }
    }

    return {
      usersProcessed: uniqueUserIds.length,
      totalFacts,
      totalDuration: Date.now() - startTime
    };
  } catch (error: any) {
    console.error('[CONSOLIDATION] Error in batch consolidation:', error.message);
    return { usersProcessed: 0, totalFacts: 0, totalDuration: Date.now() - startTime };
  }
}

// Export for use in cron jobs or API endpoints
export { getRecentMemories, identifyFrequentTopics, promoteFrequentFacts };
