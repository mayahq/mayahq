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
    const { message, userId, userName, roomId } = await req.json();

    if (!message || !userId || !roomId) {
      throw new Error('Missing required fields: message, userId, roomId');
    }

    // Insert the user message into Supabase
    const timestamp = new Date().toISOString();
    const messageId = crypto.randomUUID();

    const { error: insertError } = await supabaseClient
      .from('messages')
      .insert({
        id: messageId,
        content: message,
        user_id: userId,
        room_id: roomId,
        role: 'user',
        created_at: timestamp,
      });

    if (insertError) {
      throw new Error(`Failed to insert user message: ${insertError.message}`);
    }

    // Format chat context from recent messages
    const { data: recentMessages, error: historyError } = await supabaseClient
      .from('messages')
      .select('*')
      .eq('room_id', roomId)
      .order('created_at', { ascending: false })
      .limit(10);

    if (historyError) {
      throw new Error(`Failed to fetch chat history: ${historyError.message}`);
    }

    // Format chat history for the Maya agent
    let chatHistory = '';
    if (recentMessages && recentMessages.length > 0) {
      // Reverse to get chronological order
      const chronologicalMessages = [...recentMessages].reverse().slice(0, -1); // Exclude the message we just inserted
      
      // Format the history
      chatHistory = chronologicalMessages.map(msg => 
        `${msg.role === 'user' ? 'User' : 'Maya'}: ${msg.content}`
      ).join('\n');
    }

    // Call the Maya agent API
    const mayaApiUrl = Deno.env.get('MAYA_API_URL');
    if (!mayaApiUrl) {
      throw new Error('MAYA_API_URL environment variable not set');
    }
    
    const mayaResponse = await fetchWithTimeout(
      mayaApiUrl,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${Deno.env.get('MAYA_API_KEY') || ''}`,
        },
        body: JSON.stringify({
          prompt: message,
          context: {
            userId,
            userName,
            chatHistory,
          },
        }),
      },
      50000 // 50-second timeout
    );

    if (!mayaResponse.ok) {
      throw new Error(`Maya API error: ${mayaResponse.status}`);
    }

    const mayaData = await mayaResponse.json();
    const assistantResponse = mayaData.response || mayaData.text || mayaData;

    // Insert Maya's response
    const assistantMessageId = crypto.randomUUID();
    const { error: assistantInsertError } = await supabaseClient
      .from('messages')
      .insert({
        id: assistantMessageId,
        content: typeof assistantResponse === 'string' ? assistantResponse : JSON.stringify(assistantResponse),
        user_id: 'assistant',
        room_id: roomId,
        role: 'assistant',
        created_at: new Date().toISOString(),
      });

    if (assistantInsertError) {
      throw new Error(`Failed to insert assistant message: ${assistantInsertError.message}`);
    }

    // Return the assistant's message
    return new Response(
      JSON.stringify({
        message: {
          id: assistantMessageId,
          content: typeof assistantResponse === 'string' ? assistantResponse : JSON.stringify(assistantResponse),
          role: 'assistant',
          created_at: new Date().toISOString(),
          user_id: 'assistant',
          room_id: roomId,
        },
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
    console.error('Error in maya-chat function:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
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