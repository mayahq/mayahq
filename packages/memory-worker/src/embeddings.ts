import { OpenAIEmbeddings } from '@langchain/openai'
// Anthropic doesn't directly provide embeddings, so we'll use OpenAI as fallback instead
// import { AnthropicEmbeddings } from '@langchain/anthropic'

// Import our custom Cohere embeddings class that properly sets input_type
import { CustomCohereEmbeddings } from './ai-client'

// Initialize embeddings models with API keys from environment variables
const cohereApiKey = process.env.COHERE_API_KEY
const openaiApiKey = process.env.OPENAI_API_KEY
// const anthropicApiKey = process.env.ANTHROPIC_API_KEY

// Embedding dimensions by model
const EMBEDDING_DIMENSIONS = {
  cohere: 1024, // Updated for embed-english-v3.0 model
  openai: 1536
}

// Current active model (configurable)
let activeModel: 'cohere' | 'openai' = 'cohere'
let cohereEmbedder: CustomCohereEmbeddings | null = null
let openaiEmbedder: OpenAIEmbeddings | null = null

/**
 * Initialize the embeddings models
 */
function initializeEmbedders() {
  console.log(`Initializing embedders. Cohere API key: ${cohereApiKey ? 'present' : 'missing'}, OpenAI API key: ${openaiApiKey ? 'present' : 'missing'}`);
  
  if (cohereApiKey && !cohereEmbedder) {
    console.log('Initializing Cohere embedder with model: embed-english-v3.0');
    try {
      cohereEmbedder = new CustomCohereEmbeddings({
        apiKey: cohereApiKey,
        model: 'embed-english-v3.0',
      });
      console.log('Cohere embedder initialized successfully');
    } catch (error) {
      console.error('Failed to initialize Cohere embedder:', error);
    }
  } else if (!cohereApiKey) {
    console.error('CRITICAL: Cohere API key is missing. Embeddings will likely fail.');
  }
  
  if (openaiApiKey && !openaiEmbedder) {
    console.log('Initializing OpenAI embedder with model: text-embedding-ada-002');
    try {
      openaiEmbedder = new OpenAIEmbeddings({
        openAIApiKey: openaiApiKey,
        modelName: 'text-embedding-ada-002'
      });
      console.log('OpenAI embedder initialized successfully');
    } catch (error) {
      console.error('Failed to initialize OpenAI embedder:', error);
    }
  }
}

/**
 * Generate an embedding vector for the given text
 * Falls back to other models if the primary model fails
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  // Initialize embedders if not already done
  if (!cohereEmbedder && !openaiEmbedder) {
    console.log('No embedders initialized yet, initializing now...');
    initializeEmbedders();
  }
  
  // Log the text length and model being used
  console.log(`Generating embedding for text of length ${text.length} using primary model: ${activeModel}`);
  
  if (!text || text.trim().length === 0) {
    console.error('Empty text provided for embedding generation');
    return [];
  }
  
  // Try the configured active model first
  try {
    if (activeModel === 'cohere' && cohereEmbedder) {
      console.log('Using Cohere for embeddings');
      const startTime = Date.now();
      const embeddings = await cohereEmbedder.embedQuery(text);
      const duration = Date.now() - startTime;
      
      console.log(`Cohere embedding generated successfully in ${duration}ms. Length: ${embeddings.length}`);
      
      if (!embeddings || embeddings.length === 0) {
        console.error('Cohere returned empty embedding array');
        throw new Error('Empty embedding returned from Cohere');
      }
      
      return embeddings;
    } else if (activeModel === 'openai' && openaiEmbedder) {
      console.log('Using OpenAI for embeddings');
      const startTime = Date.now();
      const embeddings = await openaiEmbedder.embedQuery(text);
      const duration = Date.now() - startTime;
      
      console.log(`OpenAI embedding generated successfully in ${duration}ms. Length: ${embeddings.length}`);
      
      if (!embeddings || embeddings.length === 0) {
        console.error('OpenAI returned empty embedding array');
        throw new Error('Empty embedding returned from OpenAI');
      }
      
      return embeddings;
    } else {
      console.error(`No embedder available for active model: ${activeModel}`);
      if (!cohereEmbedder) console.error('Cohere embedder is not initialized');
      if (!openaiEmbedder) console.error('OpenAI embedder is not initialized');
    }
  } catch (error: any) {
    console.error(`Error using ${activeModel} embeddings:`, error);
    console.error('Error details:', error.message);
    if (error.response) {
      console.error('API response:', error.response.data);
      console.error('API status:', error.response.status);
    }
    // Continue to fallbacks
  }
  
  // Fallback chain: cohere -> openai
  let fallbackEmbedding: number[] | null = null;
  
  // Try Cohere if it wasn't the active model
  if (activeModel !== 'cohere' && cohereEmbedder) {
    try {
      console.log('Attempting fallback to Cohere embeddings');
      const startTime = Date.now();
      fallbackEmbedding = await cohereEmbedder.embedQuery(text);
      const duration = Date.now() - startTime;
      
      if (!fallbackEmbedding || fallbackEmbedding.length === 0) {
        console.error('Cohere fallback returned empty embedding array');
        throw new Error('Empty embedding returned from Cohere fallback');
      }
      
      console.log(`Successfully fell back to Cohere embeddings in ${duration}ms. Length: ${fallbackEmbedding.length}`);
      return fallbackEmbedding;
    } catch (error: any) {
      console.error('Error using Cohere fallback:', error);
      console.error('Error details:', error.message);
      if (error.response) {
        console.error('API response:', error.response.data);
        console.error('API status:', error.response.status);
      }
    }
  }
  
  // Try OpenAI if it wasn't the active model
  if (activeModel !== 'openai' && openaiEmbedder) {
    try {
      console.log('Attempting fallback to OpenAI embeddings');
      const startTime = Date.now();
      fallbackEmbedding = await openaiEmbedder.embedQuery(text);
      const duration = Date.now() - startTime;
      
      if (!fallbackEmbedding || fallbackEmbedding.length === 0) {
        console.error('OpenAI fallback returned empty embedding array');
        throw new Error('Empty embedding returned from OpenAI fallback');
      }
      
      console.log(`Successfully fell back to OpenAI embeddings in ${duration}ms. Length: ${fallbackEmbedding.length}`);
      return fallbackEmbedding;
    } catch (error: any) {
      console.error('Error using OpenAI fallback:', error);
      console.error('Error details:', error.message);
      if (error.response) {
        console.error('API response:', error.response.data);
        console.error('API status:', error.response.status);
      }
    }
  }
  
  // If all embedding attempts fail, return an empty array or throw an error
  console.error('CRITICAL: Failed to generate embeddings with any available model');
  console.error('API keys status - Cohere: ' + (cohereApiKey ? 'present' : 'missing') + ', OpenAI: ' + (openaiApiKey ? 'present' : 'missing'));
  
  // Return empty array as fallback
  return []; 
}

/**
 * Set the active embedding model
 */
export function setActiveEmbeddingModel(model: 'cohere' | 'openai') {
  activeModel = model
  console.log(`Set active embedding model to: ${model}`)
} 