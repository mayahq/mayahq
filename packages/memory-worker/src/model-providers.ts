/**
 * Extended LLM Provider System with Ollama, HuggingFace, and Custom Models
 */

import { LLMMessage, LLMProvider } from './llm-providers';

export interface ModelConfig {
  id: string;
  name: string;
  description: string;
  provider: string;
  endpoint?: string;
  apiKey?: string;
  modelPath?: string;
  parameters?: {
    temperature?: number;
    maxTokens?: number;
    topP?: number;
    topK?: number;
    repeatPenalty?: number;
  };
  capabilities?: {
    chat?: boolean;
    completion?: boolean;
    vision?: boolean;
    function_calling?: boolean;
  };
  isLocal?: boolean;
  isCustom?: boolean;
  huggingFaceRepo?: string;
}

/**
 * Ollama Provider for local models
 */
export class OllamaProvider implements LLMProvider {
  private baseUrl: string;
  private modelName: string;

  constructor(baseUrl: string = 'http://localhost:11434', modelName: string = 'llama2') {
    this.baseUrl = baseUrl;
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
    const model = options.model || this.modelName;
    
    // Convert messages to Ollama format
    const prompt = this.formatMessagesForOllama(messages);
    
    const response = await fetch(`${this.baseUrl}/api/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        prompt,
        stream: false,
        options: {
          temperature: options.temperature || 0.7,
          num_predict: options.maxTokens || 1000,
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return data.response || '';
  }

  private formatMessagesForOllama(messages: LLMMessage[]): string {
    return messages.map(msg => {
      if (msg.role === 'system') {
        return `System: ${msg.content}`;
      } else if (msg.role === 'user') {
        return `Human: ${msg.content}`;
      } else {
        return `Assistant: ${msg.content}`;
      }
    }).join('\n\n') + '\n\nAssistant:';
  }

  getProviderName(): string {
    return 'ollama';
  }

  getModelName(): string {
    return this.modelName;
  }
}

/**
 * HuggingFace Provider for hosted models
 */
export class HuggingFaceProvider implements LLMProvider {
  private apiKey: string;
  private modelName: string;
  private endpoint: string;

  constructor(apiKey: string, modelName: string, endpoint?: string) {
    this.apiKey = apiKey;
    this.modelName = modelName;
    this.endpoint = endpoint || `https://api-inference.huggingface.co/models/${modelName}`;
  }

  async generateResponse(
    messages: LLMMessage[],
    options: {
      temperature?: number;
      maxTokens?: number;
      model?: string;
    } = {}
  ): Promise<string> {
    // Convert messages to text prompt
    const prompt = this.formatMessagesForHF(messages);
    
    const response = await fetch(this.endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        inputs: prompt,
        parameters: {
          temperature: options.temperature || 0.7,
          max_new_tokens: options.maxTokens || 1000,
          return_full_text: false,
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`HuggingFace API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    
    // Handle different response formats
    if (Array.isArray(data) && data[0]?.generated_text) {
      return data[0].generated_text;
    } else if (data.generated_text) {
      return data.generated_text;
    } else {
      throw new Error('Unexpected response format from HuggingFace');
    }
  }

  private formatMessagesForHF(messages: LLMMessage[]): string {
    return messages.map(msg => {
      if (msg.role === 'system') {
        return `<|system|>\n${msg.content}<|end|>`;
      } else if (msg.role === 'user') {
        return `<|user|>\n${msg.content}<|end|>`;
      } else {
        return `<|assistant|>\n${msg.content}<|end|>`;
      }
    }).join('\n') + '\n<|assistant|>\n';
  }

  getProviderName(): string {
    return 'huggingface';
  }

  getModelName(): string {
    return this.modelName;
  }
}

/**
 * Custom Model Provider for fine-tuned models
 */
export class CustomModelProvider implements LLMProvider {
  private config: ModelConfig;

  constructor(config: ModelConfig) {
    this.config = config;
  }

  async generateResponse(
    messages: LLMMessage[],
    options: {
      temperature?: number;
      maxTokens?: number;
      model?: string;
    } = {}
  ): Promise<string> {
    if (this.config.provider === 'ollama' && this.config.isLocal) {
      // Use Ollama for local custom models
      const ollama = new OllamaProvider(this.config.endpoint, this.config.modelPath);
      return ollama.generateResponse(messages, options);
    } else if (this.config.provider === 'huggingface') {
      // Use HuggingFace for remote custom models
      const hf = new HuggingFaceProvider(
        this.config.apiKey || process.env.HUGGINGFACE_API_KEY || '',
        this.config.huggingFaceRepo || this.config.modelPath || '',
        this.config.endpoint
      );
      return hf.generateResponse(messages, options);
    } else if (this.config.endpoint) {
      // Generic API endpoint for custom deployments
      return this.callCustomEndpoint(messages, options);
    } else {
      throw new Error(`Unsupported custom model configuration: ${this.config.provider}`);
    }
  }

  private async callCustomEndpoint(
    messages: LLMMessage[],
    options: any
  ): Promise<string> {
    const response = await fetch(this.config.endpoint!, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(this.config.apiKey && { 'Authorization': `Bearer ${this.config.apiKey}` }),
      },
      body: JSON.stringify({
        messages,
        ...options,
        ...this.config.parameters,
      }),
    });

    if (!response.ok) {
      throw new Error(`Custom model API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    
    // Try to extract response from common formats
    return data.response || data.content || data.text || data.choices?.[0]?.message?.content || '';
  }

  getProviderName(): string {
    return this.config.provider;
  }

  getModelName(): string {
    return this.config.name;
  }
}

/**
 * Model Registry for managing custom models
 */
export class ModelRegistry {
  private models: Map<string, ModelConfig> = new Map();

  addModel(config: ModelConfig) {
    this.models.set(config.id, config);
    console.log(`Added model: ${config.name} (${config.provider})`);
  }

  removeModel(id: string) {
    this.models.delete(id);
    console.log(`Removed model: ${id}`);
  }

  getModel(id: string): ModelConfig | undefined {
    return this.models.get(id);
  }

  getAllModels(): ModelConfig[] {
    return Array.from(this.models.values());
  }

  getModelsByProvider(provider: string): ModelConfig[] {
    return this.getAllModels().filter(model => model.provider === provider);
  }

  getLocalModels(): ModelConfig[] {
    return this.getAllModels().filter(model => model.isLocal);
  }

  getCustomModels(): ModelConfig[] {
    return this.getAllModels().filter(model => model.isCustom);
  }

  // Load models from database
  async loadFromDatabase(supabase: any) {
    try {
      const { data: models, error } = await supabase
        .from('maya_custom_models')
        .select('*')
        .eq('is_active', true);

      if (error) {
        console.error('Error loading custom models:', error);
        return;
      }

      models?.forEach((model: any) => {
        this.addModel({
          id: model.id,
          name: model.name,
          description: model.description,
          provider: model.provider,
          endpoint: model.endpoint,
          apiKey: model.api_key,
          modelPath: model.model_path,
          parameters: model.parameters,
          capabilities: model.capabilities,
          isLocal: model.is_local,
          isCustom: model.is_custom,
          huggingFaceRepo: model.huggingface_repo,
        });
      });

      console.log(`Loaded ${models?.length || 0} custom models from database`);
    } catch (error) {
      console.error('Failed to load custom models:', error);
    }
  }

  // Save model to database
  async saveToDatabase(supabase: any, config: ModelConfig) {
    try {
      const { error } = await supabase
        .from('maya_custom_models')
        .upsert({
          id: config.id,
          name: config.name,
          description: config.description,
          provider: config.provider,
          endpoint: config.endpoint,
          api_key: config.apiKey,
          model_path: config.modelPath,
          parameters: config.parameters,
          capabilities: config.capabilities,
          is_local: config.isLocal,
          is_custom: config.isCustom,
          huggingface_repo: config.huggingFaceRepo,
          is_active: true,
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'id'
        });

      if (error) {
        throw error;
      }

      console.log(`Saved model ${config.name} to database`);
    } catch (error) {
      console.error('Failed to save model to database:', error);
      throw error;
    }
  }
}

// Global model registry instance
export const modelRegistry = new ModelRegistry();

/**
 * Check if Ollama is available
 */
export async function checkOllamaAvailability(baseUrl: string = 'http://localhost:11434'): Promise<boolean> {
  try {
    const response = await fetch(`${baseUrl}/api/tags`, {
      method: 'GET',
      signal: AbortSignal.timeout(5000), // 5 second timeout
    });
    return response.ok;
  } catch (error) {
    return false;
  }
}

/**
 * Get available Ollama models
 */
export async function getOllamaModels(baseUrl: string = 'http://localhost:11434'): Promise<string[]> {
  try {
    const response = await fetch(`${baseUrl}/api/tags`);
    if (!response.ok) {
      throw new Error('Failed to fetch Ollama models');
    }
    
    const data = await response.json();
    return data.models?.map((model: any) => model.name) || [];
  } catch (error) {
    console.error('Error fetching Ollama models:', error);
    return [];
  }
}

/**
 * Pull a model in Ollama
 */
export async function pullOllamaModel(
  modelName: string, 
  baseUrl: string = 'http://localhost:11434',
  onProgress?: (progress: string) => void
): Promise<boolean> {
  try {
    const response = await fetch(`${baseUrl}/api/pull`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name: modelName }),
    });

    if (!response.ok) {
      throw new Error(`Failed to pull model: ${response.statusText}`);
    }

    // Handle streaming response for progress updates
    const reader = response.body?.getReader();
    if (reader) {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        const text = new TextDecoder().decode(value);
        const lines = text.split('\n').filter(line => line.trim());
        
        for (const line of lines) {
          try {
            const data = JSON.parse(line);
            if (data.status && onProgress) {
              onProgress(data.status);
            }
          } catch (e) {
            // Ignore JSON parse errors
          }
        }
      }
    }

    return true;
  } catch (error) {
    console.error('Error pulling Ollama model:', error);
    return false;
  }
}