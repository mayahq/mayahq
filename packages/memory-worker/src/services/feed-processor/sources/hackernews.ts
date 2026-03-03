/**
 * HackerNews Source
 * Polls HackerNews API and filters for tech/AI content
 */

import { RawFeedItem, HackerNewsFilters } from '../types';

const HN_API_BASE = 'https://hacker-news.firebaseio.com/v0';

interface HNItem {
  id: number;
  type: string;
  by: string;
  time: number;
  text?: string;
  url?: string;
  title?: string;
  score?: number;
  descendants?: number; // comment count
}

/**
 * Default filters for HackerNews items
 */
export const DEFAULT_HN_FILTERS: HackerNewsFilters = {
  minScore: 10,
  minComments: 0, // OR condition with score
  techKeywords: [
    // Programming & Development
    'ai', 'ml', 'machine learning', 'deep learning', 'neural', 'llm', 'gpt', 'claude',
    'openai', 'anthropic', 'langchain', 'transformer', 'diffusion',

    // Tech & Engineering
    'api', 'database', 'postgres', 'sql', 'redis', 'mongodb',
    'docker', 'kubernetes', 'aws', 'cloud', 'serverless',
    'typescript', 'javascript', 'python', 'rust', 'go', 'react', 'nextjs',
    'framework', 'library', 'sdk', 'cli', 'tool', 'dev',

    // Startups & Business
    'startup', 'saas', 'b2b', 'founder', 'yc', 'y combinator',
    'revenue', 'mrr', 'arr', 'growth', 'launch', 'show hn',

    // Emerging Tech
    'robotics', 'robot', 'automation', 'autonomous',
    'crypto', 'blockchain', 'web3', 'bitcoin', 'ethereum',
    'vr', 'ar', 'xr', 'metaverse', 'spatial',

    // Infrastructure
    'backend', 'frontend', 'fullstack', 'devops', 'ci/cd',
    'deployment', 'infrastructure', 'scaling', 'performance',
    'architecture', 'microservices', 'api design',
  ],

  aiKeywords: [
    'artificial intelligence', 'machine learning', 'deep learning',
    'neural network', 'gpt', 'llm', 'large language model',
    'claude', 'openai', 'anthropic', 'gemini', 'llama',
    'transformer', 'attention', 'rag', 'retrieval augmented',
    'embedding', 'vector', 'semantic search',
    'fine-tuning', 'training', 'inference', 'model',
    'chatbot', 'agent', 'autonomous', 'multimodal',
    'vision', 'image generation', 'stable diffusion', 'midjourney',
    'prompt engineering', 'ai safety', 'alignment',
  ],

  excludeKeywords: [
    'obituary', 'rip', 'passed away', 'died',
    'obituaries', 'death', 'funeral',
  ],

  maxAgeHours: 24,
};

/**
 * Fetch top stories from HackerNews
 */
async function fetchTopStories(limit: number = 100): Promise<number[]> {
  const response = await fetch(`${HN_API_BASE}/topstories.json`);
  if (!response.ok) {
    throw new Error(`HN API error: ${response.status}`);
  }
  const ids: number[] = await response.json();
  return ids.slice(0, limit);
}

/**
 * Fetch a single item from HackerNews
 */
async function fetchItem(id: number): Promise<HNItem | null> {
  try {
    const response = await fetch(`${HN_API_BASE}/item/${id}.json`);
    if (!response.ok) {
      return null;
    }
    return await response.json();
  } catch (error) {
    console.error(`[HN Source] Error fetching item ${id}:`, error);
    return null;
  }
}

/**
 * Check if an item matches tech/AI keywords
 */
function matchesKeywords(item: HNItem, filters: HackerNewsFilters): boolean {
  const searchText = `${item.title || ''} ${item.text || ''}`.toLowerCase();

  // Check exclusions first
  for (const keyword of filters.excludeKeywords) {
    if (searchText.includes(keyword.toLowerCase())) {
      return false;
    }
  }

  // Check if it matches tech or AI keywords
  const matchesTech = filters.techKeywords.some(keyword =>
    searchText.includes(keyword.toLowerCase())
  );

  const matchesAI = filters.aiKeywords.some(keyword =>
    searchText.includes(keyword.toLowerCase())
  );

  return matchesTech || matchesAI;
}

/**
 * Check if item meets score/comment thresholds
 */
function meetsThresholds(item: HNItem, filters: HackerNewsFilters): boolean {
  const score = item.score || 0;
  const comments = item.descendants || 0;

  // OR condition: either good score OR good discussion
  return score >= filters.minScore || comments >= filters.minComments;
}

/**
 * Check if item is recent enough
 */
function isRecent(item: HNItem, filters: HackerNewsFilters): boolean {
  const itemAgeHours = (Date.now() / 1000 - item.time) / 3600;
  return itemAgeHours <= filters.maxAgeHours;
}

/**
 * Convert HN item to RawFeedItem
 */
function convertToRawItem(hnItem: HNItem): RawFeedItem {
  return {
    id: String(hnItem.id),
    title: hnItem.title || 'Untitled',
    url: hnItem.url,
    text: hnItem.text,
    author: hnItem.by,
    score: hnItem.score,
    comment_count: hnItem.descendants,
    timestamp: hnItem.time,
    source: 'hackernews',
    metadata: {
      hn_url: `https://news.ycombinator.com/item?id=${hnItem.id}`,
      type: hnItem.type,
    },
  };
}

/**
 * Poll HackerNews for new tech/AI items
 */
export async function pollHackerNews(
  filters: HackerNewsFilters = DEFAULT_HN_FILTERS,
  batchSize: number = 50
): Promise<RawFeedItem[]> {
  console.log('[HN Source] Starting HackerNews poll...');
  console.log(`[HN Source] Filters - minScore: ${filters.minScore}, minComments: ${filters.minComments}, maxAge: ${filters.maxAgeHours}h`);

  try {
    // Fetch top story IDs
    const storyIds = await fetchTopStories(batchSize * 2); // Fetch more than we need for filtering
    console.log(`[HN Source] Fetched ${storyIds.length} top story IDs`);

    // Fetch and filter items
    const items: RawFeedItem[] = [];
    const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

    for (let i = 0; i < storyIds.length && items.length < batchSize; i++) {
      const hnItem = await fetchItem(storyIds[i]);

      if (!hnItem || hnItem.type !== 'story') {
        continue;
      }

      // Apply filters
      if (!isRecent(hnItem, filters)) {
        continue; // Skip old items
      }

      if (!meetsThresholds(hnItem, filters)) {
        continue; // Skip low-score/low-engagement items
      }

      if (!matchesKeywords(hnItem, filters)) {
        continue; // Skip non-tech/AI items
      }

      // Convert and add to results
      const rawItem = convertToRawItem(hnItem);
      items.push(rawItem);
      console.log(`[HN Source] ✓ "${rawItem.title}" (score: ${rawItem.score}, comments: ${rawItem.comment_count})`);

      // Small delay to avoid rate limiting
      await delay(100);
    }

    console.log(`[HN Source] Filtered ${items.length} items from ${storyIds.length} candidates`);
    return items;

  } catch (error: any) {
    console.error('[HN Source] Error polling HackerNews:', error);
    throw new Error(`HN poll failed: ${error.message}`);
  }
}

/**
 * Get a single item by ID (useful for testing)
 */
export async function getHNItem(id: number): Promise<RawFeedItem | null> {
  const hnItem = await fetchItem(id);
  if (!hnItem) {
    return null;
  }
  return convertToRawItem(hnItem);
}

/**
 * Test the HN source
 */
export async function testHNSource(): Promise<void> {
  console.log('[HN Source] Running test poll...');
  try {
    const items = await pollHackerNews(DEFAULT_HN_FILTERS, 5);
    console.log(`[HN Source] Test successful! Found ${items.length} items`);
    items.forEach(item => {
      console.log(`  - ${item.title} (${item.score} pts, ${item.comment_count} comments)`);
    });
  } catch (error) {
    console.error('[HN Source] Test failed:', error);
  }
}
