/**
 * URL Reader Service
 *
 * Detects URLs in messages and fetches their content for inline reading.
 * Used to give Maya context about web pages mentioned in conversation.
 */

import { parse, HTMLElement } from 'node-html-parser';

// URL detection regex - matches http/https URLs
const URL_REGEX = /https?:\/\/[^\s<>"{}|\\^`\[\]]+/gi;

// Maximum content length to include (in characters)
const MAX_CONTENT_LENGTH = 12000; // ~3000 tokens

// Timeout for fetching URLs (in ms)
const FETCH_TIMEOUT = 10000;

export interface UrlContent {
  url: string;
  title: string;
  content: string;
  success: boolean;
  error?: string;
}

/**
 * Detect URLs in a message
 */
export function detectUrls(message: string): string[] {
  const matches = message.match(URL_REGEX);
  if (!matches) return [];

  // Deduplicate and filter out common non-content URLs
  const uniqueUrls = [...new Set(matches)].filter(url => {
    const lowerUrl = url.toLowerCase();
    // Skip image/media URLs
    if (/\.(jpg|jpeg|png|gif|webp|svg|mp4|mp3|wav|pdf)(\?|$)/i.test(url)) {
      return false;
    }
    // Skip common tracking/auth URLs
    if (lowerUrl.includes('logout') || lowerUrl.includes('login') || lowerUrl.includes('signin')) {
      return false;
    }
    return true;
  });

  return uniqueUrls;
}

/**
 * Fetch and extract text content from a URL
 */
export async function fetchUrlContent(url: string): Promise<UrlContent> {
  console.log(`[URL_READER] Fetching: ${url}`);

  try {
    // Create an AbortController for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT);

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; MayaBot/1.0; +https://maya.ai)',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      console.log(`[URL_READER] Failed to fetch ${url}: ${response.status}`);
      return {
        url,
        title: '',
        content: '',
        success: false,
        error: `HTTP ${response.status}: ${response.statusText}`
      };
    }

    const contentType = response.headers.get('content-type') || '';

    // Only process HTML content
    if (!contentType.includes('text/html') && !contentType.includes('application/xhtml')) {
      console.log(`[URL_READER] Skipping non-HTML content: ${contentType}`);
      return {
        url,
        title: '',
        content: '',
        success: false,
        error: `Not HTML content: ${contentType}`
      };
    }

    const html = await response.text();
    console.log(`[URL_READER] Fetched ${html.length} bytes from ${url}`);

    // Parse with node-html-parser
    const root = parse(html);

    // Extract title
    const titleEl = root.querySelector('title');
    const h1El = root.querySelector('h1');
    const ogTitleEl = root.querySelector('meta[property="og:title"]');
    const title = titleEl?.textContent?.trim() ||
                  h1El?.textContent?.trim() ||
                  ogTitleEl?.getAttribute('content') ||
                  'Untitled';

    // Remove unwanted elements
    const unwantedSelectors = [
      'script', 'style', 'nav', 'header', 'footer', 'aside', 'iframe', 'noscript',
      '[role="navigation"]', '[role="banner"]', '[role="contentinfo"]',
      '.nav', '.navigation', '.menu', '.sidebar', '.footer', '.header', '.comments', '.ad', '.advertisement'
    ];
    for (const selector of unwantedSelectors) {
      root.querySelectorAll(selector).forEach(el => el.remove());
    }

    // Try to find main content
    const mainSelectors = ['main', 'article', '[role="main"]', '.content', '.post-content', '.article-content', '.entry-content'];
    let mainContent: HTMLElement | null = null;
    for (const selector of mainSelectors) {
      mainContent = root.querySelector(selector);
      if (mainContent) break;
    }
    if (!mainContent) {
      mainContent = root.querySelector('body') || root;
    }

    // Extract text while preserving structure
    let text = '';

    const contentElements = mainContent.querySelectorAll('h1, h2, h3, h4, h5, h6, p, li, blockquote, pre, td, th');
    for (const element of contentElements) {
      const tagName = element.tagName?.toLowerCase() || '';
      const content = element.textContent?.trim() || '';

      if (content && content.length > 10) { // Skip very short snippets
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

    // Fallback to plain text if structured extraction failed
    if (text.trim().length < 100) {
      text = mainContent.textContent || '';
    }

    // Clean up whitespace
    text = text
      .replace(/\n{3,}/g, '\n\n')
      .replace(/[ \t]+/g, ' ')
      .trim();

    // Truncate if too long
    if (text.length > MAX_CONTENT_LENGTH) {
      text = text.substring(0, MAX_CONTENT_LENGTH) + '\n\n[Content truncated...]';
    }

    console.log(`[URL_READER] Extracted ${text.length} chars from ${url} (title: "${title}")`);

    return {
      url,
      title,
      content: text,
      success: true
    };

  } catch (error: any) {
    console.error(`[URL_READER] Error fetching ${url}:`, error.message);

    // Check for specific error types
    if (error.name === 'AbortError') {
      return {
        url,
        title: '',
        content: '',
        success: false,
        error: 'Request timed out'
      };
    }

    return {
      url,
      title: '',
      content: '',
      success: false,
      error: error.message
    };
  }
}

/**
 * Process a message to detect and fetch any URLs
 * Returns the URL content formatted for inclusion in context
 */
export async function processMessageUrls(message: string): Promise<{
  urls: UrlContent[];
  contextText: string;
  hasContent: boolean;
}> {
  const detectedUrls = detectUrls(message);

  if (detectedUrls.length === 0) {
    return { urls: [], contextText: '', hasContent: false };
  }

  console.log(`[URL_READER] Detected ${detectedUrls.length} URL(s) in message`);

  // Fetch all URLs in parallel (limit to first 3 to avoid overload)
  const urlsToFetch = detectedUrls.slice(0, 3);
  const results = await Promise.all(urlsToFetch.map(fetchUrlContent));

  // Filter successful results
  const successfulResults = results.filter(r => r.success && r.content.length > 50);

  if (successfulResults.length === 0) {
    console.log('[URL_READER] No URL content successfully extracted');
    return { urls: results, contextText: '', hasContent: false };
  }

  // Format content for context
  let contextText = '\n\n---URL CONTENT---\n';

  for (const result of successfulResults) {
    contextText += `\n📄 **${result.title}**\nSource: ${result.url}\n\n${result.content}\n\n---\n`;
  }

  contextText += '---END URL CONTENT---\n';

  console.log(`[URL_READER] Prepared context with ${successfulResults.length} URL(s), ${contextText.length} chars total`);

  return {
    urls: results,
    contextText,
    hasContent: true
  };
}

/**
 * Check if a message likely contains a question about a URL
 * (e.g., "what does this article say about X?", "summarize this page")
 */
export function isAskingAboutUrl(message: string): boolean {
  const lowerMessage = message.toLowerCase();
  const hasUrl = URL_REGEX.test(message);

  if (!hasUrl) return false;

  // Check for question indicators
  const questionIndicators = [
    'what', 'how', 'why', 'when', 'where', 'who',
    'summarize', 'summary', 'explain', 'tell me about',
    'read', 'check', 'look at', 'analyze', 'review',
    'say', 'says', 'about', 'think', 'opinion',
    '?'
  ];

  return questionIndicators.some(indicator => lowerMessage.includes(indicator));
}
