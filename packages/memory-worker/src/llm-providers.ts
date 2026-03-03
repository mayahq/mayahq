/**
 * Unified LLM Provider Interface for Maya Memory Worker
 * Supports Claude, Grok, Ollama, HuggingFace, and custom providers with easy swapping
 */

import { ModelConfig, OllamaProvider, HuggingFaceProvider, CustomModelProvider, modelRegistry } from './model-providers';

/**
 * Content block types for multimodal messages (Claude Vision)
 */
export interface TextContentBlock {
  type: 'text';
  text: string;
}

export interface ImageContentBlock {
  type: 'image';
  source: {
    type: 'base64';
    media_type: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';
    data: string;
  };
}

export type ContentBlock = TextContentBlock | ImageContentBlock;

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | ContentBlock[];
}

export interface LLMProvider {
  generateResponse(
    messages: LLMMessage[],
    options?: {
      temperature?: number;
      maxTokens?: number;
      model?: string;
    }
  ): Promise<string>;

  getProviderName(): string;
  getModelName(): string;
}

/**
 * Anthropic Claude Provider
 */
export class AnthropicProvider implements LLMProvider {
  private client: any;
  private modelName: string;

  constructor(apiKey: string, modelName: string = 'claude-opus-4-5-20251101') {
    const { Anthropic } = require('@anthropic-ai/sdk');
    this.client = new Anthropic({ apiKey });
    this.modelName = modelName;
  }

  async generateResponse(
    messages: LLMMessage[],
    options: {
      temperature?: number;
      maxTokens?: number;
      model?: string;
    } = {}
  ): Promise<string> {
    const systemMessage = messages.find(m => m.role === 'system');
    const conversationMessages = messages.filter(m => m.role !== 'system');

    // Handle multimodal content - Claude accepts string or array of content blocks
    const formattedMessages = conversationMessages.map(msg => {
      // If content is already an array (multimodal), use as-is
      if (Array.isArray(msg.content)) {
        return {
          role: msg.role,
          content: msg.content
        };
      }
      // Otherwise, convert string to text content
      return {
        role: msg.role,
        content: msg.content
      };
    });

    // System message must be a string
    const systemContent = typeof systemMessage?.content === 'string'
      ? systemMessage.content
      : (systemMessage?.content as ContentBlock[] | undefined)
          ?.filter((b): b is TextContentBlock => b.type === 'text')
          .map(b => b.text)
          .join('\n') || '';

    const response = await this.client.messages.create({
      model: options.model || this.modelName,
      system: systemContent,
      messages: formattedMessages,
      max_tokens: options.maxTokens || 1000,
      temperature: options.temperature || 0.9
    });

    return response.content
      .filter((block: any) => block.type === 'text')
      .map((block: any) => block.text)
      .join('');
  }

  getProviderName(): string {
    return 'anthropic';
  }

  getModelName(): string {
    return this.modelName;
  }
}

/**
 * xAI Grok Provider
 */
export class GrokProvider implements LLMProvider {
  private client: any;
  private modelName: string;

  constructor(apiKey: string, modelName: string = 'grok-4-0709') {
    // For now, use fetch-based approach until xai_sdk is available in TypeScript
    this.client = { apiKey };
    this.modelName = modelName;
  }

  async generateResponse(
    messages: LLMMessage[],
    options: {
      temperature?: number;
      maxTokens?: number;
      model?: string;
    } = {}
  ): Promise<string> {
    // Convert messages to xAI format
    const formattedMessages = messages.map(msg => ({
      role: msg.role,
      content: msg.content
    }));

    const response = await fetch('https://api.x.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.client.apiKey}`
      },
      body: JSON.stringify({
        model: options.model || this.modelName,
        messages: formattedMessages,
        max_tokens: options.maxTokens || 1000,
        temperature: options.temperature || 0.9
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Grok API error: ${response.status} ${errorText}`);
    }

    const data = await response.json();
    return data.choices[0]?.message?.content || '';
  }

  getProviderName(): string {
    return 'xai';
  }

  getModelName(): string {
    return this.modelName;
  }
}

/**
 * Provider Factory and Configuration
 */
export class LLMProviderManager {
  private providers: Map<string, LLMProvider> = new Map();
  private activeProvider: string;
  private fallbackProvider?: string;

  constructor() {
    this.activeProvider = process.env.LLM_PROVIDER || 'anthropic';
    this.fallbackProvider = process.env.LLM_FALLBACK_PROVIDER;
    this.initializeProviders();
  }

  private initializeProviders() {
    // Initialize Anthropic if API key available
    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    if (anthropicKey) {
      const model = process.env.ANTHROPIC_MODEL || 'claude-opus-4-5-20251101';
      this.providers.set('anthropic', new AnthropicProvider(anthropicKey, model));
    }

    // Initialize Grok if API key available
    const grokKey = process.env.XAI_API_KEY;
    if (grokKey) {
      const model = process.env.GROK_MODEL || 'grok-4-0709';
      this.providers.set('xai', new GrokProvider(grokKey, model));
    }

    // Initialize Ollama (local)
    this.providers.set('ollama', new OllamaProvider());

    // Initialize HuggingFace
    const hfKey = process.env.HUGGINGFACE_API_KEY || '';
    const hfModel = process.env.HUGGINGFACE_MODEL || 'microsoft/DialoGPT-medium';
    this.providers.set('huggingface', new HuggingFaceProvider(hfKey, hfModel));

    // Custom models will be loaded from database separately
    this.loadCustomModels();
  }

  async loadCustomModels() {
    try {
      // Load custom models from database if Supabase client is available
      const { createClient } = require('@supabase/supabase-js');
      if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
        const supabase = createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL,
          process.env.SUPABASE_SERVICE_ROLE_KEY
        );

        await modelRegistry.loadFromDatabase(supabase);

        // Register custom model providers
        const customModels = modelRegistry.getAllModels();
        for (const model of customModels) {
          if (model.provider === 'custom' && model.endpoint) {
            this.providers.set(`custom_${model.id}`, new CustomModelProvider(model));
          }
        }

        console.log(`Loaded ${customModels.length} custom models from database`);
      }
    } catch (error) {
      console.error('Error loading custom models:', error);
    }
  }

  async generateResponse(
    messages: LLMMessage[],
    options?: {
      temperature?: number;
      maxTokens?: number;
      model?: string;
      provider?: string;
    }
  ): Promise<string> {
    const providerName = options?.provider || this.activeProvider;
    const provider = this.providers.get(providerName);

    if (!provider) {
      if (this.fallbackProvider && this.providers.has(this.fallbackProvider)) {
        console.warn(`Provider '${providerName}' not available, falling back to '${this.fallbackProvider}'`);
        return this.providers.get(this.fallbackProvider)!.generateResponse(messages, options);
      }
      throw new Error(`LLM provider '${providerName}' not available. Available: ${Array.from(this.providers.keys()).join(', ')}`);
    }

    try {
      return await provider.generateResponse(messages, options);
    } catch (error) {
      console.error(`Error with provider '${providerName}':`, error);

      // Try fallback provider if available
      if (this.fallbackProvider && this.fallbackProvider !== providerName && this.providers.has(this.fallbackProvider)) {
        console.warn(`Falling back to '${this.fallbackProvider}' due to error`);
        return this.providers.get(this.fallbackProvider)!.generateResponse(messages, options);
      }

      throw error;
    }
  }

  setActiveProvider(providerName: string) {
    if (!this.providers.has(providerName)) {
      throw new Error(`Provider '${providerName}' not available`);
    }
    this.activeProvider = providerName;
  }

  getActiveProvider(): LLMProvider | undefined {
    return this.providers.get(this.activeProvider);
  }

  getAvailableProviders(): string[] {
    return Array.from(this.providers.keys());
  }

  getProviderInfo() {
    const active = this.getActiveProvider();
    return {
      activeProvider: this.activeProvider,
      activeModel: active?.getModelName(),
      availableProviders: this.getAvailableProviders(),
      fallbackProvider: this.fallbackProvider
    };
  }

  async applyDatabaseSettings() {
    try {
      const { createClient } = require('@supabase/supabase-js');
      if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
        const supabase = createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL,
          process.env.SUPABASE_SERVICE_ROLE_KEY
        );

        // Get active provider from database
        const { data: providerSetting, error: providerError } = await supabase
          .from('maya_settings')
          .select('value')
          .eq('key', 'active_llm_provider')
          .single();

        if (!providerError && providerSetting) {
          this.activeProvider = providerSetting.value;
          console.log('Applied active provider from database:', this.activeProvider);
        }

        // Reload custom models
        await this.loadCustomModels();
      }
    } catch (error) {
      console.error('Error applying database settings:', error);
    }
  }
}

// Singleton instance
let providerManager: LLMProviderManager | null = null;

export function getLLMProviderManager(): LLMProviderManager {
  if (!providerManager) {
    providerManager = new LLMProviderManager();
  }
  return providerManager;
}

// Convenience function for backward compatibility
export async function generateResponse(
  userMessage: string,
  systemPrompt: string,
  messageHistory: any[] = [],
  options?: { provider?: string; model?: string; temperature?: number; maxTokens?: number }
): Promise<string> {
  const manager = getLLMProviderManager();

  const messages: LLMMessage[] = [
    { role: 'system', content: systemPrompt },
    ...messageHistory.map(msg => ({
      role: msg.role as 'user' | 'assistant',
      content: msg.content
    })),
    { role: 'user', content: userMessage }
  ];

  return manager.generateResponse(messages, options);
}