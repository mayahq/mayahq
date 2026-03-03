import { SupabaseVectorStore } from "@langchain/community/vectorstores/supabase";
import { CohereEmbeddings } from "@langchain/cohere";
import { ConversationalRetrievalQAChain } from "langchain/chains";
import { PromptTemplate } from "@langchain/core/prompts";
import { createClient } from '@supabase/supabase-js';
import { ChatAnthropic } from "@langchain/anthropic";
import { AIMessage, HumanMessage, SystemMessage, BaseMessage } from "@langchain/core/messages";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { RunnableSequence, RunnablePassthrough } from "@langchain/core/runnables";
import { Document } from "@langchain/core/documents";
import { BufferMemory } from "langchain/memory";
import { type Embeddings } from "@langchain/core/embeddings";
// BaseRetrieverInterface removed - using 'any' to bypass LangChain version conflicts
import { v4 as uuidv4 } from 'uuid';

// Create Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Default retrieval settings - Increased from 5 to 15 for better context coverage
const DEFAULT_MATCH_COUNT = parseInt(process.env.RAG_MATCH_COUNT || '15');
const DEFAULT_PERMANENT_FACTS_COUNT = parseInt(process.env.PERMANENT_FACTS_COUNT || '25');

/**
 * Generate query variations for multi-query retrieval
 * Uses Claude Haiku for fast, cheap query expansion
 */
export async function generateQueryVariations(
  originalQuery: string,
  numVariations: number = 2
): Promise<string[]> {
  try {
    // Short queries don't benefit much from expansion
    if (originalQuery.length < 20) {
      console.log('[QUERY-EXPAND] Query too short, skipping expansion');
      return [originalQuery];
    }

    const llm = new ChatAnthropic({
      anthropicApiKey: process.env.ANTHROPIC_API_KEY,
      modelName: 'claude-haiku-4-20250514',
      temperature: 0.3,
      maxTokens: 150
    });

    const response = await llm.invoke([
      { role: 'system', content: `Generate ${numVariations} alternative phrasings of the user's query for memory retrieval.
Focus on:
- Different word choices that mean the same thing
- Key concepts and entities mentioned
- Implied topics or context

Return ONLY the variations, one per line. No numbering, no explanations.` },
      { role: 'user', content: originalQuery }
    ]);

    const variations = String(response.content)
      .split('\n')
      .map(v => v.trim())
      .filter(v => v.length > 5 && v.length < 200)
      .slice(0, numVariations);

    console.log(`[QUERY-EXPAND] Generated ${variations.length} variations for: "${originalQuery.substring(0, 50)}..."`);
    return [originalQuery, ...variations];
  } catch (error) {
    console.error('[QUERY-EXPAND] Error generating variations:', error);
    return [originalQuery];
  }
}

// Truncate vectors for logging to avoid huge logs
function truncateVector(vector: number[] | null | undefined, limit = 5): string {
  if (!vector || vector.length === 0) return "[]";
  const sample = vector.slice(0, limit);
  return `[ ${sample.map(v => v.toFixed(8)).join(', ')}${vector.length > limit ? ', ...' : ''} ]`;
}

let cohereEmbeddingsInstance: CohereEmbeddings | null = null;

function getCohereEmbeddings(): Embeddings {
  if (!cohereEmbeddingsInstance) {
    cohereEmbeddingsInstance = new CohereEmbeddings({
      apiKey: process.env.COHERE_API_KEY,
      model: "embed-english-v3.0",
      inputType: "search_document",
    });
    console.log('CohereEmbeddings instance created with inputType: search_document.');
  }
  return cohereEmbeddingsInstance as Embeddings;
}

// Initialize vector stores
let factsVectorStore: SupabaseVectorStore | null = null;
let memoriesVectorStore: SupabaseVectorStore | null = null;

/**
 * Initialize the vector stores
 */
async function initVectorStores(): Promise<void> {
  try {
    const embeddings = getCohereEmbeddings();
    if (!factsVectorStore) {
      factsVectorStore = new SupabaseVectorStore(embeddings, {
        client: supabase,
        tableName: "maya_facts",
        queryName: "match_documents_facts",
        contentColumnName: "content",
        embeddingColumnName: "embedding"
      } as any);
      console.log("Facts vector store initialized for maya_facts table with explicit column names.");
    }
    if (!memoriesVectorStore) {
      memoriesVectorStore = await SupabaseVectorStore.fromExistingIndex(
        embeddings,
        {
          client: supabase,
          tableName: "maya_memories",
          queryName: "match_documents_memories",
          contentColumnName: "content",
          embeddingColumnName: "embedding"
        } as any
      );
      console.log("Memories vector store initialized with LangChain and explicit column names.");
    }
  } catch (error) {
    console.error("Error initializing LangChain vector stores:", error);
    throw error;
  }
}

/**
 * Format userId for metadata queries
 */
export function formatUserId(userId: string): string {
  const formatted = `admin-user-${userId.replace(/-/g, '')}`;
  return formatted.substring(0, 36);
}

/**
 * Retrieve relevant memories for a user and query using LangChain
 */
export async function retrieveRelevantMemories(
  userId: string,
  query: string,
  matchCount: number = DEFAULT_MATCH_COUNT
): Promise<Array<Document & { similarity: number }>> {
  try {
    console.log(`Retrieving relevant memories for user ${userId} via LangChain with query: ${query.substring(0, 50)}${query.length > 50 ? '...' : ''}`);
    await initVectorStores();
    if (!memoriesVectorStore) {
      console.error('LangChain Memory vector store failed to initialize. Returning empty array.');
      return [];
    }
    const formattedUserId = formatUserId(userId);

    const resultsWithScores: [Document, number][] = await memoriesVectorStore.similaritySearchWithScore(
      query,
      matchCount,
      { userId: formattedUserId }
    );

    console.log(`Retrieved ${resultsWithScores.length} relevant memories with scores via LangChain.`);

    if (resultsWithScores.length > 0) {
      console.log('First memory doc metadata:', JSON.stringify(resultsWithScores[0][0].metadata, null, 2));
      console.log('First memory doc score:', resultsWithScores[0][1]);
    }

    return resultsWithScores.map(([doc, score]) => ({
      ...doc,
      pageContent: doc.pageContent,
      metadata: doc.metadata,
      similarity: score
    }));
  } catch (error) {
    console.error('Error retrieving memories strictly with LangChain:', error);
    return [];
  }
}

/**
 * Retrieve relevant facts for a user and query using LangChain
 */
export async function retrieveRelevantFacts(
  userId: string,
  query: string,
  matchCount: number = DEFAULT_MATCH_COUNT
): Promise<any[]> {
  try {
    console.log(`Retrieving relevant facts for user ${userId} via LangChain with query: ${query.substring(0, 50)}${query.length > 50 ? '...' : ''}`);
    await initVectorStores();
    if (!factsVectorStore) {
      console.error('LangChain Facts vector store failed to initialize. Returning empty array.');
      return [];
    }

    const resultsWithScores: [Document, number][] = await factsVectorStore.similaritySearchWithScore(
      query,
      matchCount,
      { user_id: userId }
    );

    console.log(`Retrieved ${resultsWithScores.length} relevant facts with scores via LangChain.`);
    if (resultsWithScores.length > 0) {
      console.log('First fact doc metadata:', JSON.stringify(resultsWithScores[0][0].metadata, null, 2));
      console.log('First fact doc score:', resultsWithScores[0][1]);
    }

    return resultsWithScores.map(([doc, score]) => ({
      subject: doc.metadata.subject || 'unknown',
      predicate: doc.metadata.predicate || 'unknown',
      object: doc.metadata.object || 'unknown',
      weight: doc.metadata.weight || 0.5,
      metadata: doc.metadata,
      pageContent: doc.pageContent,
      similarity: score
    }));
  } catch (error) {
    console.error('Error retrieving facts strictly with LangChain:', error);
    return [];
  }
}

/**
 * Retrieve user facts using enhanced hybrid scoring (v2)
 * Combines: 50% similarity + 20% keyword match + 15% recency decay + 15% importance
 * Based on ChatGPT/Claude memory architecture research
 */
export async function retrieveUserFactsHybrid(
  userId: string,
  query: string,
  matchCount: number = DEFAULT_MATCH_COUNT
): Promise<any[]> {
  try {
    console.log(`[HYBRID-V2] Retrieving user facts for ${userId} with enhanced hybrid scoring`);

    // Generate embedding for the query
    const embeddingsClient = getCohereEmbeddings();
    const queryEmbedding = await embeddingsClient.embedQuery(query);

    if (!queryEmbedding || queryEmbedding.length === 0) {
      console.error('[HYBRID-V2] Failed to generate query embedding');
      return retrieveRelevantFacts(userId, query, matchCount);
    }

    // Call the new hybrid v2 RPC function with recency decay and keyword matching
    const { data, error } = await supabase.rpc('match_facts_hybrid_v2', {
      query_embedding: queryEmbedding,
      p_user_id: userId,
      p_keyword_query: query,  // Also use query for keyword matching
      vector_weight: 0.5,      // 50% semantic similarity
      keyword_weight: 0.2,     // 20% keyword match
      recency_weight: 0.15,    // 15% recency (7-day half-life)
      importance_weight: 0.15, // 15% importance (weight + permanence + references)
      match_count: matchCount,
      min_score: 0.25
    });

    if (error) {
      console.error('[HYBRID-V2] Error in match_facts_hybrid_v2 RPC:', error);
      return retrieveRelevantFacts(userId, query, matchCount);
    }

    if (!data || data.length === 0) {
      console.log('[HYBRID-V2] No facts found with hybrid search');
      return [];
    }

    console.log(`[HYBRID-V2] Retrieved ${data.length} facts with enhanced hybrid scoring`);
    if (data[0]) {
      console.log(`[HYBRID-V2] Top fact: "${data[0].content?.substring(0, 50)}..." (score: ${data[0].combined_score?.toFixed(3)}, sim: ${data[0].similarity?.toFixed(3)}, permanent: ${data[0].is_permanent})`);
    }

    return data.map((fact: any) => ({
      id: fact.id,
      subject: fact.subject,
      predicate: fact.predicate,
      object: fact.object,
      content: fact.content,
      weight: fact.weight,
      factType: fact.fact_type,
      isPermanent: fact.is_permanent,
      similarity: fact.similarity,
      combinedScore: fact.combined_score,
      referenceCount: fact.reference_count,
      lastMentionedAt: fact.last_mentioned_at
    }));
  } catch (error) {
    console.error('[HYBRID-V2] Error in retrieveUserFactsHybrid:', error);
    return retrieveRelevantFacts(userId, query, matchCount);
  }
}

/**
 * Retrieve facts using multi-query expansion for better recall
 * Generates query variations and retrieves facts for each, then deduplicates
 */
export async function retrieveFactsWithExpansion(
  userId: string,
  query: string,
  matchCount: number = DEFAULT_MATCH_COUNT,
  useExpansion: boolean = true
): Promise<any[]> {
  try {
    // Get query variations (original + 2 alternatives)
    const queries = useExpansion
      ? await generateQueryVariations(query, 2)
      : [query];

    console.log(`[MULTI-QUERY] Retrieving facts with ${queries.length} query variations`);

    // Retrieve facts for each query variation in parallel
    const allResults = await Promise.all(
      queries.map(q => retrieveUserFactsHybrid(userId, q, Math.ceil(matchCount / queries.length) + 5))
    );

    // Merge and deduplicate by fact ID, keeping highest score
    const factMap = new Map<string, any>();

    for (const results of allResults) {
      for (const fact of results) {
        const existing = factMap.get(fact.id);
        if (!existing || (fact.combinedScore || 0) > (existing.combinedScore || 0)) {
          factMap.set(fact.id, fact);
        }
      }
    }

    // Sort by combined score and limit
    const mergedFacts = Array.from(factMap.values())
      .sort((a, b) => (b.combinedScore || 0) - (a.combinedScore || 0))
      .slice(0, matchCount);

    console.log(`[MULTI-QUERY] Merged ${mergedFacts.length} unique facts from ${allResults.reduce((sum, r) => sum + r.length, 0)} total results`);

    return mergedFacts;
  } catch (error) {
    console.error('[MULTI-QUERY] Error in retrieveFactsWithExpansion:', error);
    return retrieveUserFactsHybrid(userId, query, matchCount);
  }
}

/**
 * Retrieve all permanent facts for a user
 * These are always included in context regardless of query relevance
 */
export async function retrievePermanentFacts(
  userId: string,
  maxResults: number = DEFAULT_PERMANENT_FACTS_COUNT
): Promise<any[]> {
  try {
    console.log(`[PERMANENT] Retrieving permanent facts for user ${userId}`);

    // Try the RPC function first
    const { data, error } = await supabase.rpc('get_permanent_facts', {
      p_user_id: userId,
      max_results: maxResults
    });

    if (error) {
      console.error('[PERMANENT] Error in get_permanent_facts RPC:', error);

      // Fallback: direct query
      const { data: fallbackData, error: fallbackError } = await supabase
        .from('maya_facts')
        .select('id, subject, predicate, object, content, fact_type, weight, reference_count, last_mentioned_at')
        .eq('user_id', userId)
        .eq('is_permanent', true)
        .order('weight', { ascending: false })
        .limit(maxResults);

      if (fallbackError) {
        console.error('[PERMANENT] Fallback query also failed:', fallbackError);
        return [];
      }

      console.log(`[PERMANENT] Retrieved ${fallbackData?.length || 0} permanent facts via fallback`);
      return fallbackData || [];
    }

    console.log(`[PERMANENT] Retrieved ${data?.length || 0} permanent facts`);

    if (data && data.length > 0) {
      console.log(`[PERMANENT] Types: ${[...new Set(data.map((f: any) => f.fact_type))].join(', ')}`);
    }

    return data || [];
  } catch (error) {
    console.error('[PERMANENT] Error in retrievePermanentFacts:', error);
    return [];
  }
}

/**
 * Boost a fact's importance when it's re-mentioned
 */
export async function boostFactImportance(
  factId: string,
  weightBoost: number = 0.1
): Promise<boolean> {
  try {
    const { error } = await supabase.rpc('boost_fact_importance', {
      p_fact_id: factId,
      p_weight_boost: weightBoost
    });

    if (error) {
      console.error('[BOOST] Error boosting fact:', error);
      return false;
    }

    console.log(`[BOOST] Successfully boosted fact ${factId}`);
    return true;
  } catch (error) {
    console.error('[BOOST] Exception in boostFactImportance:', error);
    return false;
  }
}

/**
 * Mark a fact as permanent
 */
export async function markFactPermanent(
  factId: string,
  factType?: string
): Promise<boolean> {
  try {
    const { error } = await supabase.rpc('mark_fact_permanent', {
      p_fact_id: factId,
      p_fact_type: factType
    });

    if (error) {
      console.error('[PERMANENT] Error marking fact permanent:', error);
      return false;
    }

    console.log(`[PERMANENT] Marked fact ${factId} as permanent (type: ${factType})`);
    return true;
  } catch (error) {
    console.error('[PERMANENT] Exception in markFactPermanent:', error);
    return false;
  }
}

/**
 * Get fact statistics for monitoring
 */
export async function getFactStatistics(userId: string): Promise<any> {
  try {
    const { data, error } = await supabase.rpc('get_fact_statistics', {
      p_user_id: userId
    });

    if (error) {
      console.error('[STATS] Error getting fact statistics:', error);
      return null;
    }

    return data?.[0] || null;
  } catch (error) {
    console.error('[STATS] Exception in getFactStatistics:', error);
    return null;
  }
}

/**
 * Retrieve core facts about Maya
 */
export async function retrieveCoreFacts(
  category?: string | null,
  limit: number = 100
): Promise<any[]> {
  try {
    console.log(`Retrieving core facts${category ? ' with category: ' + category : ' (all active)'}`);

    const queryBuilder = supabase
      .from('maya_core_facts')
      .select('id, subject, predicate, object, weight, category')
      .eq('active', true);

    if (category && category.trim() !== '') {
      queryBuilder.eq('category', category);
    } else {
      // No category specified or empty category, so fetch all, adjust limit if needed
      // The limit parameter will control how many are fetched if no category is given.
      // If you truly want *all* without limit, you might need a different approach or a very high limit.
      // For now, the limit parameter handles this.
    }

    const { data, error } = await queryBuilder.limit(limit);

    if (error) {
      console.error('Error retrieving core facts:', error);
      return [];
    }

    const transformedData = (data || []).map(fact => ({
      id: fact.id,
      subject: fact.subject,
      predicate: fact.predicate,
      object: fact.object,
      content: `${fact.subject || ''} ${fact.predicate || ''} ${fact.object || ''}`.trim(),
      category: fact.category || (category || 'general'),
      weight: fact.weight || 1.0,
    }));

    console.log(`Retrieved ${transformedData.length} core facts (now with S-P-O).`);
    return transformedData;
  } catch (error) {
    console.error('Error in retrieveCoreFacts:', error);
    return [];
  }
}

/**
 * Retrieve conversation history for context
 */
export async function retrieveConversationHistory(
  roomId: string,
  currentMessageIdToExclude?: string,
  messageLimit: number = 10
): Promise<any[]> {
  try {
    console.log(`Retrieving conversation history for room: ${roomId}${currentMessageIdToExclude ? ", excluding current message: " + currentMessageIdToExclude : ""}`);
    let query = supabase
      .from('messages')
      .select('*')
      .eq('room_id', roomId);

    if (currentMessageIdToExclude) {
      query = query.not('id', 'eq', currentMessageIdToExclude);
    }

    query = query.order('created_at', { ascending: false })
      .limit(messageLimit);

    const { data, error } = await query;
    if (error) {
      console.error('Error retrieving conversation history:', error);
      return [];
    }
    return (data || []).reverse();
  } catch (error) {
    console.error('Error in retrieveConversationHistory:', error);
    return [];
  }
}

/**
 * Store a fact with embedding using direct Supabase insert
 */
export async function storeFact(
  userId: string,
  subject: string,
  predicate: string,
  object: string,
  weight: number = 0.75,
  factContextMetadata: any = {} // Renamed to avoid confusion, contains messageId, type, originalContent
): Promise<boolean> {
  try {
    const factText = `${subject} ${predicate} ${object}`.trim();
    if (!factText) {
      console.warn('Skipping storing fact because subject, predicate, and object resulted in empty factText.');
      return false;
    }
    console.log(`Storing fact (DIRECT INSERT): "${factText}" for user ${userId}`);

    // 1. Generate embedding for the factText
    const embeddingsClient = getCohereEmbeddings();
    const vector = await embeddingsClient.embedQuery(factText);

    if (!vector || vector.length === 0) {
      console.error(`Failed to generate embedding for fact: "${factText}"`);
      return false;
    }
    // console.log(`Generated embedding for fact "${factText}", vector sample: ${truncateVector(vector)}`); // Keep logs cleaner

    // 2. Prepare the record for direct insertion
    const factId = uuidv4();
    const recordToInsert = {
      id: factId,
      user_id: userId,
      subject: subject,
      predicate: predicate,
      object: object,
      content: factText,
      embedding: vector,
      weight: weight,
      ts: new Date().toISOString(),
      metadata: { // This goes into the JSONB metadata column
        messageId: factContextMetadata.messageId,
        type: factContextMetadata.type,
        originalContent: factContextMetadata.originalContent,
        factId: factId // Include the fact's own ID in its metadata for traceability
      },
      embedding_model: 'cohere', // Store model info
      embedding_ver: 'embed-english-v3.0' // Store model version info
    };

    // 3. Insert directly into Supabase
    const { error } = await supabase.from('maya_facts').insert(recordToInsert);

    if (error) {
      console.error(`Error inserting fact "${factText}" (ID: ${factId}) directly into Supabase:`, error);
      return false;
    }

    console.log(`Successfully stored fact "${factText}" directly into maya_facts with ID ${factId}`);
    return true;

  } catch (error) {
    console.error(`Error in storeFact (direct insert) for "${subject} ${predicate} ${object}":`, error);
    return false;
  }
}

/**
 * Extract facts from text using LLM
 */
export async function extractFactsWithLLM(content: string): Promise<Array<{ subject: string, predicate: string, object: string }>> {
  try {
    console.log(`Extracting facts from text (length: ${content.length}) using LangChain`);
    const llm = new ChatAnthropic({
      anthropicApiKey: process.env.ANTHROPIC_API_KEY,
      modelName: "claude-opus-4-5-20251101",
      temperature: 0
    });
    const promptTemplate = PromptTemplate.fromTemplate(
      `Extract factual statements from the following text as subject-predicate-object triples.
Only extract clear, explicit facts about the user or their preferences.

Text: {text}

Output format: JSON array of objects with subject, predicate, and object fields.
Example: [{{ "subject": "user", "predicate": "likes", "object": "coffee" }}]

If no facts are present, return an empty array [].`
    );

    // Format the prompt to a string, then wrap in HumanMessage for the LLM
    const formattedPromptString = await promptTemplate.format({ text: content });
    const messages: BaseMessage[] = [new HumanMessage(formattedPromptString)];

    const llmResult = await llm.invoke(messages as any) as any;

    let textToParse = "";
    if (typeof llmResult.content === 'string') {
      textToParse = llmResult.content;
    } else if (Array.isArray(llmResult.content) && llmResult.content.length > 0) {
      const firstPart = llmResult.content[0];
      if (typeof firstPart === 'object' && firstPart !== null && 'text' in firstPart) {
        textToParse = firstPart.text as string;
      } else {
        console.warn('LLM response content part is not a text block, trying JSON.stringify for the first part.');
        textToParse = JSON.stringify(firstPart);
      }
    } else {
      console.warn('LLM response content was complex and not directly stringifiable, attempting full stringify.');
      textToParse = JSON.stringify(llmResult.content); // Stringify the whole content object if no text part found
    }

    console.log('[extractFactsWithLLM] Raw LLM output for fact extraction:', textToParse);

    const jsonMatch = textToParse.match(/\[\s*\{.*\}\s*\]/s);
    const jsonStr = jsonMatch ? jsonMatch[0] : '[]';
    const facts = JSON.parse(jsonStr);
    console.log(`Extracted ${facts.length} facts with LLM (LangChain).`);
    return facts;

  } catch (error: any) {
    console.error('Error extracting facts with LangChain LLM:', error);
    if (error.response && error.response.data) {
      console.error('Anthropic API Error Details for fact extraction:', JSON.stringify(error.response.data, null, 2));
    }
    return [];
  }
}

/**
 * Create a LangChain RAG chain for memory-augmented responses
 */
export async function createRAGChain(
  userId: string,
  roomId: string
) {
  console.log('Creating RAG chain with LangChain components...');
  const llm = new ChatAnthropic({
    anthropicApiKey: process.env.ANTHROPIC_API_KEY,
    modelName: "claude-opus-4-5-20251101",
    temperature: 0.7
  });
  const memory = new BufferMemory({
    memoryKey: "chat_history",
    returnMessages: true,
  });
  try {
    await initVectorStores();
    if (!memoriesVectorStore) {
      throw new Error("LangChain Memories vector store not initialized. Cannot create RAG chain.");
    }

    // Let TypeScript infer the specific retriever type, then cast to the general interface
    const memoriesRetriever = memoriesVectorStore.asRetriever({ k: 5 });

    const chain = ConversationalRetrievalQAChain.fromLLM(
      llm as any, // Cast to any to bypass LangChain version type conflicts
      memoriesRetriever as any, // Cast to any to bypass BaseRetrieverInterface version conflicts
      { memory, returnSourceDocuments: true }
    );
    console.log('LangChain RAG chain created successfully.');
    return chain;
  } catch (error) {
    console.error("Error creating LangChain RAG chain:", error);
    throw error;
  }
}

/**
 * Retrieve a random recent maya_fact.
 * Fetches the last N facts and picks one randomly.
 */
export async function retrieveRandomRecentMayaFact(
  userId?: string, // Optional: to filter facts by user if needed in the future
  limitPool: number = 20 // Number of recent facts to pool from
): Promise<any | null> { // Should ideally return Promise<Fact | null> if Fact type is imported
  try {
    console.log(`[Memory Utils] Retrieving a random recent maya_fact (pool size: ${limitPool})`);
    let query = supabase
      .from('maya_facts')
      .select('id, subject, predicate, object, ts, user_id, weight') // Select necessary fields
      .order('ts', { ascending: false })
      .limit(limitPool);

    if (userId) {
      query = query.eq('user_id', userId);
    }

    const { data: recentFacts, error } = await query;

    if (error) {
      console.error('[Memory Utils] Error retrieving recent maya_facts:', error);
      return null;
    }

    if (!recentFacts || recentFacts.length === 0) {
      console.log('[Memory Utils] No recent maya_facts found to select from.');
      return null;
    }

    // Pick a random fact from the fetched pool
    const randomIndex = Math.floor(Math.random() * recentFacts.length);
    const randomFact = recentFacts[randomIndex];

    console.log(`[Memory Utils] Selected random maya_fact (ID: ${randomFact.id}): ${randomFact.subject} ${randomFact.predicate} ${randomFact.object}`);
    return randomFact; // This object should have subject, predicate, object

  } catch (err) {
    console.error('[Memory Utils] Unexpected error in retrieveRandomRecentMayaFact:', err);
    return null;
  }
}

// ============================================================================
// SESSION MEMORY FUNCTIONS - Time-based retrieval for conversation continuity
// ============================================================================

/**
 * Retrieve facts mentioned in the last N hours (session memory)
 * These are always included in context regardless of semantic similarity
 */
export async function retrieveSessionFacts(
  userId: string,
  hours: number = 12,
  maxResults: number = 20
): Promise<any[]> {
  try {
    console.log(`[Session Memory] Retrieving facts from last ${hours} hours for user ${userId}`);

    const { data, error } = await supabase.rpc('get_session_facts', {
      p_user_id: userId,
      p_hours: hours,
      max_results: maxResults
    });

    if (error) {
      console.error('[Session Memory] Error retrieving session facts:', error);
      return [];
    }

    console.log(`[Session Memory] Retrieved ${data?.length || 0} session facts`);
    return data || [];
  } catch (error) {
    console.error('[Session Memory] Error in retrieveSessionFacts:', error);
    return [];
  }
}

/**
 * Retrieve memories from the last N hours (session memory)
 * For maintaining context of recent conversations
 */
export async function retrieveSessionMemories(
  userId: string,
  hours: number = 6,
  maxResults: number = 15
): Promise<any[]> {
  try {
    console.log(`[Session Memory] Retrieving memories from last ${hours} hours for user ${userId}`);

    const { data, error } = await supabase.rpc('get_session_memories', {
      p_user_id: userId,
      p_hours: hours,
      max_results: maxResults
    });

    if (error) {
      console.error('[Session Memory] Error retrieving session memories:', error);
      return [];
    }

    console.log(`[Session Memory] Retrieved ${data?.length || 0} session memories`);
    return data || [];
  } catch (error) {
    console.error('[Session Memory] Error in retrieveSessionMemories:', error);
    return [];
  }
}

/**
 * Touch a fact to update its last_mentioned_at timestamp
 * Call this when a fact is referenced in conversation
 */
export async function touchFact(factId: string): Promise<boolean> {
  try {
    const { error } = await supabase.rpc('touch_fact', {
      p_fact_id: factId
    });

    if (error) {
      console.error('[Session Memory] Error touching fact:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('[Session Memory] Error in touchFact:', error);
    return false;
  }
}

/**
 * Batch touch multiple facts at once
 */
export async function touchFactsBatch(factIds: string[]): Promise<number> {
  if (!factIds || factIds.length === 0) return 0;

  let touchedCount = 0;
  for (const factId of factIds) {
    if (await touchFact(factId)) {
      touchedCount++;
    }
  }

  console.log(`[Session Memory] Touched ${touchedCount}/${factIds.length} facts`);
  return touchedCount;
}

/**
 * Reinforce facts that were likely used in Maya's response
 * This improves memory over time by boosting relevant facts
 */
export async function reinforceUsedFacts(
  responseText: string,
  retrievedFacts: any[],
  options: { boostWeight?: number; permanenceThreshold?: number } = {}
): Promise<{ touched: number; boosted: number; promoted: number }> {
  const { boostWeight = 0.05, permanenceThreshold = 5 } = options;
  const results = { touched: 0, boosted: 0, promoted: 0 };

  if (!retrievedFacts || retrievedFacts.length === 0) {
    return results;
  }

  const responseLower = responseText.toLowerCase();
  const usedFacts: any[] = [];

  // Identify facts that were likely used (key terms appear in response)
  for (const fact of retrievedFacts) {
    // Extract key terms from the fact
    const content = fact.content || `${fact.subject} ${fact.predicate} ${fact.object}`;
    const terms = content.toLowerCase()
      .split(/\s+/)
      .filter((t: string) => t.length > 3) // Skip short words
      .filter((t: string) => !['user', 'blake', 'maya', 'that', 'this', 'with', 'have', 'been', 'were', 'from'].includes(t));

    // Check if any key terms appear in the response
    const matchingTerms = terms.filter((term: string) => responseLower.includes(term));

    if (matchingTerms.length >= 2 || (terms.length <= 3 && matchingTerms.length >= 1)) {
      usedFacts.push(fact);
    }
  }

  if (usedFacts.length === 0) {
    console.log('[REINFORCE] No facts matched response');
    return results;
  }

  console.log(`[REINFORCE] Found ${usedFacts.length} facts that were likely used in response`);

  // Process each used fact
  for (const fact of usedFacts) {
    try {
      // Touch the fact (update last_mentioned_at, increment reference_count)
      if (await touchFact(fact.id)) {
        results.touched++;
      }

      // Boost weight slightly
      await boostFactImportance(fact.id, boostWeight);
      results.boosted++;

      // Check if should be promoted to permanent
      const newRefCount = (fact.referenceCount || 0) + 1;
      if (!fact.isPermanent && newRefCount >= permanenceThreshold) {
        console.log(`[REINFORCE] Promoting fact ${fact.id} to permanent (${newRefCount} references)`);
        await markFactPermanent(fact.id, 'frequently_referenced');
        results.promoted++;
      }
    } catch (error) {
      console.error(`[REINFORCE] Error processing fact ${fact.id}:`, error);
    }
  }

  console.log(`[REINFORCE] Results: ${results.touched} touched, ${results.boosted} boosted, ${results.promoted} promoted`);
  return results;
} 