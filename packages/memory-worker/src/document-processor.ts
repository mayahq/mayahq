import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { v4 as uuidv4 } from 'uuid';
import { generateEmbedding } from './embeddings';

// Document chunk type
export interface DocumentChunk {
  content: string;
  metadata: {
    type: 'document_chunk';
    sourceUrl?: string;
    documentId: string;
    documentTitle: string;
    chunkIndex: number;
    totalChunks: number;
  };
  embedding?: number[];
}

// Processing result
export interface DocumentProcessingResult {
  success: boolean;
  documentId: string;
  chunksCreated: number;
  title: string;
  error?: string;
}

// Configuration for the text splitter
const CHUNK_SIZE = 4000; // ~1000 tokens (4 chars per token average)
const CHUNK_OVERLAP = 800; // ~200 tokens overlap
const SEPARATORS = ['\n\n', '\n', '. ', ' '];

/**
 * Create a configured text splitter for document processing
 */
function createTextSplitter(): RecursiveCharacterTextSplitter {
  return new RecursiveCharacterTextSplitter({
    chunkSize: CHUNK_SIZE,
    chunkOverlap: CHUNK_OVERLAP,
    separators: SEPARATORS,
  });
}

/**
 * Extract plain text from HTML content
 * This is a simple extraction that preserves basic structure
 */
export function extractTextFromHtml(html: string): string {
  // This function expects cheerio-processed text to be passed in
  // The actual cheerio processing happens in the API route
  return html;
}

/**
 * Split text into chunks for embedding
 */
export async function splitTextIntoChunks(text: string): Promise<string[]> {
  const splitter = createTextSplitter();
  const chunks = await splitter.splitText(text);
  return chunks;
}

/**
 * Process a document and store chunks in maya_memories
 *
 * @param text - The raw text content of the document
 * @param title - The document title
 * @param sourceUrl - Optional source URL
 * @param supabase - Supabase client instance
 * @returns Processing result with document ID and chunk count
 */
export async function processAndStoreDocument(
  text: string,
  title: string,
  sourceUrl?: string,
  supabase?: SupabaseClient
): Promise<DocumentProcessingResult> {
  const documentId = uuidv4();

  // Initialize Supabase client if not provided
  if (!supabase) {
    const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      return {
        success: false,
        documentId,
        chunksCreated: 0,
        title,
        error: 'Missing Supabase configuration'
      };
    }

    supabase = createClient(supabaseUrl, supabaseKey);
  }

  try {
    console.log(`[DOC_PROCESSOR] Starting to process document: ${title}`);
    console.log(`[DOC_PROCESSOR] Text length: ${text.length} characters`);

    // Split text into chunks
    const chunks = await splitTextIntoChunks(text);
    console.log(`[DOC_PROCESSOR] Split into ${chunks.length} chunks`);

    if (chunks.length === 0) {
      return {
        success: false,
        documentId,
        chunksCreated: 0,
        title,
        error: 'No chunks created from text'
      };
    }

    // Process each chunk
    let successCount = 0;
    for (let i = 0; i < chunks.length; i++) {
      const chunkContent = chunks[i];

      try {
        console.log(`[DOC_PROCESSOR] Processing chunk ${i + 1}/${chunks.length}`);

        // Generate embedding for this chunk
        const embedding = await generateEmbedding(chunkContent);

        if (!embedding || embedding.length === 0) {
          console.error(`[DOC_PROCESSOR] Failed to generate embedding for chunk ${i + 1}`);
          continue;
        }

        // Prepare memory data
        const memoryData = {
          content: chunkContent,
          metadata: {
            type: 'document_chunk',
            sourceUrl: sourceUrl || null,
            documentId,
            documentTitle: title,
            chunkIndex: i,
            totalChunks: chunks.length,
          },
          embedding,
          embedding_model: 'cohere/embed-english-v3.0',
          embedding_ver: 'v1',
          importance: 0.7, // Documents are generally important
          tags: ['document', 'ingested', title.toLowerCase().replace(/[^a-z0-9]/g, '_').substring(0, 50)],
          created_at: new Date().toISOString(),
        };

        // Insert into maya_memories
        const { error: insertError } = await supabase
          .from('maya_memories')
          .insert(memoryData);

        if (insertError) {
          console.error(`[DOC_PROCESSOR] Error inserting chunk ${i + 1}:`, insertError.message);
          continue;
        }

        successCount++;
        console.log(`[DOC_PROCESSOR] Successfully stored chunk ${i + 1}/${chunks.length}`);

        // Small delay to avoid rate limiting
        if (i < chunks.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      } catch (chunkError: any) {
        console.error(`[DOC_PROCESSOR] Error processing chunk ${i + 1}:`, chunkError.message);
      }
    }

    console.log(`[DOC_PROCESSOR] Document processing complete. ${successCount}/${chunks.length} chunks stored.`);

    return {
      success: successCount > 0,
      documentId,
      chunksCreated: successCount,
      title,
      error: successCount === 0 ? 'Failed to store any chunks' : undefined
    };
  } catch (error: any) {
    console.error('[DOC_PROCESSOR] Error processing document:', error.message);
    return {
      success: false,
      documentId,
      chunksCreated: 0,
      title,
      error: error.message
    };
  }
}

/**
 * Get all chunks for a specific document
 */
export async function getDocumentChunks(
  documentId: string,
  supabase?: SupabaseClient
): Promise<DocumentChunk[]> {
  // Initialize Supabase client if not provided
  if (!supabase) {
    const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      console.error('[DOC_PROCESSOR] Missing Supabase configuration');
      return [];
    }

    supabase = createClient(supabaseUrl, supabaseKey);
  }

  try {
    const { data, error } = await supabase
      .from('maya_memories')
      .select('content, metadata')
      .filter('metadata->documentId', 'eq', documentId)
      .order('metadata->chunkIndex', { ascending: true });

    if (error) {
      console.error('[DOC_PROCESSOR] Error fetching document chunks:', error.message);
      return [];
    }

    return (data || []).map((row: any) => ({
      content: row.content,
      metadata: row.metadata as DocumentChunk['metadata']
    }));
  } catch (error: any) {
    console.error('[DOC_PROCESSOR] Error fetching document chunks:', error.message);
    return [];
  }
}

/**
 * Delete all chunks for a specific document
 */
export async function deleteDocument(
  documentId: string,
  supabase?: SupabaseClient
): Promise<{ success: boolean; deletedCount: number; error?: string }> {
  // Initialize Supabase client if not provided
  if (!supabase) {
    const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      return { success: false, deletedCount: 0, error: 'Missing Supabase configuration' };
    }

    supabase = createClient(supabaseUrl, supabaseKey);
  }

  try {
    const { error, count } = await supabase
      .from('maya_memories')
      .delete({ count: 'exact' })
      .filter('metadata->documentId', 'eq', documentId);

    if (error) {
      return { success: false, deletedCount: 0, error: error.message };
    }

    return { success: true, deletedCount: count || 0 };
  } catch (error: any) {
    return { success: false, deletedCount: 0, error: error.message };
  }
}
