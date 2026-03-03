import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface CreateEventRequest {
  title: string;
  description?: string;
  start_time: string;
  end_time: string;
  all_day?: boolean;
  rrule?: string;
  timezone?: string;
  location?: string;
  metadata?: any;
}

interface UpdateEventRequest extends Partial<CreateEventRequest> {}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response('Authorization required', { 
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: {
        headers: { Authorization: authHeader }
      }
    });

    // Verify user authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { 
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const url = new URL(req.url);
    const pathParts = url.pathname.split('/').filter(part => part);
    const operation = pathParts[pathParts.length - 1];

    switch (req.method) {
      case 'GET':
        return await handleGetEvents(supabase, user.id, url);
      
      case 'POST':
        if (operation === 'create-token') {
          return await handleCreateICSToken(supabase, user.id);
        }
        return await handleCreateEvent(supabase, user.id, req);
      
      case 'PUT':
        return await handleUpdateEvent(supabase, user.id, req, pathParts);
      
      case 'DELETE':
        return await handleDeleteEvent(supabase, user.id, pathParts);
      
      default:
        return new Response(JSON.stringify({ error: 'Method not allowed' }), {
          status: 405,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }

  } catch (error) {
    console.error('Error in calendar-operations function:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), { 
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});

async function handleGetEvents(supabase: any, userId: string, url: URL) {
  try {
    const startDate = url.searchParams.get('start');
    const endDate = url.searchParams.get('end');
    const search = url.searchParams.get('search');
    
    let query = supabase
      .from('calendar_events')
      .select('*')
      .eq('created_by', userId)
      .order('start_time', { ascending: true });

    if (startDate) {
      query = query.gte('start_time', startDate);
    }
    if (endDate) {
      query = query.lte('end_time', endDate);
    }
    if (search) {
      query = query.ilike('title', `%${search}%`);
    }

    const { data: events, error } = await query;

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({ events }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error fetching events:', error);
    return new Response(JSON.stringify({ error: 'Failed to fetch events' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}

async function handleCreateEvent(supabase: any, userId: string, req: Request) {
  try {
    const eventData: CreateEventRequest = await req.json();
    
    // Validate required fields
    if (!eventData.title || !eventData.start_time || !eventData.end_time) {
      return new Response(JSON.stringify({ 
        error: 'Title, start_time, and end_time are required' 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const { data: event, error } = await supabase
      .from('calendar_events')
      .insert({
        ...eventData,
        created_by: userId,
      })
      .select()
      .single();

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({ event }), {
      status: 201,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error creating event:', error);
    return new Response(JSON.stringify({ error: 'Failed to create event' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}

async function handleUpdateEvent(supabase: any, userId: string, req: Request, pathParts: string[]) {
  try {
    const eventId = pathParts[pathParts.length - 1];
    const updates: UpdateEventRequest = await req.json();

    const { data: event, error } = await supabase
      .from('calendar_events')
      .update(updates)
      .eq('id', eventId)
      .eq('created_by', userId)
      .select()
      .single();

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (!event) {
      return new Response(JSON.stringify({ error: 'Event not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({ event }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error updating event:', error);
    return new Response(JSON.stringify({ error: 'Failed to update event' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}

async function handleDeleteEvent(supabase: any, userId: string, pathParts: string[]) {
  try {
    const eventId = pathParts[pathParts.length - 1];

    const { error } = await supabase
      .from('calendar_events')
      .delete()
      .eq('id', eventId)
      .eq('created_by', userId);

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error deleting event:', error);
    return new Response(JSON.stringify({ error: 'Failed to delete event' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}

async function handleCreateICSToken(supabase: any, userId: string) {
  try {
    // Generate a secure token
    const token = Array.from(crypto.getRandomValues(new Uint8Array(32)))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    const { data: icsToken, error } = await supabase
      .from('calendar_ics_tokens')
      .insert({
        user_id: userId,
        token,
        name: 'Maya Calendar ICS Feed',
      })
      .select()
      .single();

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({ token: icsToken }), {
      status: 201,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error creating ICS token:', error);
    return new Response(JSON.stringify({ error: 'Failed to create ICS token' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
} 