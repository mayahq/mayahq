/// <reference types="https://deno.land/x/deno/lib/deno.d.ts" />

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7'
import { corsHeaders } from '../_shared/cors.ts'

// Create custom fetch with timeout
const fetchWithTimeout = async (url: string, options = {}, timeout = 60000) => {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    clearTimeout(id);
    return response;
  } catch (error) {
    clearTimeout(id);
    throw error;
  }
}

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Only allow POST requests
    if (req.method !== 'POST') {
      throw new Error('Method not allowed');
    }

    // Create Supabase client
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Missing Authorization header');
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: { headers: { Authorization: authHeader } },
        auth: { persistSession: false },
      }
    );

    // Get the request body
    const { imageData, analysisType = 'prompt-generation', userId } = await req.json();

    if (!imageData || !userId) {
      throw new Error('Missing required fields: imageData, userId');
    }

    // Validate imageData format (should be base64 or data URL)
    if (!imageData.startsWith('data:image/')) {
      throw new Error('Invalid image format. Expected base64 data URL');
    }

    // Prepare the OpenAI Vision API request
    const openaiApiKey = Deno.env.get('OPENAI_API_KEY');
    if (!openaiApiKey) {
      throw new Error('OPENAI_API_KEY environment variable not set');
    }

    // Define different analysis prompts based on type
    let systemPrompt: string;
    switch (analysisType) {
      case 'prompt-generation':
        systemPrompt = `You are an expert prompt engineer specialized in CyberRealistic XL model prompts. Analyze this image and generate a detailed, structured prompt optimized for high-quality image generation.

IMPORTANT: Return your response in the following exact format:

**MAIN PROMPT:**
[A detailed description of the main subject, composition, and scene - be specific about poses, expressions, clothing, setting, etc.]

**POSITIVE ENHANCERS:**
realistic skin pores, natural shadows, photorealistic textures, subsurface scattering, DSLR quality, Canon EOS, cinematic lighting, HDR, 8k detail, sharp focus, fine hair strands

**NEGATIVE PROMPT:**
plastic skin, CGI look, doll-like, waxy texture, missing fingers, extra limbs, deformed eyes, poorly drawn hands, cartoonish, anime, painting, stylized

**TECHNICAL SETTINGS:**
- Sampler: dpmpp_2m
- Steps: 25-35
- CFG Scale: 5.5-7
- Resolution: 1024x1024 or 1152x896

Focus on capturing:
- Visual style and photographic techniques
- Detailed composition and framing
- Lighting conditions and mood
- Subject details and characteristics
- Setting and environment

Make the main prompt detailed and specific to recreate similar high-quality images.`;
        break;
      case 'description':
        systemPrompt = `Analyze this image and provide a detailed description of what you see. Include:
        - Main subjects and objects
        - Setting and environment
        - Activities happening
        - Visual style and quality
        - Any text or readable content
        
        Be objective and thorough in your description.`;
        break;
      case 'creative-analysis':
        systemPrompt = `Analyze this image with a creative lens. Consider:
        - Artistic composition and technique
        - Emotional impact and mood
        - Symbolism or deeper meaning
        - Creative opportunities it suggests
        - Potential use cases or applications
        
        Provide insights that could inspire creative projects.`;
        break;
      default:
        systemPrompt = `Analyze this image and provide useful insights about its content, style, and potential applications.`;
    }

    // Call OpenAI Vision API
    const openaiResponse = await fetchWithTimeout(
      'https://api.openai.com/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${openaiApiKey}`,
        },
        body: JSON.stringify({
          model: 'gpt-4-vision-preview',
          messages: [
            {
              role: 'system',
              content: systemPrompt
            },
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: 'Please analyze this image according to the instructions.'
                },
                {
                  type: 'image_url',
                  image_url: {
                    url: imageData,
                    detail: 'high'
                  }
                }
              ]
            }
          ],
          max_tokens: 1000,
          temperature: 0.7
        }),
      },
      45000 // 45-second timeout
    );

    if (!openaiResponse.ok) {
      const errorText = await openaiResponse.text();
      throw new Error(`OpenAI API error: ${openaiResponse.status} - ${errorText}`);
    }

    const openaiData = await openaiResponse.json();
    const analysis = openaiData.choices?.[0]?.message?.content;

    if (!analysis) {
      throw new Error('No analysis received from OpenAI');
    }

    // Store the analysis in Supabase for future reference
    const analysisId = crypto.randomUUID();
    const timestamp = new Date().toISOString();

    const { error: insertError } = await supabaseClient
      .from('image_analyses')
      .insert({
        id: analysisId,
        user_id: userId,
        analysis_type: analysisType,
        analysis_result: analysis,
        created_at: timestamp,
      });

    if (insertError) {
      console.warn('Failed to store analysis in database:', insertError.message);
      // Don't throw error here - we can still return the analysis even if storage fails
    }

    // Return the analysis
    return new Response(
      JSON.stringify({
        id: analysisId,
        analysis: analysis,
        analysisType: analysisType,
        timestamp: timestamp,
        success: true
      }),
      { 
        headers: { 
          ...corsHeaders,
          'Content-Type': 'application/json'
        },
        status: 200,
      },
    );

  } catch (error) {
    console.error('Error in analyze-image function:', error);
    return new Response(
      JSON.stringify({ 
        error: error.message,
        success: false 
      }),
      { 
        headers: { 
          ...corsHeaders,
          'Content-Type': 'application/json'
        },
        status: 500,
      },
    );
  }
}); 