/**
 * Daily Digest Types
 * Interfaces for the daily research + social post generation pipeline
 */

// --- Research Types ---

export interface ResearchSource {
  type: 'grok_x' | 'rss' | 'google_news';
  title: string;
  url?: string;
  snippet: string;
  author?: string;
  publishedAt?: string;
  metadata?: Record<string, any>;
}

export interface ResearchBundle {
  sources: ResearchSource[];
  grokFindings: GrokFinding[];
  rssArticles: RSSArticle[];
  googleNewsArticles: RSSArticle[];
  fetchedAt: string;
  topicsCovered: string[];
}

export interface GrokFinding {
  topic: string;
  summary: string;
  keyPoints: string[];
  citedPosts: CitedPost[];
  sentiment?: 'bullish' | 'bearish' | 'neutral' | 'mixed';
}

export interface CitedPost {
  author: string;
  content: string;
  url?: string;
  engagement?: {
    likes?: number;
    retweets?: number;
    replies?: number;
  };
}

export interface RSSArticle {
  title: string;
  url: string;
  snippet: string;
  source: string;
  publishedAt?: string;
}

// --- Generation Types ---

export interface GeneratedPost {
  topic: string;
  tags: string[];
  xContent: string;
  linkedinContent: string;
  sourceUrls: string[];
  sourceContext: {
    keyDataPoints: string[];
    relevantQuotes: string[];
  };
  imagePrompt: string;
}

// --- Database Types ---

export interface DigestRun {
  id: string;
  run_date: string;
  status: 'pending' | 'researching' | 'generating' | 'completed' | 'failed';
  research_data: ResearchBundle | null;
  sources_used: string[] | null;
  post_count: number;
  error: string | null;
  created_at: string;
  completed_at: string | null;
}

export interface DigestPost {
  id: string;
  run_id: string;
  topic: string;
  tags: string[] | null;
  x_content: string | null;
  linkedin_content: string | null;
  source_urls: string[] | null;
  source_context: Record<string, any> | null;
  image_prompt: string | null;
  image_url: string | null;
  status: 'pending_review' | 'approved' | 'rejected' | 'posted' | 'failed';
  x_post_id: string | null;
  linkedin_post_id: string | null;
  approved_at: string | null;
  posted_at: string | null;
  created_at: string;
}

// --- Config Types ---

export interface DigestConfig {
  topics: TopicConfig[];
  rssFeeds: RSSFeedConfig[];
  googleNewsQueries: string[];
  postCount: { min: number; max: number };
  grokModel: string;
  claudeModel: string;
}

export interface TopicConfig {
  name: string;
  keywords: string[];
  grokPrompt: string;
}

export interface RSSFeedConfig {
  name: string;
  url: string;
  enabled: boolean;
}
