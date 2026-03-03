import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7';
import ical from 'https://esm.sh/ical-generator@4.1.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface CalendarEvent {
  id: string;
  created_by: string;
  title: string;
  description?: string;
  start_time: string;
  end_time: string;
  all_day: boolean;
  recurrence_rule?: string;
  timezone: string;
  location?: string;
  mood?: string;
  priority?: number;
  energy_level?: string;
  tags?: string[];
  ai_generated?: boolean;
  ai_source_system?: string;
  created_at: string;
  updated_at: string;
}

function formatEventDescription(event: CalendarEvent, includeMetadata: boolean = true): string {
  let description = event.description || '';

  if (includeMetadata) {
    const metadataLines: string[] = [];

    if (event.mood) {
      metadataLines.push(`🎭 Mood: ${event.mood}`);
    }
    
    if (event.priority) {
      metadataLines.push(`⚡ Priority: ${event.priority}`);
    }
    
    if (event.energy_level) {
      metadataLines.push(`🔋 Energy Level: ${event.energy_level}`);
    }
    
    if (event.ai_source_system) {
      metadataLines.push(`📱 Source: ${event.ai_source_system}`);
    }
    
    if (event.ai_generated) {
      metadataLines.push(`🤖 AI Generated: Yes`);
    }
    
    if (event.tags && event.tags.length > 0) {
      metadataLines.push(`🏷️ Tags: ${event.tags.join(', ')}`);
    }

    if (metadataLines.length > 0) {
      if (description) {
        description += '\n\n--- Maya Metadata ---\n';
      }
      description += metadataLines.join('\n');
    }
  }

  return description;
}

function generateICS(events: CalendarEvent[], calendarName: string = 'Maya HQ Calendar'): string {
  const calendar = ical({
    name: calendarName,
    description: 'Personal calendar from Maya HQ',
    timezone: 'UTC',
    prodId: {
      company: 'Maya HQ',
      product: 'Maya Calendar',
      language: 'EN',
    },
  });

  events.forEach(event => {
    const icalEvent = calendar.createEvent({
      id: event.id,
      start: new Date(event.start_time),
      end: new Date(event.end_time),
      summary: event.title,
      description: formatEventDescription(event, true),
      location: event.location,
      allDay: event.all_day,
      timezone: event.timezone || 'UTC',
    });

    // Add recurrence rule if present
    if (event.recurrence_rule) {
      icalEvent.repeating(event.recurrence_rule);
    }

    // Add categories based on Maya metadata
    const categories: string[] = [];
    
    if (event.mood) categories.push(`Mood: ${event.mood}`);
    if (event.priority) categories.push(`Priority: ${event.priority}`);
    if (event.energy_level) categories.push(`Energy: ${event.energy_level}`);
    if (event.tags) categories.push(...event.tags);
    
    if (categories.length > 0) {
      icalEvent.categories(categories.map(cat => ({ name: cat })));
    }
  });

  return calendar.toString();
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const url = new URL(req.url);
    const userId = url.searchParams.get('user_id');

    if (!userId) {
      return new Response('User ID is required', { 
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'text/plain' }
      });
    }

    // Check authentication: either token-based or authorization header
    const token = url.searchParams.get('token');
    const authHeader = req.headers.get('authorization');
    
    let isAuthenticated = false;
    
    if (token) {
      // Token-based authentication for public calendar feeds
      const { data: tokenData, error: tokenError } = await supabase
        .from('calendar_ics_tokens')
        .select('user_id, active')
        .eq('token', token)
        .eq('active', true)
        .single();

      if (!tokenError && tokenData && tokenData.user_id === userId) {
        isAuthenticated = true;
        // Update last accessed timestamp
        await supabase
          .from('calendar_ics_tokens')
          .update({ last_accessed: new Date().toISOString() })
          .eq('token', token);
      }
    } else if (authHeader) {
      // Authorization header authentication for admin access
      try {
        const supabaseClient = createClient(supabaseUrl, supabaseServiceKey);
        const jwt = authHeader.replace('Bearer ', '');
        
        const { data: { user }, error: authError } = await supabaseClient.auth.getUser(jwt);
        
        if (!authError && user && user.id === userId) {
          isAuthenticated = true;
        }
      } catch (authError) {
        console.error('Auth header validation error:', authError);
      }
    }
    
    // If no valid authentication found, return unauthorized
    if (!isAuthenticated) {
      return new Response('Unauthorized: Valid token or authorization required', { 
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'text/plain' }
      });
    }

    // Get date range from query params (optional)
    const startDate = url.searchParams.get('start');
    const endDate = url.searchParams.get('end');

    // Build query for events
    let query = supabase
      .from('calendar_events')
      .select('*')
      .eq('created_by', userId)
      .order('start_time', { ascending: true });

    // Apply date filters if provided
    if (startDate) {
      query = query.gte('end_time', startDate);
    }
    if (endDate) {
      query = query.lte('start_time', endDate);
    }

    const { data: events, error } = await query;

    if (error) {
      console.error('Database error:', error);
      return new Response('Database error', { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'text/plain' }
      });
    }

    // Generate ICS content
    const icsContent = generateICS(events || [], `Maya Calendar - ${userId}`);

    // Return ICS file
    return new Response(icsContent, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/calendar; charset=utf-8',
        'Content-Disposition': 'attachment; filename="maya-calendar.ics"',
        'Cache-Control': 'public, max-age=300',
      },
    });

  } catch (error) {
    console.error('Function error:', error);
    return new Response('Internal server error', { 
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'text/plain' }
    });
  }
}); 