import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { modelId, testMessage = 'Hello, this is a test. Please respond briefly.' } = body;

    if (!modelId) {
      return NextResponse.json(
        { error: 'Model ID is required' }, 
        { status: 400 }
      );
    }

    // Get the model configuration from database
    const { data: model, error: modelError } = await supabase
      .from('maya_custom_models')
      .select('*')
      .eq('id', modelId)
      .eq('is_active', true)
      .single();

    if (modelError || !model) {
      return NextResponse.json(
        { error: 'Model not found or inactive' }, 
        { status: 404 }
      );
    }

    // Test the model based on its provider
    let response: string;
    const startTime = Date.now();

    try {
      if (model.provider === 'ollama') {
        response = await testOllamaModel(model, testMessage);
      } else if (model.provider === 'huggingface') {
        response = await testHuggingFaceModel(model, testMessage);
      } else if (model.provider === 'custom') {
        response = await testCustomModel(model, testMessage);
      } else {
        throw new Error(`Unsupported provider: ${model.provider}`);
      }

      const responseTime = Date.now() - startTime;

      // Log the usage
      await supabase
        .from('maya_model_usage')
        .insert({
          model_id: modelId,
          tokens_used: response.length, // Rough approximation
          response_time_ms: responseTime,
          success: true,
          created_at: new Date().toISOString()
        });

      return NextResponse.json({
        response,
        responseTime,
        success: true,
        modelName: model.name,
        provider: model.provider
      });
    } catch (testError: any) {
      const responseTime = Date.now() - startTime;

      // Log the failed usage
      await supabase
        .from('maya_model_usage')
        .insert({
          model_id: modelId,
          tokens_used: 0,
          response_time_ms: responseTime,
          success: false,
          error_message: testError.message,
          created_at: new Date().toISOString()
        });

      throw testError;
    }
  } catch (error: any) {
    console.error('Error testing model:', error);
    return NextResponse.json(
      { 
        error: error.message,
        success: false 
      }, 
      { status: 500 }
    );
  }
}

async function testOllamaModel(model: any, testMessage: string): Promise<string> {
  const baseUrl = model.endpoint || 'http://localhost:11434';
  const modelName = model.model_path;

  if (!modelName) {
    throw new Error('Model path not configured for Ollama model');
  }

  const response = await fetch(`${baseUrl}/api/generate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: modelName,
      prompt: `Human: ${testMessage}\n\nAssistant:`,
      stream: false,
      options: {
        temperature: model.parameters?.temperature || 0.7,
        num_predict: Math.min(model.parameters?.maxTokens || 100, 100), // Limit test response
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`Ollama API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  return data.response || 'No response generated';
}

async function testHuggingFaceModel(model: any, testMessage: string): Promise<string> {
  const apiKey = model.api_key || process.env.HUGGINGFACE_API_KEY;
  const modelRepo = model.huggingface_repo;
  const endpoint = model.endpoint || `https://api-inference.huggingface.co/models/${modelRepo}`;

  if (!apiKey) {
    throw new Error('HuggingFace API key not configured');
  }

  if (!modelRepo && !model.endpoint) {
    throw new Error('HuggingFace repository or endpoint not configured');
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      inputs: testMessage,
      parameters: {
        temperature: model.parameters?.temperature || 0.7,
        max_new_tokens: Math.min(model.parameters?.maxTokens || 100, 100),
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
  } else if (data.error) {
    throw new Error(`HuggingFace error: ${data.error}`);
  } else {
    return 'Test completed - response format may vary';
  }
}

async function testCustomModel(model: any, testMessage: string): Promise<string> {
  if (!model.endpoint) {
    throw new Error('Custom model endpoint not configured');
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (model.api_key) {
    headers['Authorization'] = `Bearer ${model.api_key}`;
  }

  const requestBody = {
    messages: [{ role: 'user', content: testMessage }],
    temperature: model.parameters?.temperature || 0.7,
    max_tokens: Math.min(model.parameters?.maxTokens || 100, 100),
    ...model.parameters,
  };

  const response = await fetch(model.endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    throw new Error(`Custom model API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();

  // Try to extract response from common formats
  return data.response || 
         data.content || 
         data.text || 
         data.choices?.[0]?.message?.content || 
         data.choices?.[0]?.text ||
         'Test completed - unable to parse response';
}