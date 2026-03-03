import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const EXPO_PUSH_ENDPOINT = 'https://exp.host/--/api/v2/push/send';

interface NotificationPayload {
  to: string; 
  sound?: 'default' | null;
  title?: string;
  body?: string;
  data?: Record<string, any>;
  _displayInForeground?: boolean; // Expo specific to show in foreground
}

console.log('Send Push Notification function initializing...');

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { 
      headers: { 
        'Access-Control-Allow-Origin': '*', 
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, supabase-function-secret' 
      } 
    });
  }

  try {
    const internalApiKey = Deno.env.get('INTERNAL_API_KEY');
    const requestApiKey = req.headers.get('supabase-function-secret'); // More secure way for inter-function calls

    if (!internalApiKey || requestApiKey !== internalApiKey) {
      console.warn('Unauthorized attempt to send push notification. Missing or incorrect internal API key.');
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }

    const { userId, title, body, data: customData } = await req.json();

    if (!userId || !title || !body) {
      throw new Error('Missing required fields: userId, title, body');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !supabaseServiceKey) {
        throw new Error('Supabase URL or Service Role Key not configured for send-push-notification function.');
    }
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    const { data: tokensData, error: tokenError } = await supabaseAdmin
      .from('user_push_tokens')
      .select('token')
      .eq('user_id', userId);

    if (tokenError) throw tokenError;

    if (!tokensData || tokensData.length === 0) {
      console.log(`No push tokens found for user ${userId}. Cannot send notification.`);
      return new Response(JSON.stringify({ success: true, message: 'No push tokens found for user.' }), {
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }

    const messages: NotificationPayload[] = tokensData.map(record => ({
      to: record.token,
      sound: 'default',
      title: title,
      body: body,
      data: customData || {},
      _displayInForeground: true, // Tells Expo client to show this notification even if app is in foreground
    }));

    console.log(`Attempting to send ${messages.length} push notifications for user ${userId} via Expo...`);

    const expoResponse = await fetch(EXPO_PUSH_ENDPOINT, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Accept-Encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(messages),
    });

    const responseBody = await expoResponse.json();

    if (!expoResponse.ok) {
      console.error('Error response from Expo Push API:', responseBody);
      return new Response(JSON.stringify({ success: false, error: 'Failed to send to Expo Push API', details: responseBody }), {
        status: expoResponse.status,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }
    
    console.log('Push notifications sent successfully to Expo. Tickets:', responseBody.data);
    return new Response(JSON.stringify({ success: true, message: 'Push notifications sent.', details: responseBody.data }), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });

  } catch (err) {
    console.error('Error in send-push-notification function:', err.message, err.stack);
    return new Response(JSON.stringify({ error: err.message || 'Failed to process request' }), {
      status: err.name === 'SyntaxError' || err.message.includes('Unexpected end of JSON input') ? 400 : 500, 
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }
}) 