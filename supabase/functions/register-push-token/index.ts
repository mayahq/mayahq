// Supabase Edge Function: supabase/functions/register-push-token/index.ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2' // Use Deno compatible Supabase client

console.log('Register Push Token function initializing...')

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' } })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error('Missing Supabase environment variables in Edge Function.')
      return new Response(JSON.stringify({ error: 'Server configuration error.' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Create a Supabase client with the service role key to bypass RLS for admin tasks like this,
    // but rely on RLS defined on the table for user-specific operations if called by user context.
    // For registering a token, we typically get the user ID from the authenticated JWT.
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey)

    // Get user ID from the JWT passed in the Authorization header
    // Supabase Edge Functions automatically populate req.headers.get('Authorization') for authenticated users
    // We need to extract the user_id from the JWT. Supabase client can do this if we use it with the user's token.
    // Alternatively, if this function is called with service_role, we MUST get user_id from request body.

    const authHeader = req.headers.get('Authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.error('Missing or invalid Authorization header.')
      return new Response(JSON.stringify({ error: 'Unauthorized: Missing or invalid token.' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    const token = authHeader.replace('Bearer ', '')
    
    // Create a client scoped to the user to get their ID from the JWT
    const supabaseUserClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
        global: { headers: { Authorization: `Bearer ${token}` } }
    });
    const { data: { user }, error: userError } = await supabaseUserClient.auth.getUser();

    if (userError || !user) {
        console.error('Error getting user from JWT or no user found:', userError?.message);
        return new Response(JSON.stringify({ error: 'Unauthorized: Invalid user token.' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json' },
        });
    }
    const userId = user.id;
    console.log(`Attempting to register token for user: ${userId}`);

    const { token: pushToken, platform } = await req.json()
    if (!pushToken || !platform) {
      throw new Error('Missing pushToken or platform in request body')
    }

    console.log(`Received token: ${pushToken.substring(0,20)}..., Platform: ${platform} for user: ${userId}`);

    // Upsert the token: Insert if new, or update if exists (e.g., update last_used_at or platform if changed)
    // UNIQUE constraint on 'token' column handles conflicts.
    const { data, error } = await supabaseAdmin
      .from('user_push_tokens')
      .upsert(
        { 
          user_id: userId, 
          token: pushToken, 
          platform: platform,
          last_used_at: new Date().toISOString()
        },
        { onConflict: 'token' } // If token exists, update its user_id, platform, last_used_at
      )
      .select()
      .single()

    if (error) {
      console.error('Supabase error registering push token:', error)
      throw error
    }

    console.log('Push token registered/updated successfully:', data)
    return new Response(JSON.stringify({ success: true, data }), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  } catch (err) {
    console.error('Error in register-push-token function:', err.message, err.stack)
    return new Response(JSON.stringify({ error: err.message || 'Failed to process request' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  }
}) 