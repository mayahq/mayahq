import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { v4 as uuidv4 } from 'uuid';

// Make initialization conditional to handle build-time missing env vars
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

// Initialize Supabase client only if keys are available
const getSupabaseClient = () => {
  // Skip during build if keys are missing
  if (!supabaseUrl || !supabaseServiceKey) {
    console.log('Supabase configuration missing');
    return null;
  }
  
  return createClient(supabaseUrl, supabaseServiceKey);
};

/**
 * Simple API endpoint for mobile clients to store memories without column selection issues
 * 
 * Request body:
 * {
 *   content: string,     // Memory content
 *   userId: string,      // User ID
 *   userName: string,    // User name or email
 *   tags?: string[],     // Optional tags
 *   platform?: string    // Optional platform identifier
 * }
 */
export async function POST(request: NextRequest) {
  console.log('[MEMORY_API] Received request to /api/maya-memory endpoint');

  try {
    // Initialize Supabase client
    const supabaseClient = getSupabaseClient();
    if (!supabaseClient) {
      console.error('[MEMORY_API] Supabase client could not be initialized');
      return NextResponse.json(
        { error: 'Failed to initialize Supabase client' },
        { status: 500 }
      );
    }
    
    const requestData = await request.json();
    const { content, userId: directUserId, userName, tags = [], platform = 'mobile-api' } = requestData;

    if (!content) {
      console.error('[MEMORY_API] Missing content in request');
      return NextResponse.json({ error: 'Missing required field: content' }, { status: 400 });
    }

    const authHeader = request.headers.get('authorization');
    const isMobileHeaderPresent = request.headers.get('X-Maya-Mobile-App') === 'true';
    let token = null;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7);
      console.log('[MEMORY_API] Detected Bearer token.');
    }

    let user: { id: string; email?: string | undefined } | null = null;

    const isLikelyMobileRequest = isMobileHeaderPresent || !!token || !!directUserId;

    if (isLikelyMobileRequest) {
      console.log('[MEMORY_API] Processing as mobile request.');
      if (directUserId) {
        console.log('[MEMORY_API] Using direct userId from request body:', directUserId);
        user = { id: directUserId };
      } else if (token) {
        console.log('[MEMORY_API] Validating token with admin client.');
        try {
          const { data: userData, error: tokenError } = await supabaseClient.auth.getUser(token); // supabaseClient is already admin here
          if (tokenError || !userData.user) {
            console.error('[MEMORY_API] Token validation failed:', tokenError?.message);
            return NextResponse.json({ error: 'Unauthorized', details: 'Invalid token' }, { status: 401 });
          }
          user = userData.user;
          console.log('[MEMORY_API] Token validated for user:', user.id);
        } catch (e) {
          console.error('[MEMORY_API] Exception during token validation:', e);
          return NextResponse.json({ error: 'Unauthorized', details: 'Token validation exception' }, { status: 401 });
        }
      } else {
        // This case should ideally not be hit if mobile app always sends directUserId or token
        console.error('[MEMORY_API] Mobile request without directUserId or token.');
        return NextResponse.json({ error: 'Unauthorized', details: 'Missing mobile authentication credentials' }, { status: 401 });
      }
    } else {
      // Fallback or non-mobile request - this endpoint is primarily for mobile, so this path is less likely/intended.
      // If this endpoint were also for web, cookie-based auth (createServerClient) would go here.
      console.warn('[MEMORY_API] Request does not appear to be a typical mobile request. Ensure headers/body are correct.');
      // For now, let's try to proceed if a token was somehow passed without other mobile indicators
      if (token) {
        try {
            const { data: userData, error: tokenError } = await supabaseClient.auth.getUser(token);
            if (tokenError || !userData.user) throw tokenError || new Error('Invalid token');
            user = userData.user;
        } catch (e) {
            console.error('[MEMORY_API] Token validation failed for non-standard request:', e);
            return NextResponse.json({ error: 'Unauthorized', details: 'Token validation failed' }, { status: 401 });
        }
      } else {
        return NextResponse.json({ error: 'Unauthorized', details: 'No authentication method applicable' }, { status: 401 });
      }
    }

    if (!user) {
      console.error('[MEMORY_API] CRITICAL: User identification failed.');
      return NextResponse.json({ error: 'Unauthorized', details: 'Unable to identify user' }, { status: 401 });
    }

    console.log(`[MEMORY_API] Authenticated user: ${user.id}`);
    console.log(`[MEMORY_API] Processing memory: "${content.substring(0, 50)}..."`);

    const metadata = {
      userId: user.id, // Use the definitively identified user ID
      userName: userName || user.email || 'User',
      timestamp: new Date().toISOString(),
      type: 'memory', // Or determine from request if needed
      platform,
      client_info: {
        endpoint: 'maya-memory-api',
        method: 'POST',
        api_version: '1.0'
      }
    };

    // All subsequent operations will use supabaseClient (which is the admin client)
    // APPROACH 1: Try API-specific RPC function
    try {
      console.log('[MEMORY_API] Using api_insert_maya_memory RPC function');
      const { data: rpcData, error: rpcError } = await supabaseClient.rpc('api_insert_maya_memory', {
        p_content: content,
        p_metadata: metadata
      });
      
      if (rpcError) {
        console.error('[MEMORY_API] RPC function failed:', rpcError);
        throw rpcError;
      }
      
      console.log('[MEMORY_API] Successfully stored memory via RPC:', rpcData);
      
      if (tags.length > 0 && rpcData) {
        try {
          const { error: updateError } = await supabaseClient
            .from('maya_memories')
            .update({ tags })
            .eq('id', rpcData);
          if (updateError) console.log('[MEMORY_API] Failed to update tags (memory stored):', updateError);
        } catch (tagUpdateEx) { console.error('[MEMORY_API] Exception updating tags:', tagUpdateEx); }
      }
      
      return NextResponse.json({ success: true, id: rpcData, message: 'Memory stored successfully via RPC' });
    } catch (rpcError) {
      console.error('[MEMORY_API] RPC approach failed, trying API view:', rpcError);
    }

    // APPROACH 2: Try the API view (using raw fetch with service key)
    try {
      console.log('[MEMORY_API] Trying API view for memory storage (raw fetch)');
      const rawFetchUrl = `${supabaseUrl}/rest/v1/api_maya_memories`;
      const rawFetchBody = { content, metadata, tags, created_at: new Date().toISOString() };
      const rawFetchInit: RequestInit = {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseServiceKey}`,
          'apikey': supabaseServiceKey,
          'Prefer': 'return=representation'
        },
        body: JSON.stringify(rawFetchBody)
      };
      const rawResponse = await fetch(rawFetchUrl, rawFetchInit);
      if (!rawResponse.ok) {
        const errorText = await rawResponse.text();
        throw new Error(`API view insert failed: ${rawResponse.status} ${errorText}`);
      }
      const responseData = await rawResponse.json();
      console.log('[MEMORY_API] Successfully stored memory via API view (raw fetch):', responseData);
      return NextResponse.json({ success: true, id: responseData[0]?.id, message: 'Memory stored successfully via API view' });
    } catch (viewError) {
      console.error('[MEMORY_API] API view approach failed, trying direct RPC:', viewError);
    }

    // APPROACH 3: Try direct RPC as last resort
    try {
      console.log('[MEMORY_API] Trying direct insert_mobile_memory_direct RPC as last resort');
      const { data: directData, error: directError } = await supabaseClient.rpc('insert_mobile_memory_direct', {
        p_content: content,
        p_user_id: user.id, // Use the identified user ID
        p_user_name: userName || user.email || 'User'
      });
      if (directError) throw directError;
      console.log('[MEMORY_API] Successfully stored memory via direct RPC:', directData);
      return NextResponse.json({ success: true, id: directData, message: 'Memory stored successfully via direct RPC' });
    } catch (finalError: any) {
      console.error('[MEMORY_API] All memory storage approaches failed. Final error:', finalError);
      return NextResponse.json(
        { error: 'Failed to store memory', details: finalError.message || 'Unknown error' },
        { status: 500 }
      );
    }
  } catch (error: any) {
    console.error('[MEMORY_API] Unhandled error in POST handler:', error);
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