/**
 * Maya Chat API v3 - Maya Core v2.0 Microservice Client
 *
 * Calls the Maya Core v2.0 microservice for processing
 * Now with image generation support!
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { createClient } from '@supabase/supabase-js';
import { v4 as uuidv4 } from 'uuid';
import { type Database } from '@/lib/database.types';
import Busboy from 'busboy';
import { Readable } from 'stream';
// Image generation now handled entirely by Maya Core microservice

// Helper to parse multipart form data (React Native compatible)
async function parseMultipartFormData(request: NextRequest) {
  const contentType = request.headers.get('content-type') || '';

  return new Promise<{ fields: Record<string, string>; files: Array<{ fieldName: string; file: Buffer; filename: string; mimeType: string }> }>((resolve, reject) => {
    const fields: Record<string, string> = {};
    const files: Array<{ fieldName: string; file: Buffer; filename: string; mimeType: string }> = [];

    const busboy = Busboy({ headers: { 'content-type': contentType } });

    busboy.on('field', (fieldname, val) => {
      fields[fieldname] = val;
    });

    busboy.on('file', (fieldname, file, info) => {
      const { filename, mimeType } = info;
      const chunks: Buffer[] = [];

      file.on('data', (chunk) => {
        chunks.push(chunk);
      });

      file.on('end', () => {
        files.push({
          fieldName: fieldname,
          file: Buffer.concat(chunks),
          filename,
          mimeType
        });
      });
    });

    busboy.on('finish', () => {
      resolve({ fields, files });
    });

    busboy.on('error', (error) => {
      reject(error);
    });

    // Convert Request body to Node.js stream
    request.arrayBuffer().then(buffer => {
      const readable = Readable.from(Buffer.from(buffer));
      readable.pipe(busboy);
    }).catch(reject);
  });
}

// Maya Core v2.0 Microservice URL
const MAYA_CORE_URL = process.env.MAYA_CORE_URL || 'http://localhost:3333';

// Validate environment variables
function validateEnvVars() {
  const requiredVars = {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  };

  const missingVars = Object.entries(requiredVars)
    .filter(([_, value]) => !value)
    .map(([key]) => key);

  return { valid: missingVars.length === 0, missingVars };
}

export async function POST(request: NextRequest) {
  console.log('='.repeat(60));
  console.log('[MAYA_V3] ========== NEW REQUEST ==========');
  console.log('='.repeat(60));

  // Debug logging
  const contentType = request.headers.get('content-type') || '';
  const method = request.method;
  console.log('[MAYA_V3] Request method:', method);
  console.log('[MAYA_V3] Content-Type:', contentType);
  console.log('[MAYA_V3] Is multipart:', contentType.includes('multipart/form-data'));

  // Validate environment
  const envCheck = validateEnvVars();
  if (!envCheck.valid) {
    console.error('[MAYA_V3] Missing environment variables:', envCheck.missingVars);
    return NextResponse.json(
      { error: 'Missing required environment variables', details: envCheck.missingVars },
      { status: 500 }
    );
  }

  try {
    let requestData: any = {};
    let attachments: any[] = [];

    // Create Supabase admin client (reused throughout function)
    const supabaseAdmin = createClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Check if this is FormData (multimodal) or JSON
    console.log('[MAYA_V3] Checking content type for FormData...');

    if (contentType.includes('multipart/form-data')) {
      console.log('[MAYA_V3] ✅ Detected FormData request, processing files...');

      // Use custom parser for React Native compatibility
      let fields: Record<string, string> = {};
      let files: Array<{ fieldName: string; file: Buffer; filename: string; mimeType: string }> = [];

      try {
        const parsed = await parseMultipartFormData(request);
        fields = parsed.fields;
        files = parsed.files;
        console.log('[MAYA_V3] ✅ FormData parsed successfully');
      } catch (parseError: any) {
        console.error('[MAYA_V3] ❌ FormData PARSE ERROR:', parseError.message);
        console.error('[MAYA_V3] ❌ Parse error stack:', parseError.stack);
      }

      console.log('[MAYA_V3] FormData fields:', Object.keys(fields));
      console.log('[MAYA_V3] FormData files count:', files.length);
      files.forEach((f, i) => console.log(`[MAYA_V3] File ${i}: ${f.filename} (${f.mimeType}, ${f.file.length} bytes)`));

      requestData = {
        message: fields.message,
        roomId: fields.roomId,
        mobileAuthUserId: fields.mobileAuthUserId,
        userName: fields.userName
      };

      // Process each uploaded file
      for (const fileData of files) {
        try {
          const fileExt = fileData.filename.split('.').pop();
          const fileName = `${uuidv4()}.${fileExt}`;
          const filePath = `chat-attachments/${fileName}`;

          // Upload to Supabase Storage
          const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
            .from('maya-media')
            .upload(filePath, fileData.file, {
              contentType: fileData.mimeType,
              upsert: false
            });

          if (uploadError) {
            console.error('[MAYA_V3] File upload error:', uploadError);
            continue;
          }

          // Get public URL
          const { data: { publicUrl } } = supabaseAdmin.storage
            .from('maya-media')
            .getPublicUrl(filePath);

          attachments.push({
            name: fileData.filename,
            type: fileData.mimeType,
            size: fileData.file.length,
            url: publicUrl,
            path: filePath
          });

          console.log(`[MAYA_V3] Uploaded file: ${fileData.filename} -> ${publicUrl}`);
        } catch (fileError) {
          console.error('[MAYA_V3] Error processing file:', fileError);
        }
      }
    } else {
      // Handle regular JSON
      console.log('[MAYA_V3] ⚠️ NOT FormData - parsing as JSON');
      requestData = await request.json();
      attachments = requestData.attachments || [];
      console.log('[MAYA_V3] JSON body attachments:', attachments.length);
    }
    
    const { message, roomId, mobileAuthUserId, userName: mobileAuthUserName } = requestData;

    if (!message || !roomId) {
      return NextResponse.json(
        { error: 'Missing required fields: message, roomId' },
        { status: 400 }
      );
    }

    // Authentication (same as v2)
    const authHeader = request.headers.get('Authorization');
    const isMobileHeaderPresent = request.headers.get('X-Maya-Mobile-App') === 'true';
    let token = null;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    }

    let user: { id: string; email?: string; userName?: string } | null = null;

    // Determine authentication method
    const isLikelyMobileRequest = isMobileHeaderPresent || !!token || !!mobileAuthUserId;

    if (isLikelyMobileRequest) {
      // Mobile authentication
      if (mobileAuthUserId) {
        user = { id: mobileAuthUserId, userName: mobileAuthUserName || 'Mobile User' };
      } else if (token) {
        const { data: userData, error: tokenError } = await supabaseAdmin.auth.getUser(token);
        if (tokenError || !userData.user) {
          return NextResponse.json({ error: 'Unauthorized', details: 'Invalid token' }, { status: 401 });
        }
        user = { id: userData.user.id, email: userData.user.email, userName: userData.user.email || 'User' };
      }
    } else {
      // Web authentication using cookies
      const cookieStore = cookies();
      const supabaseWeb = createServerClient<Database>(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
          cookies: {
            get(name: string) { return cookieStore.get(name)?.value; },
            set(name: string, value: string, options: CookieOptions) { try { cookieStore.set(name, value, options); } catch (e) {} },
            remove(name: string, options: CookieOptions) { try { cookieStore.set(name, '', options); } catch (e) {} },
          },
        }
      );

      const { data: webUserData, error: webAuthError } = await supabaseWeb.auth.getUser();
      if (webAuthError || !webUserData.user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      user = { id: webUserData.user.id, email: webUserData.user.email, userName: webUserData.user.email || 'User' };
    }

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Blake's user ID (we retrieve his memories/facts when Maya responds)
    const blakeUserId = '4c850152-30ef-4b1b-89b3-bc72af461e14';
    // Maya's user ID (for storing her responses)
    const mayaUserId = '61770892-9e5b-46a5-b622-568be7066664';

    console.log(`[MAYA_V3] Processing for Blake (${blakeUserId}) with Maya responding`);
    console.log(`[MAYA_V3] Attachments being sent to Maya Core:`, JSON.stringify(attachments, null, 2));

    // Image generation is now handled entirely by Maya Core microservice
    console.log(`[MAYA_V3] Calling Maya Core microservice at ${MAYA_CORE_URL}/process`);

    // Call Maya Core v2.0 Microservice
    const mayaCoreResponse = await fetch(`${MAYA_CORE_URL}/process`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message,
        userId: blakeUserId,
        roomId,
        attachments: attachments,
        options: {
          temperature: 0.7,
          maxTokens: 2048
        }
      })
    });

    if (!mayaCoreResponse.ok) {
      console.error('[MAYA_V3] Maya Core service error:', mayaCoreResponse.status);
      const errorData = await mayaCoreResponse.json().catch(() => ({}));
      
      return NextResponse.json({
        status: 'error',
        mayaResponse: {
          content: errorData.mayaResponse || "My microservice seems to be having a moment. Give me a sec to get back online! 🤖",
          role: 'assistant',
          metadata: {
            error: true,
            errorType: 'ServiceUnavailable',
            version: '3.0.0'
          }
        },
        error: {
          message: 'Maya Core service unavailable',
          type: 'ServiceError'
        }
      }, { status: 500 });
    }

    const result = await mayaCoreResponse.json();

    console.log('[MAYA_V3] Maya Core handled message storage internally');

    // Update the user message with attachments if any exist
    if (attachments.length > 0) {
      console.log(`[MAYA_V3] Updating user message with ${attachments.length} attachments`);

      // Find the most recent user message for this content
      const { data: recentMessages, error: fetchError } = await supabaseAdmin
        .from('messages')
        .select('id, metadata')
        .eq('room_id', roomId)
        .eq('user_id', blakeUserId)
        .eq('role', 'user')
        .eq('content', message)
        .order('created_at', { ascending: false })
        .limit(1);

      if (fetchError) {
        console.error('[MAYA_V3] Error fetching message to update:', fetchError);
      } else if (recentMessages && recentMessages.length > 0) {
        const userMessage = recentMessages[0];
        const existingMetadata = (userMessage.metadata as any) || {};

        // Update the message with attachments in metadata
        const { error: updateError } = await supabaseAdmin
          .from('messages')
          .update({
            metadata: {
              ...existingMetadata,
              attachments: attachments
            }
          })
          .eq('id', userMessage.id);

        if (updateError) {
          console.error('[MAYA_V3] Error updating message metadata:', updateError);
        } else {
          console.log(`[MAYA_V3] Successfully updated message ${userMessage.id} with attachments`);
        }
      } else {
        console.warn('[MAYA_V3] Could not find user message to update');
      }
    }

    // Return Maya Core v3.0 response format
    // Image generation result comes from Maya Core now
    return NextResponse.json({
      status: 'completed',
      userMessage: {
        content: message,
        role: 'user',
        user_id: blakeUserId,
        room_id: roomId,
        metadata: {
          attachments: attachments
        }
      },
      mayaResponse: {
        content: result.content,
        role: 'assistant',
        user_id: mayaUserId,
        room_id: roomId
      },
      // Image generation result from Maya Core
      imageGeneration: result.imageGeneration,
      processing: {
        ...result.processing,
        version: '3.0.0',
        microservice: true,
        serviceUrl: MAYA_CORE_URL,
        imageGenerated: !!result.imageGeneration?.success
      }
    });

  } catch (error: any) {
    console.error('[MAYA_V3] Unhandled error:', error);
    
    return NextResponse.json({
      status: 'error',
      mayaResponse: {
        content: "Something weird happened in my neural pathways. Can you try that again? 🤖",
        role: 'assistant',
        metadata: {
          error: true,
          errorType: error.name || 'UnknownError',
          version: '3.0.0'
        }
      },
      error: {
        message: error.message,
        type: error.name || 'UnknownError'
      }
    }, { status: 500 });
  }
}

// Health check endpoint
export async function GET(request: NextRequest) {
  try {
    // Check Maya Core microservice health
    const healthResponse = await fetch(`${MAYA_CORE_URL}/health`);
    const healthData = await healthResponse.json();
    
    return NextResponse.json({
      status: 'healthy',
      version: '3.0.0',
      architecture: 'microservice',
      maya: healthData,
      serviceUrl: MAYA_CORE_URL,
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    return NextResponse.json({
      status: 'unhealthy',
      error: 'Maya Core microservice unavailable',
      serviceUrl: MAYA_CORE_URL,
      version: '3.0.0',
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}

// Handle OPTIONS for CORS
export async function OPTIONS(request: NextRequest) {
  console.log('[MAYA_V3] OPTIONS request received');
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Maya-Mobile-App, Accept',
      'Access-Control-Max-Age': '86400',
    },
  });
}