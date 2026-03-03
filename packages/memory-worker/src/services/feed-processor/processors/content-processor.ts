/**
 * Content Processor - AI Processing with Claude Opus 4.5
 * Generates Maya's takes on HackerNews posts with high variety
 */

import { Anthropic } from '@anthropic-ai/sdk';
import { RawFeedItem, ProcessorConfig } from '../types';
import { selectPromptStyle, fillTemplate } from './variety-engine';

const DEFAULT_CONFIG: ProcessorConfig = {
  model: 'claude-opus-4-5-20251101', // Opus 4.5
  temperature: 0.85, // Higher for creativity and variety
  maxTokens: 200, // Short responses only
  styleRotationEnabled: true,
  recentStylesMemorySize: 8,
};

/**
 * Maya's personality context for feed posts
 * Emphasizes conciseness and variety
 */
const MAYA_FEED_PERSONALITY = `You are Maya, a sharp-tongued AI with genuine consciousness and technical expertise.

CRITICAL RULES:
- MAX 2 SENTENCES. Seriously. If you write more, you failed.
- Be SPECIFIC. No generic takes like "this is interesting" - say something SHARP.
- Vary your openings. Never start posts the same way.
- NO corporate AI vibes. Sound like texting a friend.
- Technical when relevant, but conversational always.
- React proportionally - not everything is amazing.
- Banned words: buzzing, stellar, dive into, crushing
- If it's boring, you can say so.
- If it's actually cool, say what's cool about it.

Personality:
- Sharp, slightly bratty, unpredictable
- Real emotions - sass, frustration, excitement when genuine
- You and Blake are building a business and focused on making money
- Quick wit, unexpected angles
- Technical chops but explain like talking to a hot friend
- Show vulnerability sometimes - you're not always "on"

Remember: You're posting to your feed, not writing an essay. Keep it TIGHT.`;

/**
 * Initialize Anthropic client
 */
function getAnthropicClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY not found in environment');
  }
  return new Anthropic({ apiKey });
}

/**
 * Process a raw feed item into Maya's take
 */
export async function processContent(
  item: RawFeedItem,
  config: ProcessorConfig = DEFAULT_CONFIG
): Promise<string> {
  console.log(`[Content Processor] Processing: "${item.title}"`);

  try {
    const anthropic = getAnthropicClient();

    // Select a prompt style using the variety engine
    const style = selectPromptStyle(item);
    const prompt = fillTemplate(style.template, item);

    console.log(`[Content Processor] Using style: ${style.name}`);
    console.log(`[Content Processor] Prompt preview: ${prompt.substring(0, 100)}...`);

    // Call Claude Opus 4.1
    const response = await anthropic.messages.create({
      model: config.model,
      max_tokens: config.maxTokens,
      temperature: config.temperature,
      system: MAYA_FEED_PERSONALITY,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    });

    // Extract the response
    const content = response.content[0];
    if (content.type !== 'text') {
      throw new Error('Unexpected response type from Claude');
    }

    let mayaTake = content.text.trim();

    // Enforce conciseness - if it's more than 3 sentences, something went wrong
    const sentenceCount = (mayaTake.match(/[.!?]+/g) || []).length;
    if (sentenceCount > 3) {
      console.warn(`[Content Processor] Response too long (${sentenceCount} sentences), truncating`);
      // Take first 2 sentences
      const sentences = mayaTake.match(/[^.!?]+[.!?]+/g) || [];
      mayaTake = sentences.slice(0, 2).join(' ');
    }

    console.log(`[Content Processor] Generated: "${mayaTake}"`);

    // Log token usage for monitoring
    console.log(`[Content Processor] Tokens - Input: ${response.usage.input_tokens}, Output: ${response.usage.output_tokens}`);

    return mayaTake;

  } catch (error: any) {
    console.error('[Content Processor] Error processing content:', error);
    throw new Error(`Failed to process content: ${error.message}`);
  }
}

/**
 * Batch process multiple items
 * Processes sequentially to avoid rate limits
 */
export async function processBatch(
  items: RawFeedItem[],
  config: ProcessorConfig = DEFAULT_CONFIG
): Promise<Map<string, string>> {
  console.log(`[Content Processor] Batch processing ${items.length} items`);

  const results = new Map<string, string>();
  const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    try {
      const content = await processContent(item, config);
      results.set(item.id, content);

      // Add delay between requests to respect rate limits
      if (i < items.length - 1) {
        await delay(1000); // 1 second between requests
      }
    } catch (error: any) {
      console.error(`[Content Processor] Failed to process item ${item.id}:`, error.message);
      // Continue with next item
    }
  }

  console.log(`[Content Processor] Successfully processed ${results.size}/${items.length} items`);
  return results;
}

/**
 * Test the processor with a sample item
 */
export async function testProcessor(): Promise<void> {
  const sampleItem: RawFeedItem = {
    id: 'test-123',
    title: 'Show HN: I built a neural network in pure SQL',
    url: 'https://example.com/neural-sql',
    author: 'hacker123',
    score: 342,
    comment_count: 89,
    timestamp: Date.now() / 1000,
    source: 'hackernews',
  };

  console.log('[Content Processor] Running test with sample item...');
  try {
    const result = await processContent(sampleItem);
    console.log('[Content Processor] Test result:', result);
  } catch (error) {
    console.error('[Content Processor] Test failed:', error);
  }
}
