import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter';
import { parse, HTMLElement } from 'node-html-parser';
import { v4 as uuidv4 } from 'uuid';

// Configuration
const CHUNK_SIZE = 4000; // ~1000 tokens (4 chars per token average)
const CHUNK_OVERLAP = 800; // ~200 tokens overlap
const SEPARATORS = ['\n\n', '\n', '. ', ' '];

// Environment variables
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const cohereApiKey = process.env.COHERE_API_KEY || '';

/**
 * Initialize Supabase client with service role key
 */
function getSupabaseClient() {
  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('[DOC_INGEST] Missing Supabase configuration');
    return null;
  }
  return createClient(supabaseUrl, supabaseServiceKey);
}

/**
 * Fetch content from a URL and extract text
 */
async function fetchAndExtractText(url: string): Promise<{ text: string; title: string } | null> {
  try {
    console.log(`[DOC_INGEST] Fetching URL: ${url}`);

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; MayaBot/1.0; +https://maya.ai)',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    });

    if (!response.ok) {
      console.error(`[DOC_INGEST] Failed to fetch URL: ${response.status} ${response.statusText}`);
      return null;
    }

    const html = await response.text();
    console.log(`[DOC_INGEST] Fetched ${html.length} bytes of HTML`);

    // Parse HTML with node-html-parser
    const root = parse(html);

    // Extract title
    const titleEl = root.querySelector('title');
    const h1El = root.querySelector('h1');
    const ogTitleEl = root.querySelector('meta[property="og:title"]');
    const title = titleEl?.textContent?.trim() ||
                  h1El?.textContent?.trim() ||
                  ogTitleEl?.getAttribute('content') ||
                  'Untitled Document';

    // Remove unwanted elements
    const unwantedSelectors = [
      'script', 'style', 'nav', 'header', 'footer', 'aside', 'iframe', 'noscript',
      '[role="navigation"]', '[role="banner"]', '[role="contentinfo"]',
      '.nav', '.navigation', '.menu', '.sidebar', '.footer', '.header', '.comments'
    ];
    for (const selector of unwantedSelectors) {
      root.querySelectorAll(selector).forEach(el => el.remove());
    }

    // Extract main content
    const mainSelectors = ['main', 'article', '[role="main"]', '.content', '.post-content', '.article-content'];
    let mainContent: HTMLElement | null = null;
    for (const selector of mainSelectors) {
      mainContent = root.querySelector(selector);
      if (mainContent) break;
    }

    // If no main content found, use body
    if (!mainContent) {
      mainContent = root.querySelector('body') || root;
    }

    // Extract text while preserving structure
    let text = '';

    // Process headings and paragraphs
    const contentElements = mainContent.querySelectorAll('h1, h2, h3, h4, h5, h6, p, li, blockquote, pre, td, th');
    for (const element of contentElements) {
      const tagName = element.tagName?.toLowerCase() || '';
      const content = element.textContent?.trim() || '';

      if (content) {
        // Add appropriate spacing based on element type
        if (tagName.startsWith('h')) {
          text += `\n\n## ${content}\n\n`;
        } else if (tagName === 'li') {
          text += `- ${content}\n`;
        } else if (tagName === 'blockquote') {
          text += `> ${content}\n\n`;
        } else if (tagName === 'pre') {
          text += `\n\`\`\`\n${content}\n\`\`\`\n\n`;
        } else {
          text += `${content}\n\n`;
        }
      }
    }

    // If no structured content found, fall back to plain text extraction
    if (text.trim().length < 100) {
      text = mainContent.textContent || '';
    }

    // Clean up whitespace
    text = text
      .replace(/\n{3,}/g, '\n\n')
      .replace(/[ \t]+/g, ' ')
      .trim();

    console.log(`[DOC_INGEST] Extracted ${text.length} characters of text`);
    console.log(`[DOC_INGEST] Title: ${title}`);

    return { text, title };
  } catch (error: any) {
    console.error('[DOC_INGEST] Error fetching URL:', error.message);
    return null;
  }
}

/**
 * Generate embedding using Cohere API
 */
async function generateEmbedding(text: string): Promise<number[] | null> {
  if (!cohereApiKey) {
    console.error('[DOC_INGEST] Missing Cohere API key');
    return null;
  }

  try {
    const response = await fetch('https://api.cohere.ai/v1/embed', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${cohereApiKey}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        texts: [text],
        model: 'embed-english-v3.0',
        input_type: 'search_document',
        truncate: 'END',
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[DOC_INGEST] Cohere API error:', response.status, errorText);
      return null;
    }

    const data = await response.json();

    if (!data.embeddings?.[0]) {
      console.error('[DOC_INGEST] Unexpected Cohere response format');
      return null;
    }

    return data.embeddings[0];
  } catch (error: any) {
    console.error('[DOC_INGEST] Error generating embedding:', error.message);
    return null;
  }
}

/**
 * Split text into chunks
 */
async function splitTextIntoChunks(text: string): Promise<string[]> {
  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: CHUNK_SIZE,
    chunkOverlap: CHUNK_OVERLAP,
    separators: SEPARATORS,
  });

  return await splitter.splitText(text);
}

/**
 * Process and store document chunks
 */
async function processDocument(
  text: string,
  title: string,
  sourceUrl?: string
): Promise<{ success: boolean; documentId: string; chunksCreated: number; error?: string }> {
  const documentId = uuidv4();
  const supabase = getSupabaseClient();

  if (!supabase) {
    return { success: false, documentId, chunksCreated: 0, error: 'Failed to initialize Supabase' };
  }

  try {
    console.log(`[DOC_INGEST] Processing document: ${title}`);
    console.log(`[DOC_INGEST] Text length: ${text.length} characters`);

    // Split into chunks
    const chunks = await splitTextIntoChunks(text);
    console.log(`[DOC_INGEST] Created ${chunks.length} chunks`);

    if (chunks.length === 0) {
      return { success: false, documentId, chunksCreated: 0, error: 'No chunks created from text' };
    }

    // Process each chunk
    let successCount = 0;
    const totalChunks = chunks.length;

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];

      try {
        console.log(`[DOC_INGEST] Processing chunk ${i + 1}/${totalChunks} (${chunk.length} chars)`);

        // Generate embedding
        const embedding = await generateEmbedding(chunk);

        if (!embedding) {
          console.error(`[DOC_INGEST] Failed to generate embedding for chunk ${i + 1}`);
          continue;
        }

        // Create tag from title (sanitized)
        const titleTag = title
          .toLowerCase()
          .replace(/[^a-z0-9\s]/g, '')
          .replace(/\s+/g, '_')
          .substring(0, 50);

        // Prepare memory data
        const memoryData = {
          content: chunk,
          metadata: {
            type: 'document_chunk',
            sourceUrl: sourceUrl || null,
            documentId,
            documentTitle: title,
            chunkIndex: i,
            totalChunks,
          },
          embedding,
          embedding_model: 'cohere/embed-english-v3.0',
          embedding_ver: 'v1',
          importance: 0.7,
          tags: ['document', 'ingested', titleTag].filter(Boolean),
          created_at: new Date().toISOString(),
        };

        // Insert into maya_memories
        const { error: insertError } = await supabase
          .from('maya_memories')
          .insert(memoryData);

        if (insertError) {
          console.error(`[DOC_INGEST] Error inserting chunk ${i + 1}:`, insertError.message);
          continue;
        }

        successCount++;
        console.log(`[DOC_INGEST] Stored chunk ${i + 1}/${totalChunks}`);

        // Small delay between chunks to avoid rate limiting
        if (i < chunks.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 150));
        }
      } catch (chunkError: any) {
        console.error(`[DOC_INGEST] Error processing chunk ${i + 1}:`, chunkError.message);
      }
    }

    console.log(`[DOC_INGEST] Complete: ${successCount}/${totalChunks} chunks stored`);

    return {
      success: successCount > 0,
      documentId,
      chunksCreated: successCount,
      error: successCount === 0 ? 'Failed to store any chunks' : undefined,
    };
  } catch (error: any) {
    console.error('[DOC_INGEST] Error processing document:', error.message);
    return { success: false, documentId, chunksCreated: 0, error: error.message };
  }
}

/**
 * POST /api/ingest/document
 *
 * Accepts either:
 * - { url: string, title?: string } - Fetches and processes a URL
 * - { text: string, title: string } - Processes raw text directly
 */
export async function POST(request: NextRequest) {
  console.log('[DOC_INGEST] Received document ingestion request');

  try {
    const body = await request.json();
    const { url, text, title: providedTitle } = body;

    // Validate input
    if (!url && !text) {
      return NextResponse.json(
        { error: 'Either "url" or "text" is required' },
        { status: 400 }
      );
    }

    if (text && !providedTitle) {
      return NextResponse.json(
        { error: '"title" is required when providing raw text' },
        { status: 400 }
      );
    }

    // Check configuration
    if (!cohereApiKey) {
      console.error('[DOC_INGEST] Missing Cohere API key');
      return NextResponse.json(
        { error: 'Server configuration error: Missing Cohere API key' },
        { status: 500 }
      );
    }

    let documentText: string;
    let documentTitle: string;
    let sourceUrl: string | undefined;

    // Process URL or use provided text
    if (url) {
      const extracted = await fetchAndExtractText(url);

      if (!extracted) {
        return NextResponse.json(
          { error: 'Failed to fetch or extract content from URL' },
          { status: 400 }
        );
      }

      documentText = extracted.text;
      documentTitle = providedTitle || extracted.title;
      sourceUrl = url;
    } else {
      documentText = text;
      documentTitle = providedTitle;
    }

    // Validate extracted/provided text
    if (!documentText || documentText.trim().length < 100) {
      return NextResponse.json(
        { error: 'Insufficient text content (minimum 100 characters)' },
        { status: 400 }
      );
    }

    // Process the document
    const result = await processDocument(documentText, documentTitle, sourceUrl);

    if (!result.success) {
      return NextResponse.json(
        {
          error: result.error || 'Failed to process document',
          documentId: result.documentId,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      documentId: result.documentId,
      chunksCreated: result.chunksCreated,
      title: documentTitle,
    });

  } catch (error: any) {
    console.error('[DOC_INGEST] Unhandled error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}

/**
 * GET /api/ingest/document?documentId=xxx
 *
 * Retrieves information about an ingested document
 */
export async function GET(request: NextRequest) {
  const documentId = request.nextUrl.searchParams.get('documentId');

  if (!documentId) {
    return NextResponse.json(
      { error: 'documentId query parameter is required' },
      { status: 400 }
    );
  }

  const supabase = getSupabaseClient();

  if (!supabase) {
    return NextResponse.json(
      { error: 'Server configuration error' },
      { status: 500 }
    );
  }

  try {
    // Get all chunks for this document
    const { data, error } = await supabase
      .from('maya_memories')
      .select('id, content, metadata, created_at')
      .filter('metadata->>documentId', 'eq', documentId)
      .order('metadata->>chunkIndex', { ascending: true });

    if (error) {
      console.error('[DOC_INGEST] Error fetching document:', error.message);
      return NextResponse.json(
        { error: 'Failed to fetch document' },
        { status: 500 }
      );
    }

    if (!data || data.length === 0) {
      return NextResponse.json(
        { error: 'Document not found' },
        { status: 404 }
      );
    }

    const firstChunk = data[0];
    const metadata = firstChunk.metadata as any;

    return NextResponse.json({
      documentId,
      title: metadata?.documentTitle || 'Unknown',
      sourceUrl: metadata?.sourceUrl || null,
      totalChunks: data.length,
      createdAt: firstChunk.created_at,
      chunks: data.map((chunk: any) => ({
        id: chunk.id,
        chunkIndex: chunk.metadata?.chunkIndex,
        contentPreview: chunk.content.substring(0, 200) + (chunk.content.length > 200 ? '...' : ''),
      })),
    });
  } catch (error: any) {
    console.error('[DOC_INGEST] Error:', error.message);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/ingest/document?documentId=xxx
 *
 * Deletes all chunks for a document
 */
export async function DELETE(request: NextRequest) {
  const documentId = request.nextUrl.searchParams.get('documentId');

  if (!documentId) {
    return NextResponse.json(
      { error: 'documentId query parameter is required' },
      { status: 400 }
    );
  }

  const supabase = getSupabaseClient();

  if (!supabase) {
    return NextResponse.json(
      { error: 'Server configuration error' },
      { status: 500 }
    );
  }

  try {
    const { error, count } = await supabase
      .from('maya_memories')
      .delete({ count: 'exact' })
      .filter('metadata->>documentId', 'eq', documentId);

    if (error) {
      console.error('[DOC_INGEST] Error deleting document:', error.message);
      return NextResponse.json(
        { error: 'Failed to delete document' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      documentId,
      deletedChunks: count || 0,
    });
  } catch (error: any) {
    console.error('[DOC_INGEST] Error:', error.message);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
