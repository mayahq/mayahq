// Supabase Edge Function for sending messages
// This handles message validation, creates message records,
// and generates signed URLs for media uploads

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.36.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
}

interface RequestBody {
  room_id: string
  user_id: string
  content: string
  role?: 'user' | 'assistant'
  message_id?: string
  media_type?: 'image' | 'audio' | 'video'
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  
  try {
    // Create Supabase client
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! }
        }
      }
    )
    
    // Get the JWT token from the request
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    
    // Verify the user is authenticated
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser()
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    
    // Parse request body
    const { room_id, user_id, content, role = 'user', message_id, media_type } = await req.json() as RequestBody
    
    // Validate request
    if (!room_id || !user_id || content === undefined) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: room_id, user_id, content' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    
    // Verify that the authenticated user matches the user_id in the request
    // This prevents users from impersonating others
    if (user.id !== user_id) {
      return new Response(
        JSON.stringify({ error: 'User ID does not match authenticated user' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    
    // Create a message ID if not provided
    const finalMessageId = message_id || crypto.randomUUID()
    
    // Insert the message
    const { data: message, error: insertError } = await supabaseClient
      .from('messages')
      .insert({
        id: finalMessageId,
        room_id: room_id,
        user_id: user_id,
        content: content,
        role: role
      })
      .select()
      .single()
    
    if (insertError) {
      return new Response(
        JSON.stringify({ error: `Failed to insert message: ${insertError.message}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    
    // If media attachment is requested, generate a signed upload URL
    let uploadUrl = null
    if (media_type) {
      // Create a path for the media file
      const fileExtension = media_type === 'image' ? 'jpg' : 
                          media_type === 'audio' ? 'mp3' : 
                          media_type === 'video' ? 'mp4' : 'bin'
      
      const filePath = `chat-media/${finalMessageId}.${fileExtension}`
      
      // Generate a signed URL for uploading
      const { data: signedUrl, error: signedUrlError } = await supabaseClient
        .storage
        .from('chat-media')
        .createSignedUploadUrl(filePath)
      
      if (signedUrlError) {
        console.error('Error generating signed URL:', signedUrlError)
        // Continue despite the error - the message is already saved
      } else {
        uploadUrl = signedUrl.signedUrl
        
        // Update the message with metadata about the media
        await supabaseClient
          .from('messages')
          .update({ 
            metadata: { 
              has_media: true,
              media_type: media_type,
              media_path: filePath
            }
          })
          .eq('id', finalMessageId)
      }
    }
    
    // Return the message and upload URL if applicable
    return new Response(
      JSON.stringify({ 
        message: message,
        uploadUrl: uploadUrl
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
    
  } catch (error) {
    console.error('Error processing request:', error)
    
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
}) 