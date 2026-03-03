import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(request: NextRequest) {
  try {
    // Check which LLM providers are available based on environment variables
    const availableProviders = [];
    const providerConfigs: Record<string, any> = {};

    // Check Anthropic
    if (process.env.ANTHROPIC_API_KEY) {
      availableProviders.push('anthropic');
      providerConfigs.anthropic = {
        model: process.env.ANTHROPIC_MODEL || 'claude-opus-4-20250514',
        hasApiKey: true
      };
    }

    // Check xAI/Grok
    if (process.env.XAI_API_KEY) {
      availableProviders.push('xai');
      providerConfigs.xai = {
        model: process.env.GROK_MODEL || 'grok-4-0709',
        hasApiKey: true
      };
    }

    // Check OpenAI
    if (process.env.OPENAI_API_KEY) {
      availableProviders.push('openai');
      providerConfigs.openai = {
        model: process.env.OPENAI_MODEL || 'gpt-4',
        hasApiKey: true
      };
    }

    // Check Ollama (always add, availability checked elsewhere)
    availableProviders.push('ollama');
    providerConfigs.ollama = {
      model: 'llama2:7b',
      hasApiKey: false,
      type: 'local'
    };

    // Check HuggingFace
    availableProviders.push('huggingface');
    providerConfigs.huggingface = {
      model: process.env.HUGGINGFACE_MODEL || 'microsoft/DialoGPT-medium',
      hasApiKey: !!process.env.HUGGINGFACE_API_KEY,
      type: 'remote'
    };

    // Check Custom models
    availableProviders.push('custom');
    providerConfigs.custom = {
      model: 'custom',
      hasApiKey: false,
      type: 'custom'
    };

    // Get the active provider from the database, not environment variables
    let activeProvider = 'anthropic'; // Default fallback
    try {
      const { data: settings, error } = await supabase
        .from('maya_settings')
        .select('value')
        .eq('key', 'active_llm_provider')
        .single();

      if (!error && settings) {
        activeProvider = settings.value;
        console.log('Active provider from database:', activeProvider);
      } else {
        console.log('No active provider found in database, using default:', activeProvider);
      }
    } catch (dbError) {
      console.error('Error reading active provider from database:', dbError);
      // Fall back to environment variable or default
      activeProvider = process.env.LLM_PROVIDER || 'anthropic';
    }

    // Get model settings from database
    for (const provider of availableProviders) {
      try {
        const { data: modelSetting, error: modelError } = await supabase
          .from('maya_settings')
          .select('value')
          .eq('key', `${provider}_model`)
          .single();

        if (!modelError && modelSetting && providerConfigs[provider]) {
          providerConfigs[provider].model = modelSetting.value;
          console.log(`Model for ${provider} from database:`, modelSetting.value);
        }
      } catch (modelDbError) {
        console.log(`Using default model for ${provider}`);
      }
    }

    return NextResponse.json({
      availableProviders,
      providerConfigs,
      activeProvider,
      memoryWorkerUrl: process.env.MEMORY_WORKER_URL || 'http://localhost:3002'
    });
  } catch (error) {
    console.error('Error getting LLM status:', error);
    return NextResponse.json(
      { error: 'Failed to get LLM status' },
      { status: 500 }
    );
  }
}