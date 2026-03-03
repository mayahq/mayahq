import { createClient } from '@supabase/supabase-js';
import axios from 'axios';
import { RateLimiter } from 'limiter';

// Create Supabase client for caching
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Rate limiter: 10 searches per minute per user
const searchRateLimiter = new RateLimiter({ tokensPerInterval: 10, interval: 'minute' });

// Cache duration in minutes
const CACHE_DURATION_MINUTES = 30;

export interface WebSearchResult {
  title: string;
  snippet: string;
  url: string;
  source: string;
  publishedDate?: string;
}

export interface WebSearchOptions {
  query: string;
  searchType?: 'general' | 'news' | 'technical' | 'academic';
  maxResults?: number;
  userId?: string;
}

/**
 * Check if we have a cached result for this query
 */
async function getCachedResult(query: string, searchType: string): Promise<WebSearchResult[] | null> {
  try {
    const cacheKey = `${searchType}:${query.toLowerCase().trim()}`;
    const cutoffTime = new Date();
    cutoffTime.setMinutes(cutoffTime.getMinutes() - CACHE_DURATION_MINUTES);

    const { data, error } = await supabase
      .from('web_search_cache')
      .select('results')
      .eq('cache_key', cacheKey)
      .gt('created_at', cutoffTime.toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (error || !data) {
      return null;
    }

    console.log(`Found cached search results for query: "${query}"`);
    return data.results as WebSearchResult[];
  } catch (error) {
    console.error('Error checking search cache:', error);
    return null;
  }
}

/**
 * Cache search results
 */
async function cacheResults(query: string, searchType: string, results: WebSearchResult[]): Promise<void> {
  try {
    const cacheKey = `${searchType}:${query.toLowerCase().trim()}`;
    
    await supabase
      .from('web_search_cache')
      .upsert({
        cache_key: cacheKey,
        query: query,
        search_type: searchType,
        results: results,
        created_at: new Date().toISOString()
      });
    
    console.log(`Cached ${results.length} search results for query: "${query}"`);
  } catch (error) {
    console.error('Error caching search results:', error);
    // Don't throw - caching failure shouldn't break the search
  }
}

/**
 * Search using Serper API (requires SERPER_API_KEY env var)
 */
async function searchWithSerper(options: WebSearchOptions): Promise<WebSearchResult[]> {
  const apiKey = process.env.SERPER_API_KEY;
  if (!apiKey) {
    throw new Error('SERPER_API_KEY not configured');
  }

  try {
    const searchType = options.searchType === 'news' ? 'news' : 'search';
    const endpoint = `https://google.serper.dev/${searchType}`;
    
    const response = await axios.post(endpoint, {
      q: options.query,
      num: options.maxResults || 5,
      hl: 'en',
      gl: 'us'
    }, {
      headers: {
        'X-API-KEY': apiKey,
        'Content-Type': 'application/json'
      },
      timeout: 10000 // 10 second timeout
    });

    const results: WebSearchResult[] = [];
    
    if (searchType === 'news' && response.data.news) {
      response.data.news.forEach((item: any) => {
        results.push({
          title: item.title,
          snippet: item.snippet || '',
          url: item.link,
          source: item.source || 'Unknown',
          publishedDate: item.date
        });
      });
    } else if (response.data.organic) {
      response.data.organic.forEach((item: any) => {
        results.push({
          title: item.title,
          snippet: item.snippet || '',
          url: item.link,
          source: new URL(item.link).hostname
        });
      });
    }

    return results;
  } catch (error: any) {
    console.error('Serper API error:', error.response?.data || error.message);
    throw new Error(`Search failed: ${error.message}`);
  }
}

/**
 * Search using Brave Search API (requires BRAVE_SEARCH_API_KEY env var)
 */
async function searchWithBrave(options: WebSearchOptions): Promise<WebSearchResult[]> {
  const apiKey = process.env.BRAVE_SEARCH_API_KEY;
  if (!apiKey) {
    throw new Error('BRAVE_SEARCH_API_KEY not configured');
  }

  try {
    const params = new URLSearchParams({
      q: options.query,
      count: String(options.maxResults || 5),
      search_lang: 'en',
      country: 'us'
    });

    if (options.searchType === 'news') {
      params.append('freshness', 'pw'); // Past week for news
    }

    const response = await axios.get(`https://api.search.brave.com/res/v1/web/search?${params}`, {
      headers: {
        'Accept': 'application/json',
        'Accept-Encoding': 'gzip',
        'X-Subscription-Token': apiKey
      },
      timeout: 10000
    });

    const results: WebSearchResult[] = [];
    
    if (response.data.web?.results) {
      response.data.web.results.forEach((item: any) => {
        results.push({
          title: item.title,
          snippet: item.description || '',
          url: item.url,
          source: new URL(item.url).hostname,
          publishedDate: item.page_age
        });
      });
    }

    return results;
  } catch (error: any) {
    console.error('Brave Search API error:', error.response?.data || error.message);
    throw new Error(`Search failed: ${error.message}`);
  }
}

/**
 * Main web search function with rate limiting and caching
 */
export async function performWebSearch(options: WebSearchOptions): Promise<WebSearchResult[]> {
  try {
    // Validate input
    if (!options.query || options.query.trim().length === 0) {
      throw new Error('Search query cannot be empty');
    }

    // Apply rate limiting if userId is provided
    if (options.userId) {
      const hasTokens = await searchRateLimiter.tryRemoveTokens(1);
      if (!hasTokens) {
        throw new Error('Rate limit exceeded. Please wait before searching again.');
      }
    }

    // Check cache first
    const cachedResults = await getCachedResult(options.query, options.searchType || 'general');
    if (cachedResults) {
      return cachedResults;
    }

    // Limit max results to prevent abuse
    const maxResults = Math.min(options.maxResults || 5, 10);
    const searchOptions = { ...options, maxResults };

    let results: WebSearchResult[] = [];

    // Try primary search provider (Serper)
    if (process.env.SERPER_API_KEY) {
      try {
        results = await searchWithSerper(searchOptions);
      } catch (error) {
        console.error('Serper search failed, trying fallback:', error);
      }
    }

    // Fallback to Brave Search if Serper fails or isn't configured
    if (results.length === 0 && process.env.BRAVE_SEARCH_API_KEY) {
      try {
        results = await searchWithBrave(searchOptions);
      } catch (error) {
        console.error('Brave search also failed:', error);
      }
    }

    // If no search providers are configured, throw error
    if (results.length === 0 && !process.env.SERPER_API_KEY && !process.env.BRAVE_SEARCH_API_KEY) {
      throw new Error('No search API keys configured. Please set SERPER_API_KEY or BRAVE_SEARCH_API_KEY');
    }

    // Cache successful results
    if (results.length > 0) {
      await cacheResults(options.query, options.searchType || 'general', results);
    }

    // Log search for analytics/monitoring
    await logSearchActivity(options.userId || 'anonymous', options.query, results.length);

    return results;
  } catch (error: any) {
    console.error('Web search error:', error);
    throw error;
  }
}

/**
 * Log search activity for monitoring and analytics
 */
async function logSearchActivity(userId: string, query: string, resultCount: number): Promise<void> {
  try {
    await supabase
      .from('web_search_logs')
      .insert({
        user_id: userId,
        query: query,
        result_count: resultCount,
        created_at: new Date().toISOString()
      });
  } catch (error) {
    console.error('Error logging search activity:', error);
    // Don't throw - logging failure shouldn't break the search
  }
}

/**
 * Format search results for inclusion in AI response
 */
export function formatSearchResultsForPrompt(results: WebSearchResult[]): string {
  if (results.length === 0) {
    return 'No search results found.';
  }

  let formatted = 'Web Search Results:\n\n';
  
  results.forEach((result, index) => {
    formatted += `${index + 1}. **${result.title}**\n`;
    formatted += `   Source: ${result.source}\n`;
    if (result.publishedDate) {
      formatted += `   Published: ${result.publishedDate}\n`;
    }
    formatted += `   ${result.snippet}\n`;
    formatted += `   URL: ${result.url}\n\n`;
  });

  return formatted;
} 