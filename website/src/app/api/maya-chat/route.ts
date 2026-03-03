import { NextRequest, NextResponse } from 'next/server';
import { Maya } from '@/lib/maya-agent';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { createClient } from '@supabase/supabase-js';
import { v4 as uuidv4 } from 'uuid';
import { extractTasksFromMessage } from '@/lib/db/tasks'; // Import the task extraction function
import { tagMessage } from '@/lib/db/tagger'; // Import the tagging function
import { upsertTriples, upsertCoreFactTriples } from '@/lib/facts'; // Import facts functions
import { type Database } from '@/lib/database.types';

// Get environment variables with type checking
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

// Get Supabase admin client only if URL and key are available
const getSupabaseAdminClient = () => {
  if (!supabaseUrl || !supabaseServiceKey) {
    console.log('Supabase configuration missing');
    return null;
  }
  
  return createClient<Database>(supabaseUrl, supabaseServiceKey);
};

// Initialize admin client (will be null during build if env vars missing)
const supabaseAdminClient = getSupabaseAdminClient();

// Function to validate environment variables
function validateEnvVars() {
  const requiredVars = {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  };

  const missingVars = Object.entries(requiredVars)
    .filter(([_, value]) => !value)
    .map(([key]) => key);

  if (missingVars.length > 0) {
    return {
      valid: false,
      missingVars
    };
  }

  return { valid: true };
}

// Direct memory storage function as a backup if Maya's method fails
// NOTE: Mobile app developers - If you're experiencing issues with column selection (400 errors),
// please use the dedicated /api/maya-memory endpoint which provides better handling for Supabase API
// limitations. The direct `supabase.from('maya_memories').insert()` approach adds the embedding column
// which causes 400 errors in the REST API. The maya-memory endpoint avoids these issues.
async function directMemoryStorage(message: string, response: string, userId: string, userName: string) {
  try {
    console.log('[MOBILE_API] Attempting direct memory storage to maya_memories');
    
    // Format the content
    const memoryContent = `User: ${message}\nMaya: ${response}`;
    
    // Get tags for the message
    let tags: string[] = [];
    try {
      tags = await tagMessage(memoryContent);
      console.log('[MOBILE_API] Got tags for direct memory storage:', tags);
    } catch (tagError) {
      console.error('[MOBILE_API] Tag generation failed:', tagError);
      tags = [];
    }
    
    // Create the metadata object with more client info for debugging
    const metadata = {
      userId,
      userName,
      timestamp: new Date().toISOString(),
      type: 'conversation',
      platform: 'mobile-direct',
      client_info: {
        endpoint: 'maya-chat-api',
        method: 'POST',
        api_version: '1.0'
      }
    };
    
    console.log('[MOBILE_API] Attempting insert with metadata:', JSON.stringify(metadata));
    
    // APPROACH 1: Use Direct API call to avoid columns parameter issue
    try {
      console.log('[MOBILE_API] Using direct fetch API call to avoid columns parameter');
      
      // Create a direct fetch request without using Supabase client
      const requestUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/api_maya_memories`;
      const requestInit: RequestInit = {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
          'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY || '',
          'Prefer': 'return=representation'
        },
        body: JSON.stringify({
          content: memoryContent,
          metadata,
          tags,
          created_at: new Date().toISOString()
        })
      };
      
      const response = await fetch(requestUrl, requestInit);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('[MOBILE_API] Direct fetch API failed:', response.status, errorText);
        throw new Error(`Direct API call failed: ${response.status} ${errorText}`);
      }
      
      const responseData = await response.json();
      console.log('[MOBILE_API] Successfully stored memory via direct API call:', responseData);
      
      return tags;
    } catch (directFetchError) {
      console.error('[MOBILE_API] Direct fetch API failed:', directFetchError);
    
      // APPROACH 2: Try using the API-specific RPC function
      try {
        console.log('[MOBILE_API] Using api_insert_maya_memory RPC function');
        const { data: apiData, error: apiError } = await supabaseAdminClient.rpc('api_insert_maya_memory', {
          p_content: memoryContent,
          p_metadata: metadata
        });
        
        if (apiError) {
          console.error('[MOBILE_API] API-specific insert failed with error:', apiError);
          throw apiError;
        }
        
        console.log('[MOBILE_API] Successfully stored memory with API-specific insert:', apiData);
        
        // Update tags if we have them
        if (tags.length > 0 && apiData) {
          try {
            // Use direct fetch for the update to avoid column selection
            const updateUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/maya_memories?id=eq.${apiData}`;
            const updateRequestInit: RequestInit = {
              method: 'PATCH',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
                'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY || '',
                'Prefer': 'return=representation'
              },
              body: JSON.stringify({ tags })
            };
            
            const updateResponse = await fetch(updateUrl, updateRequestInit);
            
            if (!updateResponse.ok) {
              console.error('[MOBILE_API] Tags update failed:', await updateResponse.text());
            } else {
              console.log('[MOBILE_API] Successfully updated tags for memory');
            }
          } catch (updateError) {
            console.error('[MOBILE_API] Tags update failed with exception:', updateError);
          }
        }
        
        return tags;
      } catch (apiInsertError) {
        console.error('[MOBILE_API] API-specific insert failed:', apiInsertError);

        // APPROACH 3: Try direct safe insert via the trigger and policy
        try {
          console.log('[MOBILE_API] Trying direct API insert with safe insert trigger');
          
          // Use a fetch call instead of supabase client to avoid the columns parameter
          const safeUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/maya_memories`;
          const safeRequestInit: RequestInit = {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
              'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY || '',
              'Prefer': 'return=representation'
            },
            body: JSON.stringify({
              content: memoryContent,
              metadata: {
                ...metadata,
                platform: 'mobile-api-trigger-safe'
              },
              tags,
              created_at: new Date().toISOString()
            })
          };
          
          const safeResponse = await fetch(safeUrl, safeRequestInit);
          
          if (!safeResponse.ok) {
            const errorText = await safeResponse.text();
            console.error('[MOBILE_API] Safe insert approach failed:', safeResponse.status, errorText);
            throw new Error(`Safe insert failed: ${safeResponse.status} ${errorText}`);
          }
          
          const safeData = await safeResponse.json();
          console.log('[MOBILE_API] Successfully stored memory via safe insert:', safeData);
          return tags;
        } catch (safeInsertError) {
          console.error('[MOBILE_API] Safe insert approach failed:', safeInsertError);
        
          // APPROACH 4: Try with RPC store_mobile_memory approach
          try {
            console.log('[MOBILE_API] Trying RPC store_mobile_memory approach');
            const { data: rpcData, error: rpcError } = await supabaseAdminClient.rpc('store_mobile_memory', {
              p_content: memoryContent,
              p_user_id: userId,
              p_user_name: userName,
              p_tags: tags
            });
            
            if (rpcError) {
              console.error('[MOBILE_API] RPC approach failed with error:', rpcError);
              throw rpcError;
            }
            
            console.log('[MOBILE_API] Successfully stored memory with RPC approach:', rpcData);
            return tags;
          } catch (rpcError) {
            console.error('[MOBILE_API] RPC approach failed, trying simplified direct insert:', rpcError);
            
            // APPROACH 5: Last resort - use the direct insert function with no tags
            try {
              console.log('[MOBILE_API] Trying direct insert function as last resort');
              const { data: directData, error: directError } = await supabaseAdminClient.rpc('insert_mobile_memory_direct', {
                p_content: memoryContent,
                p_user_id: userId,
                p_user_name: userName
              });
              
              if (directError) {
                console.error('[MOBILE_API] Direct insert function failed:', directError);
                throw directError;
              }
              
              console.log('[MOBILE_API] Successfully stored memory with direct insert function:', directData);
              return [];
            } catch (directError) {
              console.error('[MOBILE_API] All memory storage approaches failed. Final error:', directError);
              
              // Check if maya_memories table exists
              try {
                // Use fetch instead of supabase client
                const checkUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/maya_memories?limit=1`;
                const checkRequestInit: RequestInit = {
                  headers: {
                    'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
                    'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY || ''
                  }
                };
                
                const checkResponse = await fetch(checkUrl, checkRequestInit);
                
                if (!checkResponse.ok) {
                  console.error('[MOBILE_API] Schema test failed. Table may not exist or be accessible:', 
                    checkResponse.status, await checkResponse.text());
                } else {
                  console.log('[MOBILE_API] Table exists and is accessible. Problem may be with data format.');
                }
              } catch (schemaTestError) {
                console.error('[MOBILE_API] Schema test failed with exception:', schemaTestError);
              }
              
              throw new Error('All memory storage approaches failed');
            }
          }
        }
      }
    }
  } catch (error) {
    console.error('[MOBILE_API] Direct memory storage error:', error);
    throw error;
  }
}

// Direct facts storage as a backup
async function directFactsStorage(message: string, response: string, userId: string) {
  try {
    console.log('[MOBILE_API] Attempting direct facts extraction and storage');
    
    // First try the official function
    await upsertTriples({
      text: message + " " + response,
      userId,
      generateEmbeddings: true
    });
    
    // If that succeeded, we're done
    console.log('[MOBILE_API] Successfully extracted facts using upsertTriples');
    return true;
  } catch (factError) {
    console.error('[MOBILE_API] Standard fact extraction failed, trying direct method:', factError);
    
    // If official function fails, try direct DB approach
    try {
      // This is a simplified direct approach - in production you'd want more robust parsing
      // Extract simple facts in subject-predicate-object format
      const combinedText = message + " " + response;
      const simpleFactPattern = /(.+?)\s+(is|are|has|have|likes|like|can|will|should)\s+(.+?)[\.|\?|!|$]/gi;
      const matches = [...combinedText.matchAll(simpleFactPattern)];
      
      if (matches.length === 0) {
        console.log('[MOBILE_API] No simple facts found for direct extraction');
        return false;
      }
      
      // Insert facts directly
      for (const match of matches) {
        const [_, subject, predicate, object] = match;
        
        // Skip if any part is missing
        if (!subject?.trim() || !predicate?.trim() || !object?.trim()) continue;
        
        await supabaseAdminClient.from('maya_facts').insert({
          user_id: userId,
          subject: subject.trim(),
          predicate: predicate.trim(),
          object: object.trim(),
          weight: 0.7, // Medium confidence
          source_ref: { 
            type: 'mobile-direct',
            text: combinedText
          },
          ts: new Date().toISOString()
        });
      }
      
      console.log(`[MOBILE_API] Directly extracted and stored ${matches.length} simple facts`);
      return true;
    } catch (directError) {
      console.error('[MOBILE_API] Direct fact storage failed:', directError);
      return false;
    }
  }
}

export async function POST(request: NextRequest) {
  console.log('[MOBILE_API] Received request to /api/maya-chat endpoint');

  const envCheck = validateEnvVars();
  if (!envCheck.valid) {
    console.error('[MOBILE_API] Missing environment variables:', envCheck.missingVars);
    return NextResponse.json(
      { error: 'Missing required environment variables', details: envCheck.missingVars },
      { status: 500 }
    );
  }
  
  // Check if Supabase admin client is available
  if (!supabaseAdminClient) {
    console.error('[MOBILE_API] Supabase admin client could not be initialized');
    return NextResponse.json(
      { error: 'Supabase client could not be initialized' },
      { status: 500 }
    );
  }

  try {
    const requestData = await request.json();
    const { message, roomId, mobileAuthUserId, userName: mobileAuthUserName } = requestData;

    if (!message || !roomId) {
      console.error('[MOBILE_API] Missing required fields: message, roomId');
      return NextResponse.json(
        { error: 'Missing required fields: message, roomId' },
        { status: 400 }
      );
    }

    const authHeader = request.headers.get('Authorization');
    const isMobileHeaderPresent = request.headers.get('X-Maya-Mobile-App') === 'true';
    let token = null;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7);
      console.log('[MOBILE_API] Detected Bearer token in Authorization header.');
    }
    
    console.log(`[MOBILE_API] isMobileHeaderPresent: ${isMobileHeaderPresent}, token: ${token ? 'present' : 'absent'}, mobileAuthUserId: ${mobileAuthUserId}`);

    let user: { id: string; email?: string | undefined, userName?: string | undefined } | null = null;
    let supabaseClientForOps = supabaseAdminClient; // Default to admin client

    // Determine if it's a mobile-like request
    // This can be based on a custom header, presence of a token, or mobileAuthUserId
    const isLikelyMobileRequest = isMobileHeaderPresent || !!token || !!mobileAuthUserId;

    if (isLikelyMobileRequest) {
      console.log('[MOBILE_API] Processing as a mobile request.');
      // Mobile App Authentication Flow
      if (mobileAuthUserId) {
        console.log('[MOBILE_API] Using direct user ID from mobileAuthUserId:', mobileAuthUserId);
        user = { id: mobileAuthUserId, userName: mobileAuthUserName || 'Mobile User' };
      } else if (token) {
        console.log('[MOBILE_API] Attempting to validate token with admin client.');
        try {
          const { data: userData, error: tokenError } = await supabaseAdminClient.auth.getUser(token);
          if (tokenError || !userData.user) {
            console.error('[MOBILE_API] Token validation failed:', tokenError?.message);
            return NextResponse.json({ error: 'Unauthorized', details: 'Invalid token' }, { status: 401 });
          }
          user = { id: userData.user.id, email: userData.user.email, userName: userData.user.email || 'User' };
          console.log('[MOBILE_API] Token validated successfully for user:', user.id);
        } catch (e) {
          console.error('[MOBILE_API] Exception during token validation:', e);
          return NextResponse.json({ error: 'Unauthorized', details: 'Token validation exception' }, { status: 401 });
        }
      } else if (roomId) {
        // Fallback: Get user from room if no direct ID or token
        console.log('[MOBILE_API] No direct user ID or token, attempting to get user from room ID:', roomId);
        try {
          const { data: roomData, error: roomError } = await supabaseAdminClient
            .from('rooms')
            .select('user_id')
            .eq('id', roomId)
            .single();
          if (roomError || !roomData) {
            console.error('[MOBILE_API] Failed to get room owner:', roomError?.message);
            return NextResponse.json({ error: 'Unauthorized', details: 'Invalid room or room owner not found' }, { status: 401 });
          }
          user = { id: roomData.user_id, userName: 'Room User' }; // Email not available here
          console.log('[MOBILE_API] Successfully fetched room owner as user:', user.id);
        } catch (e) {
          console.error('[MOBILE_API] Exception fetching room owner:', e);
          return NextResponse.json({ error: 'Server error', details: 'Could not fetch room data' }, { status: 500 });
        }
      }
      // If after all mobile checks, user is still null
      if (!user) {
        console.error('[MOBILE_API] Mobile authentication failed. No user identified.');
        return NextResponse.json({ error: 'Unauthorized', details: 'Mobile authentication failed' }, { status: 401 });
      }
    } else {
      // Web App Authentication Flow (using cookies)
      console.log('[WEB_API] Processing as a web request.');
      const cookieStore = cookies();
      const supabaseWebClient = createServerClient<Database>(
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
      supabaseClientForOps = supabaseWebClient; // Use web client for ops

      const { data: webUserData, error: webAuthError } = await supabaseWebClient.auth.getUser();
      if (webAuthError || !webUserData.user) {
        console.error('[WEB_API] Web authentication failed:', webAuthError?.message);
        return NextResponse.json({ error: 'Unauthorized', details: webAuthError?.message || 'Session missing' }, { status: 401 });
      }
      user = { id: webUserData.user.id, email: webUserData.user.email, userName: webUserData.user.email || 'User' };
      console.log('[WEB_API] Web authentication successful for user:', user.id);
    }

    // If user is still null after all checks (should be caught by earlier returns, but as a safeguard)
    if (!user) {
      console.error('[API_AUTH] CRITICAL: User identification failed through all methods.');
      return NextResponse.json({ error: 'Unauthorized', details: 'Unable to identify user' }, { status: 401 });
    }
    
    console.log(`[API_AUTH] Authenticated user: ${user.id}, proceeding with Maya chat logic.`);
    console.log(`[API_DATA] Processing message: "${message.substring(0,50)}..." in room: ${roomId}`);

    // Insert user message (use admin client to ensure it's always written)
    console.log('[API_DB] Inserting user message into messages table');
    const timestamp = new Date().toISOString();
    const messageId = uuidv4();

    if (supabaseAdminClient) {
      const { error: insertError } = await supabaseAdminClient
        .from('messages')
        .insert({
          id: messageId,
          content: message,
          user_id: user.id,
          room_id: roomId,
          role: 'user',
          created_at: timestamp,
        });
      if (insertError) console.error('[API_DB] Failed to insert user message:', insertError.message);
    } else {
      console.error('[API_DB] Cannot insert message, supabaseAdminClient is null');
      return NextResponse.json(
        { error: 'Database client not available' },
        { status: 500 }
      );
    }

    // DEPRECATED: Website-based chat response generation is REMOVED
    // Instead, route this to the memory worker which will generate the response
    try {
      // Determine memory worker URL
      const memoryWorkerUrl = process.env.MEMORY_WORKER_URL || 'http://localhost:3002';
      console.log(`[API_REDIRECT] Sending message to memory worker at ${memoryWorkerUrl}`);

      // Forward the message to memory worker for processing
      console.log(`[API_REDIRECT] About to send messageId: ${messageId} to memory worker`);
      const workerResponse = await fetch(`${memoryWorkerUrl}/process-message`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          roomId,
          userId: user.id,
          content: message,
          messageId // Include the message ID to prevent duplication
        }),
      });

      if (!workerResponse.ok) {
        console.error(`[API_REDIRECT] Memory worker responded with status ${workerResponse.status}`);
        const errorText = await workerResponse.text();
        console.error(`[API_REDIRECT] Memory worker error: ${errorText}`);
      } else {
        console.log('[API_REDIRECT] Successfully forwarded message to memory worker');
      }
      
      // No need to wait for memory worker to process
      // Inform the client that processing is underway
      return NextResponse.json({
        status: 'processing',
        message: {
          id: messageId,
          content: message,
          role: 'user',
          created_at: timestamp,
          user_id: user.id,
          room_id: roomId
        },
        info: 'Message received and processing. Response will be delivered via real-time channel.'
      });
    } catch (workerError: any) {
      console.error('[API_REDIRECT] Error connecting to memory worker:', workerError?.stack || workerError.message);
      
      // Fall back to informing user of error
      return NextResponse.json(
        { 
          error: 'Memory worker connection error', 
          details: 'Connection to memory worker failed. Try again later.', 
          errorType: 'worker_connection'
        },
        { status: 503 }
      );
    }

  } catch (error: any) {
    console.error('[API_UNHANDLED_ERROR] Unhandled error in API route:', error?.stack || error.message);
    return NextResponse.json(
      { error: error.message || 'An unexpected error occurred' },
      { status: 500 }
    );
  }
}

// Handle OPTIONS request for CORS
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*', // Adjust in production
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Maya-Mobile-App', // Added X-Maya-Mobile-App
    },
  });
} 