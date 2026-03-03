/**
 * Core types and interfaces for Maya AI system
 */

import { SupabaseClient } from '@supabase/supabase-js';

// === Core Configuration Types ===

export interface MayaConfig {
  // Database
  supabase: {
    url: string;
    serviceKey: string;
    client?: SupabaseClient;
  };
  
  // LLM Providers
  llm: {
    primary: LLMProvider;
    fallback?: LLMProvider;
    strategy: FallbackStrategy;
    providers: {
      anthropic?: { apiKey: string; model?: string };
      openai?: { apiKey: string; model?: string };
      cohere?: { apiKey: string; model?: string };
      xai?: { apiKey: string; model?: string };
    };
  };
  
  // Embedding Providers
  embeddings: {
    primary: EmbeddingProvider;
    fallback?: EmbeddingProvider;
    providers: {
      openai?: { apiKey: string; model?: string };
      cohere?: { apiKey: string; model?: string };
    };
  };
  
  // Multimodal Providers
  vision?: {
    provider: VisionProvider;
    config: Record<string, any>;
  };
  
  speech?: {
    tts?: { provider: string; config: Record<string, any> };
    stt?: { provider: string; config: Record<string, any> };
  };
  
  // Performance & Caching
  performance: {
    caching: boolean;
    redis?: { url: string };
    maxRetries: number;
    timeout: number;
  };
  
  // Feature flags
  features: {
    multimodal: boolean;
    webSearch: boolean;
    voiceMode: boolean;
    qualityMonitoring: boolean;
  };
}

// === Provider Types ===

export enum LLMProvider {
  ANTHROPIC = 'anthropic',
  OPENAI = 'openai',
  COHERE = 'cohere',
  XAI = 'xai',
  OLLAMA = 'ollama'
}

export enum EmbeddingProvider {
  OPENAI = 'openai',
  COHERE = 'cohere'
}

export enum VisionProvider {
  CLAUDE = 'claude',
  GPT4V = 'gpt4v'
}

export enum FallbackStrategy {
  NONE = 'none',
  DOWNGRADE = 'downgrade',
  RETRY = 'retry'
}

// === Message & Context Types ===

export interface ProcessingContext {
  userId: string;
  roomId: string;
  messageId: string;
  timestamp: string;
  metadata?: Record<string, any>;
}

export interface MessageInput {
  content: string;
  attachments?: Attachment[];
  context: ProcessingContext;
  options?: ProcessingOptions;
}

export interface Attachment {
  type: 'image' | 'audio' | 'video' | 'file';
  data: string | Buffer | File; // base64, Buffer, or File object
  metadata?: {
    filename?: string;
    mimeType?: string;
    size?: number;
    duration?: number; // for audio/video
  };
}

export interface ProcessingOptions {
  voiceMode?: boolean;
  generateTTS?: boolean;
  skipMemory?: boolean;
  priority?: 'low' | 'normal' | 'high';
  temperature?: number;
  maxTokens?: number;
}

// === Memory & RAG Types ===

export interface Memory {
  id: string;
  content: string;
  embedding?: number[];
  metadata: {
    userId: string;
    timestamp: string;
    type: MemoryType;
    tags: string[];
    source?: string;
    modalities?: ModalityData;
  };
  similarity?: number; // when retrieved
}

export interface ModalityData {
  text?: { content: string; embedding?: number[] };
  image?: { description: string; embedding?: number[]; url?: string };
  audio?: { transcription: string; embedding?: number[]; url?: string };
  video?: { description: string; embedding?: number[]; keyFrames?: string[]; url?: string };
}

export enum MemoryType {
  CONVERSATION = 'conversation',
  FACT = 'fact',
  CORE_FACT = 'core_fact',
  SYSTEM = 'system'
}

export interface Fact {
  id: string;
  subject: string;
  predicate: string;
  object: string;
  confidence: number;
  source: string;
  timestamp: string;
  userId?: string;
}

export interface RetrievalResult {
  memories: Memory[];
  facts: Fact[];
  coreFacts: Fact[];
  totalRelevance: number;
  strategy: string;
}

export interface RetrievalConfig {
  strategies: RetrievalStrategy[];
  fusion: FusionMethod;
  limits: {
    memories: number;
    facts: number;
    coreFacts: number | 'all';
  };
  thresholds: {
    similarity: number;
    confidence: number;
  };
}

export enum RetrievalStrategy {
  SEMANTIC = 'semantic',
  TEMPORAL = 'temporal',
  FACTUAL = 'factual',
  HYBRID = 'hybrid'
}

export enum FusionMethod {
  RRF = 'rrf', // Reciprocal Rank Fusion
  WEIGHTED = 'weighted',
  VOTING = 'voting'
}

// === Response Types ===

export interface MayaResponse {
  content: string;
  metadata: {
    model: string;
    provider: string;
    processingTime: number;
    tokensUsed?: number;
    confidence?: number;
    cached?: boolean;
    retrievalUsed: boolean;
    attachments?: ResponseAttachment[];
  };
  context?: {
    memoriesUsed: number;
    factsUsed: number;
    retrievalStrategy: string;
  };
}

export interface ResponseAttachment {
  type: 'audio' | 'image' | 'video';
  url: string;
  metadata?: Record<string, any>;
}

// === Quality & Monitoring Types ===

export interface QualityMetrics {
  relevance: number;
  coherence: number;
  personality: number;
  factualAccuracy: number;
  overall: number;
}

export interface PerformanceMetrics {
  totalRequests: number;
  successRate: number;
  averageLatency: number;
  cacheHitRate: number;
  errorsByType: Record<string, number>;
  providerUsage: Record<string, number>;
}

// === Error Types ===

export class MayaError extends Error {
  constructor(
    message: string,
    public code: string,
    public provider?: string,
    public recoverable: boolean = true
  ) {
    super(message);
    this.name = 'MayaError';
  }
}

export enum ErrorCode {
  PROVIDER_UNAVAILABLE = 'PROVIDER_UNAVAILABLE',
  RATE_LIMIT = 'RATE_LIMIT',
  AUTHENTICATION = 'AUTHENTICATION',
  CONTEXT_TOO_LONG = 'CONTEXT_TOO_LONG',
  INVALID_INPUT = 'INVALID_INPUT',
  STORAGE_ERROR = 'STORAGE_ERROR',
  PROCESSING_ERROR = 'PROCESSING_ERROR'
}

// === Plugin Types ===

export interface Plugin {
  name: string;
  version: string;
  initialize(config: any): Promise<void>;
  process?(input: any): Promise<any>;
  shutdown?(): Promise<void>;
}

export interface PluginConfig {
  enabled: boolean;
  config: Record<string, any>;
}