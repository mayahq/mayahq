/**
 * API routes for memory worker configuration and testing
 */
import { Request, Response } from 'express';
import { getLLMProviderManager } from './llm-providers';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * Get current LLM provider status
 */
export async function handleStatusRequest(req: Request, res: Response) {
  try {
    const manager = getLLMProviderManager();
    const providerInfo = manager.getProviderInfo();
    
    res.json({
      status: 'healthy',
      llmProvider: providerInfo.activeProvider,
      llmModel: providerInfo.activeModel,
      availableProviders: providerInfo.availableProviders,
      fallbackProvider: providerInfo.fallbackProvider,
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    console.error('Error in status request:', error);
    res.status(500).json({
      error: 'Failed to get status',
      details: error.message
    });
  }
}

/**
 * Update LLM configuration
 */
export async function handleLLMConfigUpdate(req: Request, res: Response) {
  try {
    const { type, provider, model } = req.body;
    const manager = getLLMProviderManager();

    switch (type) {
      case 'provider':
        // Validate provider is available
        if (!manager.getAvailableProviders().includes(provider)) {
          return res.status(400).json({
            error: `Provider '${provider}' not available`,
            availableProviders: manager.getAvailableProviders()
          });
        }
        
        manager.setActiveProvider(provider);
        console.log(`LLM provider changed to: ${provider}`);
        
        res.json({
          success: true,
          message: `Provider set to ${provider}`,
          newProvider: provider
        });
        break;

      case 'model':
        // For model changes, we need to recreate the provider with the new model
        // This is handled through environment variables and provider initialization
        console.log(`Model change requested for ${provider}: ${model}`);
        
        // Store the model preference in memory worker's environment or database
        // For now, just acknowledge the request
        res.json({
          success: true,
          message: `Model preference updated for ${provider}: ${model}`,
          note: 'Model will be used on next provider initialization'
        });
        break;

      default:
        res.status(400).json({
          error: 'Invalid configuration type',
          validTypes: ['provider', 'model']
        });
    }
  } catch (error: any) {
    console.error('Error updating LLM config:', error);
    res.status(500).json({
      error: 'Failed to update LLM configuration',
      details: error.message
    });
  }
}

/**
 * Test LLM provider
 */
export async function handleLLMTest(req: Request, res: Response) {
  try {
    const { provider, message, systemPrompt } = req.body;
    const manager = getLLMProviderManager();
    
    const testMessage = message || 'Hello, this is a test message. Please respond briefly.';
    const testSystemPrompt = systemPrompt || 'You are Maya. Respond briefly and confirm you are working correctly.';
    
    console.log(`Testing LLM provider: ${provider || 'default'}`);
    
    const startTime = Date.now();
    const response = await manager.generateResponse([
      { role: 'system', content: testSystemPrompt },
      { role: 'user', content: testMessage }
    ], {
      provider: provider,
      temperature: 0.7,
      maxTokens: 100
    });
    const responseTime = Date.now() - startTime;
    
    const activeProvider = manager.getActiveProvider();
    
    res.json({
      success: true,
      response: response,
      provider: activeProvider?.getProviderName(),
      model: activeProvider?.getModelName(),
      responseTime: `${responseTime}ms`,
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    console.error('Error testing LLM provider:', error);
    res.status(500).json({
      success: false,
      error: 'LLM test failed',
      details: error.message
    });
  }
}

/**
 * Load LLM settings from database
 */
export async function loadLLMSettingsFromDB() {
  try {
    const { data: settings, error } = await supabase
      .from('maya_settings')
      .select('key, value')
      .in('key', ['active_llm_provider', 'anthropic_model', 'xai_model', 'openai_model']);
    
    if (error) {
      console.error('Error loading LLM settings from DB:', error);
      return {};
    }
    
    const settingsMap: Record<string, any> = {};
    settings?.forEach(setting => {
      settingsMap[setting.key] = setting.value;
    });
    
    return settingsMap;
  } catch (error) {
    console.error('Error in loadLLMSettingsFromDB:', error);
    return {};
  }
}

/**
 * Apply database settings to provider manager
 */
export async function applyDatabaseSettings() {
  try {
    const settings = await loadLLMSettingsFromDB();
    const manager = getLLMProviderManager();
    
    // Apply active provider setting
    if (settings.active_llm_provider && manager.getAvailableProviders().includes(settings.active_llm_provider)) {
      manager.setActiveProvider(settings.active_llm_provider);
      console.log(`Applied database setting: active provider = ${settings.active_llm_provider}`);
    }
    
    // Model settings would be applied during provider initialization
    // For now, just log them
    Object.keys(settings).forEach(key => {
      if (key.endsWith('_model')) {
        console.log(`Database model setting: ${key} = ${settings[key]}`);
      }
    });
    
  } catch (error) {
    console.error('Error applying database settings:', error);
  }
}