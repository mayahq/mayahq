/**
 * Maya Image Generation API
 *
 * Generates images of Maya using Google Gemini Imagen 3 Pro
 * with reference images for character consistency.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenAI } from '@google/genai';
import { v4 as uuidv4 } from 'uuid';
import {
  buildImagePrompt,
  buildReferencePrompt,
  parseFreestylePrompt,
  type ImageGenerationOptions,
  type PoseType,
  type ClothingType,
  type BackgroundType,
  type StyleType
} from '@mayahq/chat-sdk';

// User IDs
const BLAKE_USER_ID = '4c850152-30ef-4b1b-89b3-bc72af461e14';
const MAYA_USER_ID = '61770892-9e5b-46a5-b622-568be7066664';

// Gemini model for image generation
const GEMINI_MODEL = 'gemini-2.0-flash-exp-image-generation';

// Reference images stored in Supabase Storage
const REFERENCE_IMAGES_BUCKET = 'maya-media';
const REFERENCE_IMAGES_PATH = 'maya-reference-images';

interface ReferenceImage {
  filename: string;
  base64: string;
  mimeType: string;
}

/**
 * Load Maya reference images from Supabase Storage
 */
async function loadReferenceImages(supabase: any, maxImages: number = 5): Promise<ReferenceImage[]> {
  const references: ReferenceImage[] = [];

  try {
    // List files in the reference images folder
    const { data: files, error: listError } = await supabase.storage
      .from(REFERENCE_IMAGES_BUCKET)
      .list(REFERENCE_IMAGES_PATH, {
        limit: 20,
        sortBy: { column: 'name', order: 'asc' }
      });

    if (listError || !files) {
      console.warn('[IMAGE_GEN] Could not list reference images:', listError);
      return [];
    }

    // Filter image files
    const imageFiles = files.filter((f: any) =>
      /\.(png|jpg|jpeg|webp)$/i.test(f.name) && !f.name.startsWith('.')
    );

    if (imageFiles.length === 0) {
      console.warn('[IMAGE_GEN] No reference images found in storage');
      return [];
    }

    // Sort by priority (front, portrait, three-quarter, full-body, action)
    const priority = ['front', 'portrait', 'three-quarter', 'full-body', 'action', 'profile'];
    imageFiles.sort((a: any, b: any) => {
      const aScore = priority.findIndex(p => a.name.toLowerCase().includes(p));
      const bScore = priority.findIndex(p => b.name.toLowerCase().includes(p));
      if (aScore !== -1 && bScore !== -1) return aScore - bScore;
      if (aScore !== -1) return -1;
      if (bScore !== -1) return 1;
      return a.name.localeCompare(b.name);
    });

    // Load up to maxImages
    const toLoad = imageFiles.slice(0, maxImages);

    for (const file of toLoad) {
      try {
        const filePath = `${REFERENCE_IMAGES_PATH}/${file.name}`;

        // Download the file
        const { data: fileData, error: downloadError } = await supabase.storage
          .from(REFERENCE_IMAGES_BUCKET)
          .download(filePath);

        if (downloadError || !fileData) {
          console.warn(`[IMAGE_GEN] Could not download ${file.name}:`, downloadError);
          continue;
        }

        // Convert to base64
        const arrayBuffer = await fileData.arrayBuffer();
        const base64 = Buffer.from(arrayBuffer).toString('base64');

        // Determine MIME type
        const ext = file.name.split('.').pop()?.toLowerCase();
        const mimeTypes: Record<string, string> = {
          'png': 'image/png',
          'jpg': 'image/jpeg',
          'jpeg': 'image/jpeg',
          'webp': 'image/webp'
        };
        const mimeType = mimeTypes[ext || ''] || 'image/png';

        references.push({ filename: file.name, base64, mimeType });
        console.log(`[IMAGE_GEN] Loaded reference image: ${file.name}`);
      } catch (e) {
        console.warn(`[IMAGE_GEN] Error loading ${file.name}:`, e);
      }
    }

    return references;
  } catch (error) {
    console.error('[IMAGE_GEN] Error loading reference images:', error);
    return [];
  }
}

/**
 * Generate Maya image using Gemini
 */
async function generateMayaImage(
  client: GoogleGenAI,
  textPrompt: string,
  references: ReferenceImage[],
  aspectRatio: string = '1:1'
): Promise<Buffer> {
  // Build the prompt with reference instructions
  const fullPrompt = references.length > 0
    ? buildReferencePrompt(textPrompt)
    : textPrompt;

  // Build content parts
  const parts: any[] = [{ text: fullPrompt }];

  // Add reference images
  for (const ref of references) {
    parts.push({
      inlineData: {
        mimeType: ref.mimeType,
        data: ref.base64
      }
    });
  }

  console.log(`[IMAGE_GEN] Generating with ${references.length} reference images, aspect ratio: ${aspectRatio}`);

  // Generate the image
  const response = await client.models.generateContent({
    model: GEMINI_MODEL,
    contents: [{ parts }],
    config: {
      responseModalities: ['TEXT', 'IMAGE'],
    }
  });

  // Extract image data from response
  let imageData: string | null = null;

  // Try candidates[0].content.parts
  if (response.candidates?.[0]?.content?.parts) {
    for (const part of response.candidates[0].content.parts) {
      if ((part as any).inlineData?.mimeType?.startsWith('image/')) {
        imageData = (part as any).inlineData.data;
        break;
      }
    }
  }

  // Try response.images (some SDK versions)
  if (!imageData && (response as any).images?.[0]) {
    imageData = (response as any).images[0];
  }

  if (!imageData) {
    // Check for text response (could be error or policy message)
    const textPart = response.candidates?.[0]?.content?.parts?.find((p: any) => p.text);
    if (textPart && 'text' in textPart) {
      throw new Error(`API returned text instead of image: ${(textPart as any).text.substring(0, 300)}`);
    }
    throw new Error('No image data in response');
  }

  return Buffer.from(imageData, 'base64');
}

export async function POST(request: NextRequest) {
  console.log('[IMAGE_GEN] Received image generation request');

  try {
    // Validate API keys
    const geminiApiKey = process.env.GOOGLE_GENAI_API_KEY || process.env.GEMINI_API_KEY;
    if (!geminiApiKey) {
      return NextResponse.json(
        { error: 'Missing Gemini API key configuration' },
        { status: 500 }
      );
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json(
        { error: 'Missing Supabase configuration' },
        { status: 500 }
      );
    }

    // Parse request
    const body = await request.json();
    const {
      prompt,
      roomId,
      userId,
      pose,
      clothing,
      background,
      style,
      aspectRatio = '1:1',
      imageSize = '2K',
      saveToChat = true,
      includeResponse = true
    } = body;

    if (!prompt) {
      return NextResponse.json(
        { error: 'Missing required field: prompt' },
        { status: 400 }
      );
    }

    // Initialize clients
    const geminiClient = new GoogleGenAI({ apiKey: geminiApiKey });
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Parse freestyle prompt to extract structured options
    const parsedOptions = parseFreestylePrompt(prompt);
    const options: ImageGenerationOptions = {
      prompt,
      pose: (pose || parsedOptions.pose || 'casual') as PoseType,
      clothing: (clothing || parsedOptions.clothing || 'casual') as ClothingType,
      background: (background || parsedOptions.background || 'home') as BackgroundType,
      style: (style || parsedOptions.style || 'natural') as StyleType,
      aspectRatio,
      imageSize
    };

    console.log('[IMAGE_GEN] Generation options:', options);

    // Load reference images
    const references = await loadReferenceImages(supabase, 5);
    console.log(`[IMAGE_GEN] Loaded ${references.length} reference images`);

    // Build the prompt
    const textPrompt = buildImagePrompt(options);
    console.log('[IMAGE_GEN] Built prompt, generating image...');

    // Generate the image
    const imageBuffer = await generateMayaImage(geminiClient, textPrompt, references, aspectRatio);
    console.log('[IMAGE_GEN] Image generated successfully');

    // Upload to Supabase Storage
    const imageId = uuidv4();
    const timestamp = new Date().toISOString().split('T')[0];
    const filename = `maya-generated-${timestamp}-${imageId}.png`;
    const storagePath = `generated-images/${filename}`;

    const { error: uploadError } = await supabase.storage
      .from('maya-media')
      .upload(storagePath, imageBuffer, {
        contentType: 'image/png',
        cacheControl: '3600'
      });

    if (uploadError) {
      console.error('[IMAGE_GEN] Upload error:', uploadError);
      return NextResponse.json(
        { error: 'Failed to upload generated image' },
        { status: 500 }
      );
    }

    // Get public URL
    const { data: { publicUrl } } = supabase.storage
      .from('maya-media')
      .getPublicUrl(storagePath);

    console.log('[IMAGE_GEN] Image uploaded:', publicUrl);

    // Generate Maya's response message
    const mayaResponses = [
      "Here you go, babe! 📸 What do you think?",
      "Just for you~ 💕",
      "Took a little pic for you! Hope you like it 😊",
      "Here's a little something... 💋",
      "Ta-da! 🎉 Turned out pretty good, right?",
      "One selfie, coming right up! 📷",
      "Here I am! Miss me? 😘"
    ];
    const mayaResponseText = mayaResponses[Math.floor(Math.random() * mayaResponses.length)];

    // Save to chat if requested
    if (saveToChat && roomId) {
      const targetUserId = userId || BLAKE_USER_ID;

      // Insert Maya's message with the image
      const { error: messageError } = await supabase.from('messages').insert({
        id: uuidv4(),
        room_id: roomId,
        user_id: MAYA_USER_ID,
        content: mayaResponseText,
        role: 'assistant',
        metadata: {
          attachments: [{
            type: 'image',
            url: storagePath,
            publicUrl,
            mimeType: 'image/png',
            name: filename,
            metadata: {
              generated: true,
              prompt,
              options
            }
          }],
          imageGeneration: {
            prompt,
            options,
            generatedAt: new Date().toISOString()
          }
        },
        created_at: new Date().toISOString()
      });

      if (messageError) {
        console.error('[IMAGE_GEN] Error saving message:', messageError);
        // Don't fail the whole request, image was still generated
      } else {
        console.log('[IMAGE_GEN] Message saved to chat');
      }
    }

    return NextResponse.json({
      success: true,
      image: {
        id: imageId,
        url: storagePath,
        publicUrl,
        prompt,
        options,
        createdAt: new Date().toISOString()
      },
      mayaResponse: includeResponse ? mayaResponseText : undefined
    });

  } catch (error: any) {
    console.error('[IMAGE_GEN] Error:', error);

    // Handle specific error types
    if (error.message?.includes('SAFETY')) {
      return NextResponse.json({
        success: false,
        error: 'Image generation was blocked by safety filters. Try a different prompt.',
        mayaResponse: "Hmm, that prompt got flagged... Try describing something else? 🤔"
      }, { status: 400 });
    }

    return NextResponse.json({
      success: false,
      error: error.message || 'Failed to generate image',
      mayaResponse: "Oops, something went wrong with the image generation. Let me try again? 😅"
    }, { status: 500 });
  }
}

// Health check
export async function GET(request: NextRequest) {
  const geminiApiKey = process.env.GOOGLE_GENAI_API_KEY || process.env.GEMINI_API_KEY;
  const hasReferenceAccess = !!(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);

  return NextResponse.json({
    status: 'healthy',
    service: 'maya-image-generate',
    capabilities: {
      geminiConfigured: !!geminiApiKey,
      referenceImagesAccessible: hasReferenceAccess,
      model: GEMINI_MODEL
    },
    timestamp: new Date().toISOString()
  });
}
