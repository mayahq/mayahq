/**
 * Feed Processor Types
 * Interfaces for the feed processing service
 */

export interface RawFeedItem {
  id: string;
  title: string;
  url?: string;
  text?: string;
  author?: string;
  score?: number;
  comment_count?: number;
  timestamp?: number;
  source: 'hackernews' | 'github' | 'arxiv';
  metadata?: Record<string, any>;
}

export interface ProcessedFeedItem {
  item_type: string;
  source_system: string;
  content_data: {
    processed_content: string; // Maya's take
    text?: string | null;
    original_title?: string;
    url?: string;
    source_metadata?: {
      score?: number;
      comment_count?: number;
      author?: string;
    };
    hn_url?: string;
  };
  original_context: {
    source_id?: string;
    ingested_at: string;
    source_type: 'api_poll';
    source_identifier?: string;
    raw_item?: RawFeedItem;
  };
  created_by_maya_profile_id?: string;
}

export interface PromptStyle {
  name: string;
  template: string;
  weight: number; // Probability weight
  minScore?: number; // Minimum HN score to use this style
}

export interface ProcessorConfig {
  model: string;
  temperature: number;
  maxTokens: number;
  styleRotationEnabled: boolean;
  recentStylesMemorySize: number; // How many recent styles to avoid
}

export interface HackerNewsFilters {
  minScore: number;
  minComments: number;
  techKeywords: string[];
  aiKeywords: string[];
  excludeKeywords: string[];
  maxAgeHours: number;
}

export interface SourceConfig {
  enabled: boolean;
  pollIntervalMinutes: number;
  batchSize: number;
  filters: HackerNewsFilters;
}

export interface FeedProcessorStats {
  itemsPolled: number;
  itemsFiltered: number;
  itemsProcessed: number;
  itemsFailed: number;
  lastRunAt: string;
  errors: string[];
}
