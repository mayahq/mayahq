import { createClient } from '@supabase/supabase-js';
import { v4 as uuidv4 } from 'uuid';

// Triple interface to represent subject-predicate-object relationships
interface Triple {
  subject: string;
  predicate: string;
  object: string;
  confidence?: number;
}

// Input parameters for the upsertTriples function
interface UpsertTriplesParams {
  text: string;
  userId: string;
  sourceRef?: any;
  generateEmbeddings?: boolean;
}

/**
 * Interface for creating a fact manually
 */
export interface CreateFactParams {
  userId: string;
  subject: string;
  predicate: string;
  object: string;
  weight?: number;
  sourceRef?: any;
  generateEmbedding?: boolean;
  expiresAt?: Date | null;
}

/**
 * Interface for updating a fact
 */
export interface UpdateFactParams {
  id: string;
  userId: string;
  subject?: string;
  predicate?: string;
  object?: string;
  weight?: number;
  sourceRef?: any;
  expiresAt?: Date | null;
  regenerateEmbedding?: boolean;
}

/**
 * Generate an embedding vector using Cohere with retry mechanism
 * @param text - Text to generate embedding for
 * @returns The embedding vector
 */
async function generateEmbedding(text: string): Promise<number[] | null> {
  try {
    // Add a check for very long text which can cause timeouts
    if (text.length > 5000) {
      // Truncate very long text to prevent timeouts (reduced from 8000)
      console.log(`Truncating long text from ${text.length} to 5000 characters`);
      text = text.substring(0, 5000);
    }

    // Use only Cohere for embeddings (1024 dimensions)
    // Implement a retry mechanism
    const MAX_RETRIES = 3;  // Increased from 2
    let retryCount = 0;
    let lastError = null;

    while (retryCount <= MAX_RETRIES) {
      try {
        const { CohereClient } = await import('cohere-ai');
        const cohere = new CohereClient({
          token: process.env.COHERE_API_KEY || '',
        });

        // Use a timeout approach that doesn't rely on AbortController
        const timeoutPromise = new Promise<null>(resolve => {
          setTimeout(() => {
            console.warn(`Cohere embedding timed out (attempt ${retryCount + 1}/${MAX_RETRIES + 1})`);
            resolve(null);
          }, 15000); // Increased timeout to 15 seconds
        });

        const embedPromise = (async () => {
          try {
            const response = await cohere.embed({
              texts: [text],
              model: 'embed-english-v3.0',
              inputType: 'search_document'
            });

            // Check if response has embeddings in the expected format
            if (response && response.embeddings && Array.isArray(response.embeddings)) {
              if (retryCount > 0) {
                console.log(`Successfully generated embedding after ${retryCount + 1} attempts`);
              }
              return response.embeddings[0];
            } else if (response && 'embeddings' in response) {
              // Handle different response structure based on Cohere SDK version
              const embeddings = response.embeddings as unknown as number[][];
              if (embeddings && embeddings.length > 0) {
                if (retryCount > 0) {
                  console.log(`Successfully generated embedding after ${retryCount + 1} attempts`);
                }
                return embeddings[0];
              }
            }
            return null;
          } catch (error) {
            console.error(`Cohere embedding API error (attempt ${retryCount + 1}):`, error);
            lastError = error;
            return null;
          }
        })();

        // Race between the actual request and timeout
        const result = await Promise.race([embedPromise, timeoutPromise]);
        if (result) {
          return result;
        }
        
        // If we reach here, it was a timeout or null result
        retryCount++;
        if (retryCount <= MAX_RETRIES) {
          console.log(`Retrying embedding generation (attempt ${retryCount + 1}/${MAX_RETRIES + 1})...`);
          // Add exponential backoff delay before retrying
          const delay = Math.min(1000 * Math.pow(2, retryCount), 8000); // Exponential backoff with max 8s delay
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      } catch (error) {
        console.error(`Error with Cohere client (attempt ${retryCount + 1}):`, error);
        lastError = error;
        retryCount++;
        if (retryCount <= MAX_RETRIES) {
          console.log(`Retrying embedding generation (attempt ${retryCount + 1}/${MAX_RETRIES + 1})...`);
          const delay = Math.min(1000 * Math.pow(2, retryCount), 8000);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    
    console.error(`Failed to generate embedding after ${MAX_RETRIES + 1} attempts. Last error:`, lastError);
    return null;
  } catch (error) {
    console.error('Error generating embedding:', error);
    return null;
  }
}

/**
 * Generate a text representation of a triple for embedding
 * @param triple - The triple to convert to text
 * @returns A text representation of the triple
 */
function tripleToText(triple: Triple): string {
  return `${triple.subject} ${triple.predicate} ${triple.object}`;
}

/**
 * Extract triples from text using Claude model when OpenAI fails
 * @param text - The text to extract triples from
 * @returns An array of extracted triples
 */
async function extractTriplesWithAnthropic(text: string): Promise<Triple[]> {
  try {
    console.log('Trying Anthropic for triple extraction...');
    
    // Initialize Anthropic client
    const Anthropic = await import('@anthropic-ai/sdk').then(module => {
      return new module.Anthropic({
        apiKey: process.env.ANTHROPIC_API_KEY,
        maxRetries: 3
      });
    });

    // Create the tool definition for Claude
    const tools = [{
      name: 'extract_triples',
      description: 'Extract subject-predicate-object triples from text',
      input_schema: {
        type: 'object' as const,
        properties: {
          triples: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                subject: {
                  type: 'string',
                  description: 'The subject of the triple',
                },
                predicate: {
                  type: 'string',
                  description: 'The predicate/relation of the triple',
                },
                object: {
                  type: 'string',
                  description: 'The object of the triple',
                },
                confidence: {
                  type: 'number',
                  description: 'Confidence score between 0 and 1',
                },
              },
              required: ['subject', 'predicate', 'object'],
            },
          },
        },
        required: ['triples'],
      }
    }];

    // Call the Anthropic API with tool calling
    const response = await Anthropic.messages.create({
      model: 'claude-opus-4-20250514',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: `Extract factual subject-predicate-object triples from the following text. Focus on extracting clear factual statements. Each triple should have a subject, predicate (relationship), and object. Only extract statements that are presented as facts. Assign a confidence score between 0 and 1 for each triple.

Text: ${text}`,
        }
      ],
      tools: tools,
      tool_choice: { type: 'tool', name: 'extract_triples' }
    });

    // Extract triples from tool calls
    const toolCalls = response.content.filter(item => item.type === 'tool_use');
    if (toolCalls && toolCalls.length > 0) {
      for (const call of toolCalls) {
        if (call.type === 'tool_use' && call.name === 'extract_triples') {
          const input = call.input as { triples: Triple[] };
          if (input.triples && Array.isArray(input.triples) && input.triples.length > 0) {
            console.log('Successfully extracted triples with Anthropic:', input.triples);
            return input.triples;
          }
        }
      }
    }
    
    console.log('No valid triples found in Anthropic response');
    return [];
  } catch (error) {
    console.error('Error extracting triples with Anthropic:', error);
    throw error;
  }
}

/**
 * Extract triples from text using Cohere if OpenAI and Anthropic fail
 * @param text - The text to extract triples from
 * @returns An array of extracted triples
 */
async function extractTriplesWithCohere(text: string): Promise<Triple[]> {
  try {
    console.log('Trying Cohere for triple extraction...');
    
    const { CohereClient } = await import('cohere-ai');
    const cohere = new CohereClient({
      token: process.env.COHERE_API_KEY || ''
    });

    const response = await cohere.chat({
      message: `Extract factual subject-predicate-object triples from the following text. Focus on extracting clear factual statements. Each triple should have a subject, predicate (relationship), and object. Only extract statements that are presented as facts. Assign a confidence score between 0 and 1 for each triple.
      
Format your response as a JSON array of objects with the following structure:
[{"subject": "...", "predicate": "...", "object": "...", "confidence": 0.9}, ...]

Text: ${text}`,
      model: 'command',
      temperature: 0.3
    });

    // Try to parse JSON from the response text
    try {
      // Look for a JSON array in the response text, including newlines
      const match = response.text.match(/\[\s*\{[\s\S]*?\}\s*\]/);
      if (match) {
        const jsonText = match[0];
        const triples = JSON.parse(jsonText);
        if (Array.isArray(triples) && triples.length > 0) {
          const validTriples = triples.filter(triple => 
            typeof triple === 'object' && 
            triple.subject && 
            triple.predicate && 
            triple.object
          );
          if (validTriples.length > 0) {
            console.log('Successfully extracted triples with Cohere:', validTriples);
            return validTriples;
          }
        }
      }
      console.log('No valid JSON triples found in Cohere response');
      return [];
    } catch (parseError) {
      console.error('Failed to parse JSON from Cohere response:', parseError);
      throw parseError;
    }
  } catch (error) {
    console.error('Error extracting triples with Cohere:', error);
    throw error;
  }
}

/**
 * Extract triples from text using LLM function calling
 * @param text - The text to extract triples from
 * @returns An array of extracted triples
 */
export async function extractTriples(text: string): Promise<Triple[]> {
  // Start triple extraction in the background
  const extractionPromise = (async () => {
    try {
      console.log('Attempting extraction with Anthropic...');
      const anthropicTriples = await extractTriplesWithAnthropic(text);
      if (anthropicTriples && anthropicTriples.length > 0) {
        return anthropicTriples;
      }
    } catch (error) {
      console.error('Error with Anthropic extraction:', error);
    }

    try {
      console.log('Falling back to Cohere for extraction...');
      const cohereTriples = await extractTriplesWithCohere(text);
      if (cohereTriples && cohereTriples.length > 0) {
        return cohereTriples;
      }
    } catch (error) {
      console.error('Error with Cohere extraction:', error);
    }

    try {
      console.log('Attempting final extraction with simplified prompt...');
      const { CohereClient } = await import('cohere-ai');
      const cohere = new CohereClient({
        token: process.env.COHERE_API_KEY || ''
      });

      const response = await cohere.chat({
        message: `Extract simple facts from this text as subject-predicate-object triples. Format as JSON array: [{"subject": "...", "predicate": "...", "object": "...", "confidence": 0.9}]

Text: ${text}`,
        model: 'command',
        temperature: 0.1
      });

      const match = response.text.match(/\[\s*\{[\s\S]*?\}\s*\]/);
      if (match) {
        const triples = JSON.parse(match[0]);
        if (Array.isArray(triples) && triples.length > 0) {
          const validTriples = triples.filter(triple => 
            triple.subject && triple.predicate && triple.object
          );
          if (validTriples.length > 0) {
            console.log('Successfully extracted triples with simplified prompt:', validTriples);
            return validTriples;
          }
        }
      }
    } catch (error) {
      console.error('Error with simplified extraction:', error);
    }

    console.log('Failed to extract triples with all methods');
    return [];
  })();

  // Return the extraction promise so it can be handled asynchronously
  return extractionPromise;
}

function isValidUuid(userId: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId);
}

/**
 * Check if a triple already exists in the database
 * @param supabase - Supabase client
 * @param userId - User ID (can be string or UUID)
 * @param triple - Triple to check
 * @returns Boolean indicating if the triple exists
 */
async function tripleExists(
  supabase: any, 
  userId: string, 
  triple: Triple
): Promise<boolean> {
  try {
    if (!isValidUuid(userId)) {
      return false;
    }
    const { data, error } = await supabase
      .from('maya_facts')
      .select('id')
      .eq('user_id', userId)
      .eq('subject', triple.subject)
      .eq('predicate', triple.predicate)
      .eq('object', triple.object)
      .limit(1);
    if (error) {
      console.error('Error checking for existing triple with direct ID:', error);
      return false;
    }
    return data && data.length > 0;
  } catch (error) {
    console.error('Error in tripleExists:', error);
    return false;
  }
}

/**
 * Generate an embedding for a fact based on its subject, predicate, and object
 * @param fact - The fact to generate embedding for
 * @returns The embedding vector and metadata
 */
export async function generateFactEmbedding(fact: Triple): Promise<{ embedding: number[] | null, model: string | null, dimension: number | null }> {
  try {
    // Convert fact to text representation
    const factText = tripleToText(fact);
    
    const { CohereClient } = await import('cohere-ai');
    const cohere = new CohereClient({
      token: process.env.COHERE_API_KEY || '',
    });

    try {
      const response = await cohere.embed({
        texts: [factText],
        model: 'embed-english-v3.0',
        inputType: 'search_document'
      });

      if (response && response.embeddings) {
        // Handle both array and object response formats
        const embeddings = Array.isArray(response.embeddings) ? response.embeddings : [response.embeddings];
        if (embeddings.length > 0 && Array.isArray(embeddings[0])) {
          return { 
            embedding: embeddings[0], 
            model: 'cohere/embed-english-v3.0', 
            dimension: embeddings[0].length 
          };
        }
      }
      console.warn('Unexpected response format from Cohere embedding API');
      return { embedding: null, model: null, dimension: null };
    } catch (error) {
      console.error('Error generating embedding with Cohere:', error);
      return { embedding: null, model: null, dimension: null };
    }
  } catch (error) {
    console.error('Error in generateFactEmbedding:', error);
    return { embedding: null, model: null, dimension: null };
  }
}

/**
 * Pre-generate an embedding for a fact triple with retry mechanism
 * This helps reduce the runtime overhead during searches
 * @param triple The triple to generate an embedding for
 */
async function preGenerateEmbedding(triple: Triple): Promise<{embedding: number[] | null, model: string | null}> {
  try {
    // Convert triple to text for embedding
    const text = tripleToText(triple);
    
    // Use Cohere for embeddings by default
    const { CohereClient } = await import('cohere-ai');
    const cohere = new CohereClient({
      token: process.env.COHERE_API_KEY || ''
    });
    
    const response = await cohere.embed({
      texts: [text],
      model: 'embed-english-v3.0',
      inputType: 'search_document'
    });
    
    if (response.embeddings) {
      // Handle both array and object response formats
      const embeddings = Array.isArray(response.embeddings) ? response.embeddings : [response.embeddings];
      if (embeddings.length > 0 && Array.isArray(embeddings[0])) {
        console.log(`Generated embeddings for triple with Cohere (${embeddings[0].length} dimensions)`);
        return {
          embedding: embeddings[0],
          model: 'cohere/embed-english-v3.0'
        };
      }
    }
    
    return {embedding: null, model: null};
  } catch (error) {
    console.error('Error generating embedding:', error);
    return {embedding: null, model: null};
  }
}

/**
 * Upsert extracted triples to the maya_facts table
 * This function runs asynchronously and should not block the chat response
 * @param params - The parameters containing text to extract triples from and user ID
 */
export async function upsertTriples(params: UpsertTriplesParams): Promise<void> {
  setTimeout(async () => {
    try {
      const { text, userId, sourceRef = {}, generateEmbeddings = true } = params;
      if (!text || !userId || !isValidUuid(userId)) {
        console.warn('Missing or invalid UUID for upsertTriples');
        return;
      }
      
      // Initialize Supabase client
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL || '',
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
      );
      
      // Extract triples from text
      const triples = await extractTriples(text);
      
      if (!triples || triples.length === 0) {
        console.log('No triples extracted from text');
        return;
      }
      
      console.log(`Extracted ${triples.length} triples from text`);
      
      // Get user profile info if available
      let userProfileData = null;
      try {
        const { data: profile } = await supabase
          .from('profiles')
          .select('name, avatar_url, bio')
          .eq('id', userId)
          .maybeSingle();
        
        if (profile) {
          userProfileData = {
            name: profile.name,
            avatar_url: profile.avatar_url,
            bio: profile.bio
          };
        }
      } catch (profileError) {
        console.log('Could not fetch user profile, continuing without it:', profileError);
      }
      
      if (!userProfileData) {
        userProfileData = { 
          name: 'User ' + userId.substring(0, 8)
        };
      }
      
      const dbUserId = userId;
      
      const enhancedSourceRef = {
        ...sourceRef,
        extraction_method: 'llm',
        original_text: text.substring(0, 500),
        user_info: userProfileData,
      };
      
      // Check if triples already exist
      const existenceChecks = await Promise.all(
        triples.map(triple => tripleExists(supabase, userId, triple))
      );
      
      const newTriples = triples.filter((_, index) => !existenceChecks[index]);
      
      if (newTriples.length === 0) {
        console.log('All triples already exist, skipping insertion');
        return;
      }
      
      console.log(`Inserting ${newTriples.length} new triples`);
      
      // Initialize Cohere client once for all embeddings
      let cohereClient = null;
      if (generateEmbeddings) {
        try {
          const { CohereClient } = await import('cohere-ai');
          cohereClient = new CohereClient({
            token: process.env.COHERE_API_KEY || ''
          });
        } catch (error) {
          console.error('Failed to initialize Cohere client:', error);
        }
      }

      // Process triples one at a time to avoid overwhelming the API
      for (const triple of newTriples) {
        try {
          let embedding = null;
          let embeddingModel = null;
          let embeddingVer = null;

          if (generateEmbeddings && cohereClient) {
            try {
              const text = tripleToText(triple);
              const response = await cohereClient.embed({
                texts: [text],
                model: 'embed-english-v3.0',
                inputType: 'search_document'
              });

              if (response && response.embeddings) {
                // Handle both array and object response formats
                const embeddings = Array.isArray(response.embeddings) ? response.embeddings : [response.embeddings];
                if (embeddings.length > 0 && Array.isArray(embeddings[0])) {
                  embedding = embeddings[0];
                  embeddingModel = 'cohere/embed-english-v3.0';
                  embeddingVer = '1024';
                }
              }
            } catch (embedError) {
              console.error('Error generating embedding for triple:', embedError);
            }
          }

          // Insert the fact
          const { error } = await supabase.from('maya_facts').insert({
            user_id: dbUserId,
            subject: triple.subject,
            predicate: triple.predicate,
            object: triple.object,
            content: `${triple.subject} ${triple.predicate} ${triple.object}`,
            weight: triple.confidence || 0.7,
            source_ref: enhancedSourceRef,
            ts: new Date().toISOString(),
            embedding: embedding,
            embedding_model: embeddingModel,
            embedding_ver: embeddingVer
          });
          
          if (error) {
            console.error('Error inserting fact:', error);
          } else {
            console.log(`Inserted fact: ${triple.subject} ${triple.predicate} ${triple.object}`);
          }

          // Add a small delay between insertions
          await new Promise(resolve => setTimeout(resolve, 100));
        } catch (insertError) {
          console.error('Exception inserting fact:', insertError);
        }
      }
    } catch (error) {
      console.error('Error upserting triples:', error);
    }
  }, 0);

  // Return immediately, don't wait for the background process
  return Promise.resolve();
}

/**
 * Retrieves facts related to a given query based on simple matching
 * @param userId - The user ID
 * @param query - The search query
 * @param k - The maximum number of facts to return (default: 5)
 * @returns Array of related facts
 */
export async function getRelatedFacts(
  userId: string,
  query: string,
  k: number = 5
): Promise<any[]> {
  try {
    if (!query || !userId) {
      console.warn('Missing required parameters for getRelatedFacts');
      return [];
    }
    
    // Trim query to reasonable length to avoid performance issues
    const trimmedQuery = query.length > 200 ? query.substring(0, 200) : query;
    
    // Initialize Supabase client
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || '',
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
    );
    
    // Call the RPC function with correct parameter order
    const { data, error } = await supabase
      .rpc('get_related_facts', {
        p_user_id: userId,
        query: trimmedQuery,
        k: k
      });
    
    if (error) {
      console.error('Error getting related facts:', error);
      return [];
    }
    
    return data || [];
  } catch (error) {
    console.error('Error in getRelatedFacts:', error);
    return [];
  }
}

/**
 * Generates a semantic embedding for a fact and retrieves semantically related facts
 * @param userId - The user ID
 * @param query - The search query
 * @param k - The maximum number of facts to return (default: 5)
 * @param similarityThreshold - The minimum similarity threshold (default: 0.3)
 * @returns Array of semantically related facts
 */
export async function getSemanticRelatedFacts(
  userId: string,
  query: string,
  k: number = 5,
  similarityThreshold: number = 0.3
): Promise<any[]> {
  // If the query is an image upload (base64 or image marker), return a fact
  if (typeof query === 'string' && (query.startsWith('data:image/') || query === '[Image uploaded]')) {
    return [{
      subject: userId,
      predicate: 'uploaded',
      object: 'a photo',
      weight: 1.0,
      source_ref: { type: 'image' },
      ts: new Date().toISOString(),
    }];
  }
  try {
    if (!query || !userId) {
      console.warn('Missing required parameters for getSemanticRelatedFacts');
      return [];
    }
    
    // Trim query to reasonable length to avoid embedding timeouts
    const trimmedQuery = query.length > 300 ? query.substring(0, 300) : query;
    
    console.log(`Getting semantic related facts for user ${userId} with query length: ${trimmedQuery.length}`);
    
    // Initialize Supabase client
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || '',
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
    );
    
    // Generate embedding for query
    console.log('Generating embedding for query...');
    const embedding = await generateEmbedding(trimmedQuery);
    
    if (!embedding) {
      console.warn('Failed to generate embedding for query, falling back to regular get_related_facts');
      return await getRelatedFacts(userId, query, k);
    }
    
    // Check embedding dimension - we expect 1024 for Cohere
    const embeddingDimension = embedding.length;
    console.log(`Generated embedding with dimension: ${embeddingDimension}`);
    
    if (embeddingDimension !== 1024) {
      console.warn(`Unexpected embedding dimension: ${embeddingDimension}, expected 1024. Falling back to text search.`);
      return await getRelatedFacts(userId, query, k);
    }
    
    // Query database with embedding
    console.log('Querying database with embedding...');
    const { data, error } = await supabase.rpc('get_semantic_related_facts_1024', {
      p_user_id: userId,
      p_query: trimmedQuery,
      p_embedding: embedding,
      p_k: k,
      p_similarity_threshold: similarityThreshold
    });
    
    if (error) {
      console.error('Error getting semantic related facts:', error);
      return await getRelatedFacts(userId, query, k);
    }
    
    if (!data || data.length === 0) {
      console.log('No semantic related facts found, falling back to text search');
      return await getRelatedFacts(userId, query, k);
    }
    
    console.log(`Found ${data.length} semantically related facts`);
    return data;
  } catch (error) {
    console.error('Error in getSemanticRelatedFacts:', error);
    return await getRelatedFacts(userId, query, k);
  }
}

/**
 * Create a single fact in the database
 * @param params - The parameters for creating a fact
 * @returns The created fact ID or null if creation failed
 */
export async function createFact(params: CreateFactParams): Promise<string | null> {
  try {
    const { userId, subject, predicate, object, weight = 0.8, sourceRef = null, generateEmbedding = true, expiresAt = null } = params;
    if (!userId || !isValidUuid(userId) || !subject || !predicate || !object) {
      console.warn('Missing or invalid UUID for createFact');
      return null;
    }
    
    // Initialize Supabase client
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || '',
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
    );
    
    // Get user profile info if available
    let userProfileData = null;
    try {
      // First check if this is a valid UUID for direct profile lookup
      const { data: profile } = await supabase
        .from('profiles')
        .select('name, avatar_url, bio')
        .eq('id', userId)
        .maybeSingle();
      
      if (profile) {
        userProfileData = {
          name: profile.name,
          avatar_url: profile.avatar_url,
          bio: profile.bio
        };
      }
    } catch (profileError) {
      console.log('Could not fetch user profile, continuing without it:', profileError);
    }
    
    // Ensure we have at least some user info
    if (!userProfileData) {
      userProfileData = { 
        name: 'User ' + userId.substring(0, 8)
      };
    }
    
    // Check if this fact already exists
    const { data: existingFact } = await supabase
      .from('maya_facts')
      .select('id')
      .eq('user_id', userId)
      .eq('subject', subject)
      .eq('predicate', predicate)
      .eq('object', object)
      .limit(1);
    
    // If the fact already exists, return its ID
    if (existingFact && existingFact.length > 0) {
      console.log('Fact already exists, returning existing ID');
      return existingFact[0].id;
    }
    
    // Generate embedding if requested
    let embedding = null;
    let embeddingModel = null;
    let embeddingVer = null;
    
    if (generateEmbedding) {
      const embeddingData = await generateFactEmbedding({
        subject,
        predicate,
        object
      });
      
      embedding = embeddingData.embedding;
      embeddingModel = embeddingData.model;
      embeddingVer = embeddingData.dimension?.toString();
    }
    
    // Create enhanced metadata that includes both sourceRef and user info
    const enhancedSourceRef = {
      ...sourceRef,
      user_info: userProfileData
    };
    
    // Insert the new fact
    const { data, error } = await supabase
      .from('maya_facts')
      .insert({
        user_id: userId,
        subject,
        predicate,
        object,
        content: `${subject} ${predicate} ${object}`,
        weight,
        source_ref: enhancedSourceRef,
        expires_at: expiresAt,
        embedding,
        embedding_model: embeddingModel,
        embedding_ver: embeddingVer
      })
      .select('id')
      .single();
    
    if (error) {
      // If error is about UUID format, try to store with a default UUID and the real ID in metadata
      if (error.code === '22P02' && error.message.includes('invalid input syntax for type uuid')) {
        console.log('Attempting to store with string user ID...');
        
        // Add string_user_id to the metadata
        const fallbackSourceRef = {
          ...enhancedSourceRef,
          string_user_id: userId
        };
        
        const { data: fallbackData, error: fallbackError } = await supabase
          .from('maya_facts')
          .insert({
            user_id: '00000000-0000-0000-0000-000000000000',
            subject,
            predicate,
            object,
            weight,
            source_ref: fallbackSourceRef,
            expires_at: expiresAt,
            embedding,
            embedding_model: embeddingModel,
            embedding_ver: embeddingVer
          })
          .select('id')
          .single();
        
        if (fallbackError) {
          console.error('Error creating fact with fallback method:', fallbackError);
          return null;
        }
        
        return fallbackData?.id || null;
      }
      
      console.error('Error creating fact:', error);
      return null;
    }
    
    return data?.id || null;
  } catch (error) {
    console.error('Error in createFact:', error);
    return null;
  }
}

/**
 * Update a fact in the database
 * @param params - The parameters for updating a fact
 * @returns Boolean indicating success
 */
export async function updateFact(params: UpdateFactParams): Promise<boolean> {
  try {
    const { 
      id,
      userId,
      subject,
      predicate,
      object,
      weight,
      sourceRef,
      expiresAt,
      regenerateEmbedding = false
    } = params;
    
    if (!id || !userId) {
      console.warn('Missing required parameters for updateFact');
      return false;
    }
    
    // Initialize Supabase client
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || '',
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
    );
    
    // Prepare update data
    const updateData: any = {};
    
    if (subject !== undefined) updateData.subject = subject;
    if (predicate !== undefined) updateData.predicate = predicate;
    if (object !== undefined) updateData.object = object;
    if (weight !== undefined) updateData.weight = weight;
    if (sourceRef !== undefined) updateData.source_ref = sourceRef;
    if (expiresAt !== undefined) updateData.expires_at = expiresAt;
    
    // If content changed and embedding regeneration is requested, generate new embedding
    if (regenerateEmbedding && (subject !== undefined || predicate !== undefined || object !== undefined)) {
      // First get the current fact data to fill in any missing fields
      const { data: currentFact, error: fetchError } = await supabase
        .from('maya_facts')
        .select('subject, predicate, object')
        .eq('id', id)
        .eq('user_id', userId)
        .single();
      
      if (fetchError) {
        console.error('Error fetching current fact data:', fetchError);
        return false;
      }
      
      // Generate new embedding using the updated fact data
      const updatedFact = {
        subject: subject ?? currentFact.subject,
        predicate: predicate ?? currentFact.predicate,
        object: object ?? currentFact.object
      };
      
      const embeddingData = await generateFactEmbedding(updatedFact);
      if (embeddingData.embedding) {
        updateData.embedding = embeddingData.embedding;
        updateData.embedding_model = embeddingData.model;
        updateData.embedding_ver = embeddingData.dimension?.toString();
      }
    }
    
    // No fields to update
    if (Object.keys(updateData).length === 0) {
      return true;
    }
    
    // Update the fact
    const { error } = await supabase
      .from('maya_facts')
      .update(updateData)
      .eq('id', id)
      .eq('user_id', userId);
    
    if (error) {
      console.error('Error updating fact:', error);
      return false;
    }
    
    return true;
  } catch (error) {
    console.error('Error in updateFact:', error);
    return false;
  }
}

/**
 * Delete a fact from the database
 * @param id - The ID of the fact to delete
 * @param userId - The user ID who owns the fact
 * @returns Boolean indicating success
 */
export async function deleteFact(id: string, userId: string): Promise<boolean> {
  try {
    if (!id || !userId) {
      console.warn('Missing required parameters for deleteFact');
      return false;
    }
    
    // Initialize Supabase client
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || '',
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
    );
    
    // Delete the fact
    const { error } = await supabase
      .from('maya_facts')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);
    
    if (error) {
      console.error('Error deleting fact:', error);
      return false;
    }
    
    return true;
  } catch (error) {
    console.error('Error in deleteFact:', error);
    return false;
  }
}

/**
 * Get facts by their IDs
 * @param ids - Array of fact IDs to retrieve
 * @param userId - The user ID who owns the facts
 * @returns Array of facts
 */
export async function getFactsByIds(ids: string[], userId: string): Promise<any[]> {
  try {
    if (!ids || ids.length === 0 || !userId) {
      console.warn('Missing required parameters for getFactsByIds');
      return [];
    }
    
    // Initialize Supabase client
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || '',
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
    );
    
    // Get the facts
    const { data, error } = await supabase
      .from('maya_facts')
      .select('*')
      .in('id', ids)
      .eq('user_id', userId);
    
    if (error) {
      console.error('Error getting facts by IDs:', error);
      return [];
    }
    
    return data || [];
  } catch (error) {
    console.error('Error in getFactsByIds:', error);
    return [];
  }
}

/**
 * Simple test function to get all facts for a user without embeddings
 * For debugging purposes
 */
export async function testGetAllFacts(userId: string): Promise<any[]> {
  try {
    console.log(`Running test to get all facts for user: ${userId}`);
    
    // Initialize Supabase client
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || '',
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
    );
    
    // Call the test function
    const { data, error } = await supabase.rpc('test_facts_query', {
      p_user_id: userId
    });
    
    if (error) {
      console.error('Error in test_facts_query:', error);
      return [];
    }
    
    console.log(`Found ${data?.length || 0} facts for user ${userId}`);
    if (data && data.length > 0) {
      data.forEach((fact: any, idx: number) => {
        console.log(`Fact ${idx+1}: ${fact.subject} ${fact.predicate} ${fact.object} (weight: ${fact.weight})`);
        console.log(`  Source: ${JSON.stringify(fact.user_info)}`);
      });
    }
    
    return data || [];
  } catch (error) {
    console.error('Error in testGetAllFacts:', error);
    return [];
  }
}

export async function upsertCoreFactTriples(params: UpsertTriplesParams): Promise<void> {
  setTimeout(async () => {
    try {
      const { text, userId, sourceRef = {}, generateEmbeddings = true } = params;
      if (!text || !userId || !isValidUuid(userId)) {
        console.warn('Missing or invalid UUID for upsertCoreFactTriples');
        return;
      }
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL || '',
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
      );
      const triples = await extractTriples(text);
      if (!triples || triples.length === 0) {
        console.log('No triples extracted from text');
        return;
      }
      console.log(`Extracted ${triples.length} triples from text (core facts)`);
      let userProfileData = null;
      try {
        const { data: profile } = await supabase
          .from('profiles')
          .select('name, avatar_url, bio')
          .eq('id', userId)
          .maybeSingle();
        if (profile) {
          userProfileData = {
            name: profile.name,
            avatar_url: profile.avatar_url,
            bio: profile.bio
          };
        }
      } catch (profileError) {
        console.log('Could not fetch user profile, continuing without it:', profileError);
      }
      if (!userProfileData) {
        userProfileData = { name: 'User ' + userId.substring(0, 8) };
      }
      const dbUserId = userId;
      const enhancedSourceRef = {
        ...sourceRef,
        extraction_method: 'llm',
        original_text: text.substring(0, 500),
        user_info: userProfileData,
      };
      // Check if triples already exist (optional for core facts, can skip or implement similar logic)
      for (const triple of triples) {
        try {
          let embedding = null;
          let embeddingModel = null;
          let embeddingVer = null;
          if (generateEmbeddings) {
            try {
              const text = tripleToText(triple);
              const { CohereClient } = await import('cohere-ai');
              const cohereClient = new CohereClient({ token: process.env.COHERE_API_KEY || '' });
              const response = await cohereClient.embed({
                texts: [text],
                model: 'embed-english-v3.0',
                inputType: 'search_document'
              });
              if (response && response.embeddings) {
                const embeddings = Array.isArray(response.embeddings) ? response.embeddings : [response.embeddings];
                if (embeddings.length > 0 && Array.isArray(embeddings[0])) {
                  embedding = embeddings[0];
                  embeddingModel = 'cohere/embed-english-v3.0';
                  embeddingVer = '1024';
                }
              }
            } catch (embedError) {
              console.error('Error generating embedding for core fact triple:', embedError);
            }
          }
          const { error } = await supabase.from('maya_core_facts').insert({
            user_id: dbUserId,
            subject: triple.subject,
            predicate: triple.predicate,
            object: triple.object,
            weight: triple.confidence || 1.0,
            source_ref: enhancedSourceRef,
            ts: new Date().toISOString(),
            last_updated: new Date().toISOString(),
            active: true
          });
          if (error) {
            console.error('Error inserting core fact:', error);
          } else {
            console.log(`[CoreFact] Inserted core fact: ${triple.subject} ${triple.predicate} ${triple.object}`);
          }
          await new Promise(resolve => setTimeout(resolve, 100));
        } catch (insertError) {
          console.error('Exception inserting core fact:', insertError);
        }
      }
    } catch (error) {
      console.error('Error upserting core fact triples:', error);
    }
  }, 0);
  return Promise.resolve();
} 