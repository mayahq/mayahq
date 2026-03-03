/**
 * Daily Digest Researcher
 * Multi-source research pipeline: Grok (X search), RSS feeds, Google News
 */

import axios from 'axios';
import { parse as parseHTML } from 'node-html-parser';
import type {
  ResearchBundle,
  GrokFinding,
  RSSArticle,
  CitedPost,
  TopicConfig,
  RSSFeedConfig,
} from './types';
import { DIGEST_CONFIG } from './config';

// --- Grok (X Search) ---

async function searchWithGrok(topic: TopicConfig): Promise<GrokFinding> {
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) {
    console.warn('[Digest/Researcher] XAI_API_KEY not set, skipping Grok search');
    return {
      topic: topic.name,
      summary: 'Grok search unavailable (no API key)',
      keyPoints: [],
      citedPosts: [],
    };
  }

  try {
    console.log(`[Digest/Researcher] Searching Grok for: ${topic.name}`);

    // Use the Responses API with x_search tool (replaces deprecated chat/completions search_parameters)
    const response = await axios.post(
      'https://api.x.ai/v1/responses',
      {
        model: DIGEST_CONFIG.grokModel,
        input: [
          {
            role: 'system',
            content:
              'You are a research assistant. Search X/Twitter for recent discussions and return structured findings. Always cite specific posts and authors when possible. Return your findings as JSON.',
          },
          {
            role: 'user',
            content: topic.grokPrompt,
          },
        ],
        tools: [
          {
            type: 'x_search',
            from_date: getYesterdayDate(),
          },
        ],
        store: false,
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 90000,
      }
    );

    // Extract text from Responses API output array
    // Structure: output[] -> find item with type "message" -> content[] -> find type "output_text" -> text
    let content = '';
    const citations: any[] = [];
    const outputItems = Array.isArray(response.data.output) ? response.data.output : [];

    for (const item of outputItems) {
      if (item.type === 'message' && Array.isArray(item.content)) {
        for (const part of item.content) {
          if (part.type === 'output_text' && part.text) {
            content += part.text + '\n';
          }
          // Collect URL citations from annotations
          if (part.annotations) {
            for (const ann of part.annotations) {
              if (ann.type === 'url_citation' && ann.url) {
                citations.push({
                  url: ann.url,
                  title: ann.title || '',
                });
              }
            }
          }
        }
      }
    }
    content = content.trim();

    console.log(`[Digest/Researcher] Grok response for "${topic.name}": ${content.length} chars, ${citations.length} citations`);
    if (!content) {
      console.warn(`[Digest/Researcher] Empty Grok response. Keys: ${Object.keys(response.data).join(', ')}`);
    }

    // Parse the response into structured findings
    return parseGrokResponse(topic.name, content, citations);
  } catch (error: any) {
    const status = error.response?.status;
    const detail = error.response?.data?.error?.message || error.message;
    console.error(`[Digest/Researcher] Grok search failed for "${topic.name}" (${status}):`, detail);
    return {
      topic: topic.name,
      summary: `Search failed: ${detail}`,
      keyPoints: [],
      citedPosts: [],
    };
  }
}

function parseGrokResponse(
  topicName: string,
  content: string,
  citations: any[]
): GrokFinding {
  // Try to parse as JSON first
  try {
    const parsed = JSON.parse(content);
    if (parsed.summary || parsed.keyPoints || parsed.findings) {
      return {
        topic: topicName,
        summary: parsed.summary || content.slice(0, 500),
        keyPoints: parsed.keyPoints || parsed.findings || [],
        citedPosts: (parsed.citedPosts || parsed.posts || []).map(
          (p: any): CitedPost => ({
            author: p.author || p.username || 'unknown',
            content: p.content || p.text || '',
            url: p.url || p.link || undefined,
          })
        ),
        sentiment: parsed.sentiment,
      };
    }
  } catch {
    // Not JSON, parse as text
  }

  // Extract key points from text content
  const lines = content.split('\n').filter((l) => l.trim());
  const keyPoints = lines
    .filter((l) => l.match(/^[-•*\d]/) || l.includes(':'))
    .map((l) => l.replace(/^[-•*\d.)\s]+/, '').trim())
    .filter((l) => l.length > 10)
    .slice(0, 5);

  // Extract cited posts from citations array (Responses API format)
  const citedPosts: CitedPost[] = citations
    .filter((c: any) => c.url || c.web_citation?.url || c.link)
    .map((c: any) => ({
      author: c.author || c.source || c.x_handle || 'unknown',
      content: c.title || c.text || c.snippet || '',
      url: c.url || c.web_citation?.url || c.link || undefined,
    }));

  return {
    topic: topicName,
    summary: content.slice(0, 500),
    keyPoints,
    citedPosts,
  };
}

// --- RSS Feeds ---

async function fetchRSSFeed(feed: RSSFeedConfig): Promise<RSSArticle[]> {
  if (!feed.enabled) return [];

  try {
    console.log(`[Digest/Researcher] Fetching RSS: ${feed.name}`);

    const response = await axios.get(feed.url, {
      timeout: 15000,
      headers: { 'User-Agent': 'MayaDigestBot/1.0' },
    });

    const xml = response.data;
    return parseRSSXML(xml, feed.name);
  } catch (error: any) {
    console.error(`[Digest/Researcher] RSS fetch failed for ${feed.name}:`, error.message);
    return [];
  }
}

function parseRSSXML(xml: string, sourceName: string): RSSArticle[] {
  const articles: RSSArticle[] = [];
  const root = parseHTML(xml);

  // Handle both RSS 2.0 (<item>) and Atom (<entry>) formats
  const items = root.querySelectorAll('item').length > 0
    ? root.querySelectorAll('item')
    : root.querySelectorAll('entry');

  const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;

  for (const item of items) {
    // RSS 2.0 fields
    const title =
      item.querySelector('title')?.textContent?.trim() || '';
    const link =
      item.querySelector('link')?.textContent?.trim() ||
      item.querySelector('link')?.getAttribute('href') ||
      '';
    const description =
      item.querySelector('description')?.textContent?.trim() ||
      item.querySelector('summary')?.textContent?.trim() ||
      '';
    const pubDate =
      item.querySelector('pubDate')?.textContent?.trim() ||
      item.querySelector('published')?.textContent?.trim() ||
      item.querySelector('updated')?.textContent?.trim() ||
      '';

    // Filter to last 24 hours if date is available
    if (pubDate) {
      const pubTime = new Date(pubDate).getTime();
      if (!isNaN(pubTime) && pubTime < oneDayAgo) {
        continue;
      }
    }

    if (title) {
      articles.push({
        title,
        url: link,
        snippet: stripHTML(description).slice(0, 300),
        source: sourceName,
        publishedAt: pubDate || undefined,
      });
    }
  }

  return articles.slice(0, 10); // Cap at 10 per feed
}

function stripHTML(html: string): string {
  return html.replace(/<[^>]*>/g, '').replace(/&[^;]+;/g, ' ').trim();
}

// --- Google News RSS ---

async function fetchGoogleNews(query: string): Promise<RSSArticle[]> {
  try {
    const encodedQuery = encodeURIComponent(query);
    const url = `https://news.google.com/rss/search?q=${encodedQuery}&hl=en-US&gl=US&ceid=US:en`;

    console.log(`[Digest/Researcher] Fetching Google News: "${query}"`);

    const response = await axios.get(url, {
      timeout: 15000,
      headers: { 'User-Agent': 'MayaDigestBot/1.0' },
    });

    return parseRSSXML(response.data, `Google News: ${query}`);
  } catch (error: any) {
    console.error(`[Digest/Researcher] Google News failed for "${query}":`, error.message);
    return [];
  }
}

// --- Orchestrator ---

export async function runResearch(): Promise<ResearchBundle> {
  console.log('[Digest/Researcher] Starting multi-source research...');

  const sourcesUsed: string[] = [];

  // Run all sources in parallel
  const [grokResults, rssResults, googleNewsResults] = await Promise.all([
    // Grok search for each topic
    Promise.all(DIGEST_CONFIG.topics.map(searchWithGrok)),

    // RSS feeds
    Promise.all(DIGEST_CONFIG.rssFeeds.filter((f) => f.enabled).map(fetchRSSFeed)),

    // Google News queries
    Promise.all(DIGEST_CONFIG.googleNewsQueries.map(fetchGoogleNews)),
  ]);

  // Check which sources returned data
  const grokFindings = grokResults.filter((f) => f.keyPoints.length > 0 || f.citedPosts.length > 0);
  if (grokFindings.length > 0) sourcesUsed.push('grok_x');

  const rssArticles = rssResults.flat();
  if (rssArticles.length > 0) sourcesUsed.push('rss');

  const googleNewsArticles = dedupeArticles(googleNewsResults.flat());
  if (googleNewsArticles.length > 0) sourcesUsed.push('google_news');

  // Build combined source list
  const allSources = [
    ...grokFindings.flatMap((f) =>
      f.citedPosts.map((p) => ({
        type: 'grok_x' as const,
        title: f.topic,
        url: p.url,
        snippet: p.content,
        author: p.author,
      }))
    ),
    ...rssArticles.map((a) => ({
      type: 'rss' as const,
      title: a.title,
      url: a.url,
      snippet: a.snippet,
      author: a.source,
      publishedAt: a.publishedAt,
    })),
    ...googleNewsArticles.map((a) => ({
      type: 'google_news' as const,
      title: a.title,
      url: a.url,
      snippet: a.snippet,
      author: a.source,
      publishedAt: a.publishedAt,
    })),
  ];

  const topicsCovered = [
    ...new Set([
      ...grokFindings.map((f) => f.topic),
      ...rssArticles.map((a) => a.source),
    ]),
  ];

  const bundle: ResearchBundle = {
    sources: allSources,
    grokFindings,
    rssArticles,
    googleNewsArticles,
    fetchedAt: new Date().toISOString(),
    topicsCovered,
  };

  console.log(
    `[Digest/Researcher] Research complete: ${grokFindings.length} Grok findings, ` +
      `${rssArticles.length} RSS articles, ${googleNewsArticles.length} Google News articles`
  );

  return bundle;
}

// --- Helpers ---

function getYesterdayDate(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().split('T')[0];
}

function dedupeArticles(articles: RSSArticle[]): RSSArticle[] {
  const seen = new Set<string>();
  return articles.filter((a) => {
    const key = a.title.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 50);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
