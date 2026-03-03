import { SupabaseClient } from '@supabase/supabase-js';
import { Database } from './types';

export type ImageAnalysisType = 'prompt-generation' | 'description' | 'creative-analysis';

export interface ImageAnalysisRequest {
  imageData: string; // Base64 data URL (data:image/...)
  analysisType?: ImageAnalysisType;
  userId: string;
}

export interface ImageAnalysisResponse {
  id: string;
  analysis: string;
  analysisType: ImageAnalysisType;
  timestamp: string;
  success: boolean;
}

export interface ImageAnalysisError {
  error: string;
  success: false;
}

/**
 * Analyzes an image using AI vision capabilities
 * @param client - Supabase client instance
 * @param request - Image analysis request parameters
 * @returns Promise resolving to analysis result or error
 */
export async function analyzeImage(
  client: SupabaseClient<Database>,
  request: ImageAnalysisRequest
): Promise<ImageAnalysisResponse | ImageAnalysisError> {
  try {
    const { data, error } = await client.functions.invoke('analyze-image', {
      body: {
        imageData: request.imageData,
        analysisType: request.analysisType || 'prompt-generation',
        userId: request.userId,
      },
    });

    if (error) {
      console.error('Error calling analyze-image function:', error);
      return {
        error: error.message || 'Failed to analyze image',
        success: false,
      };
    }

    return data as ImageAnalysisResponse;
  } catch (error) {
    console.error('Error in analyzeImage:', error);
    return {
      error: error instanceof Error ? error.message : 'Unknown error occurred',
      success: false,
    };
  }
}

// Note: Database operations for image_analyses table will be available 
// after the migration is applied and types are regenerated.
// Uncomment and use these functions after running the migration:

/*
export async function getImageAnalysisHistory(
  client: SupabaseClient<Database>,
  userId: string,
  limit: number = 50,
  offset: number = 0
) {
  return client
    .from('image_analyses')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);
}

export async function getImageAnalysis(
  client: SupabaseClient<Database>,
  analysisId: string
) {
  return client
    .from('image_analyses')
    .select('*')
    .eq('id', analysisId)
    .single();
}

export async function deleteImageAnalysis(
  client: SupabaseClient<Database>,
  analysisId: string
) {
  return client
    .from('image_analyses')
    .delete()
    .eq('id', analysisId);
}

export async function updateImageAnalysis(
  client: SupabaseClient<Database>,
  analysisId: string,
  updates: Partial<{
    analysis_result: string;
    metadata: Record<string, any>;
  }>
) {
  return client
    .from('image_analyses')
    .update(updates)
    .eq('id', analysisId)
    .select()
    .single();
}
*/ 