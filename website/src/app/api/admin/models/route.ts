import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(request: NextRequest) {
  try {
    const { data: models, error } = await supabase
      .from('maya_custom_models')
      .select('*')
      .eq('is_active', true)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching models:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Transform database format to frontend format
    const transformedModels = models?.map(model => ({
      id: model.id,
      name: model.name,
      description: model.description,
      provider: model.provider,
      endpoint: model.endpoint,
      apiKey: model.api_key ? '***' : undefined, // Mask API key
      modelPath: model.model_path,
      huggingFaceRepo: model.huggingface_repo,
      parameters: model.parameters || {},
      capabilities: model.capabilities || {},
      isLocal: model.is_local,
      isCustom: model.is_custom,
      isActive: model.is_active,
      createdAt: model.created_at,
      updatedAt: model.updated_at,
    })) || [];

    return NextResponse.json({
      models: transformedModels,
      count: transformedModels.length
    });
  } catch (error: any) {
    console.error('Error in GET /api/admin/models:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    // Validate required fields
    if (!body.name || !body.provider) {
      return NextResponse.json(
        { error: 'Name and provider are required' }, 
        { status: 400 }
      );
    }

    // Generate unique ID
    const modelId = crypto.randomUUID();

    // Prepare model data for database
    const modelData = {
      id: modelId,
      name: body.name,
      description: body.description || '',
      provider: body.provider,
      endpoint: body.endpoint,
      api_key: body.apiKey,
      model_path: body.modelPath,
      huggingface_repo: body.huggingFaceRepo,
      parameters: body.parameters || {},
      capabilities: body.capabilities || {},
      is_local: body.isLocal || false,
      is_custom: true,
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from('maya_custom_models')
      .insert(modelData)
      .select()
      .single();

    if (error) {
      console.error('Error creating model:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Transform response to match frontend format
    const transformedModel = {
      id: data.id,
      name: data.name,
      description: data.description,
      provider: data.provider,
      endpoint: data.endpoint,
      modelPath: data.model_path,
      huggingFaceRepo: data.huggingface_repo,
      parameters: data.parameters || {},
      capabilities: data.capabilities || {},
      isLocal: data.is_local,
      isCustom: data.is_custom,
      isActive: data.is_active,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    };

    console.log(`Created new model: ${data.name} (${data.provider})`);

    return NextResponse.json({
      model: transformedModel,
      message: 'Model created successfully'
    }, { status: 201 });
  } catch (error: any) {
    console.error('Error in POST /api/admin/models:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}