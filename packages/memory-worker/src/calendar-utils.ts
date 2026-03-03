import { createClient } from '@supabase/supabase-js';

// Ensure Supabase client is initialized using environment variables
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Supabase URL or Service Role Key is missing. Calendar utilities will not work.');
}

const supabase = createClient(supabaseUrl!, supabaseKey!);

export interface CalendarEvent {
  id?: string;
  created_by: string;
  title: string;
  description?: string | null;
  start_time: string;
  end_time: string;
  all_day?: boolean | null;
  location?: string | null;
  timezone?: string | null;
  mood?: string | null;
  priority?: number | null;
  energy_level?: string | null;
  tags?: string[] | null;
  ai_generated?: boolean | null;
  ai_source_system?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  recurrence_rule?: string | null;
  workflow_hooks?: any;
}

/**
 * Attempts to parse a natural language date/time string into an ISO string.
 * @param dateTimeString The natural language date/time string (e.g., "tomorrow at 3pm", "next Friday morning").
 * @returns An ISO date string or null if parsing fails.
 */
function parseDateTime(dateTimeString: string | undefined | null): string | null {
  if (!dateTimeString) return null;

  const lowerString = dateTimeString.toLowerCase().trim();
  const now = new Date();
  let targetDate = new Date(now);

  // Handle relative dates
  if (lowerString.includes('today') || lowerString.includes('tonight')) {
    // Keep current date
  } else if (lowerString.includes('yesterday')) {
    targetDate.setDate(now.getDate() - 1);
  } else if (lowerString.includes('tomorrow')) {
    targetDate.setDate(now.getDate() + 1);
  } else if (lowerString.startsWith('next ')) {
    const dayName = lowerString.split(' ')[1];
    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    let targetDayIndex = days.indexOf(dayName);
    if (targetDayIndex !== -1) {
      let currentDayIndex = now.getDay();
      let diff = targetDayIndex - currentDayIndex;
      if (diff <= 0) {
        diff += 7; // Move to next week
      }
      targetDate.setDate(now.getDate() + diff);
    }
  }

  // Handle time parsing - check for specific times FIRST
  const timeRegex = /(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i;
  const timeMatch = lowerString.match(timeRegex);
  
  if (timeMatch) {
    // Found specific time like "10pm", "3:30am", etc.
    let hours = parseInt(timeMatch[1]);
    const minutes = timeMatch[2] ? parseInt(timeMatch[2]) : 0;
    const meridiem = timeMatch[3];
    
    if (meridiem === 'pm' && hours !== 12) {
      hours += 12;
    } else if (meridiem === 'am' && hours === 12) {
      hours = 0;
    }
    
    targetDate.setHours(hours, minutes, 0, 0);
  } else if (lowerString.includes('morning')) {
    // Only use these defaults if no specific time was found
    targetDate.setHours(9, 0, 0, 0);
  } else if (lowerString.includes('afternoon')) {
    targetDate.setHours(14, 0, 0, 0);
  } else if (lowerString.includes('evening')) {
    targetDate.setHours(18, 0, 0, 0);
  } else if (lowerString.includes('night') || lowerString.includes('tonight')) {
    targetDate.setHours(20, 0, 0, 0);
  } else {
    // Try direct date parsing
    const parsed = new Date(dateTimeString);
    if (!isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
  }
  
  // Check if server is already in CDT timezone
  const serverOffsetMinutes = now.getTimezoneOffset();
  const cdtOffsetMinutes = 300; // CDT is UTC-5 = 300 minutes
  
  if (serverOffsetMinutes === cdtOffsetMinutes) {
    // Server is already in CDT, no conversion needed
    console.log(`Parsed "${dateTimeString}" -> CDT: ${targetDate.toLocaleString()} -> UTC: ${targetDate.toISOString()}`);
    return targetDate.toISOString();
  } else {
    // Server is in different timezone, need to convert
    const utcDate = new Date(targetDate.getTime() + (5 * 60 * 60 * 1000));
    console.log(`Parsed "${dateTimeString}" -> CDT: ${targetDate.toLocaleString()} -> UTC: ${utcDate.toISOString()}`);
    return utcDate.toISOString();
  }
}

/**
 * Calculate end time based on start time and duration hints
 */
function calculateEndTime(startTime: string, durationHints?: string): string {
  const start = new Date(startTime);
  const end = new Date(start);
  
  if (durationHints) {
    const lowerHints = durationHints.toLowerCase();
    if (lowerHints.includes('1 hour') || lowerHints.includes('an hour')) {
      end.setHours(end.getHours() + 1);
    } else if (lowerHints.includes('30 min') || lowerHints.includes('half hour')) {
      end.setMinutes(end.getMinutes() + 30);
    } else if (lowerHints.includes('2 hour')) {
      end.setHours(end.getHours() + 2);
    } else if (lowerHints.includes('all day')) {
      end.setHours(23, 59, 59, 999);
    } else {
      // Default 1 hour
      end.setHours(end.getHours() + 1);
    }
  } else {
    // Default 1 hour duration
    end.setHours(end.getHours() + 1);
  }
  
  return end.toISOString();
}

/**
 * Creates a new calendar event in the database.
 */
export async function dbCreateEvent(
  userId: string,
  eventData: Pick<CalendarEvent, 'title' | 'description' | 'start_time' | 'end_time' | 'all_day' | 'location' | 'mood' | 'priority' | 'energy_level' | 'tags'>
): Promise<CalendarEvent | null> {
  try {
    const parsedStartTime = parseDateTime(eventData.start_time);
    const parsedEndTime = eventData.end_time ? parseDateTime(eventData.end_time) : null;
    
    if (!parsedStartTime) {
      console.warn(`Event creation for user ${userId}: Start time "${eventData.start_time}" could not be parsed.`);
      return null;
    }

    const finalEndTime = parsedEndTime || calculateEndTime(parsedStartTime, eventData.description || '');

    const { data, error } = await supabase
      .from('calendar_events')
      .insert({
        created_by: userId,
        title: eventData.title,
        description: eventData.description,
        start_time: parsedStartTime,
        end_time: finalEndTime,
        all_day: eventData.all_day || false,
        location: eventData.location,
        timezone: 'UTC',
        mood: eventData.mood,
        priority: eventData.priority,
        energy_level: eventData.energy_level,
        tags: eventData.tags,
        ai_generated: true,
        ai_source_system: 'maya-chat',
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating calendar event in Supabase:', error);
      return null;
    }
    
    console.log(`Calendar event created successfully for user ${userId}: ID ${data?.id}`);
    return data as CalendarEvent;
  } catch (e) {
    console.error('Unexpected error in dbCreateEvent:', e);
    return null;
  }
}

/**
 * Helper function to get start and end of day for proper date range filtering
 */
function getDayRange(dateString: string): { start: string; end: string } | null {
  const lowerString = dateString.toLowerCase().trim();
  const now = new Date();
  let targetDate = new Date(now);

  if (lowerString.includes('today')) {
    // Keep current date
  } else if (lowerString.includes('yesterday')) {
    targetDate.setDate(now.getDate() - 1);
  } else if (lowerString.includes('tomorrow')) {
    targetDate.setDate(now.getDate() + 1);
  } else if (lowerString.startsWith('next ')) {
    const dayName = lowerString.split(' ')[1];
    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    let targetDayIndex = days.indexOf(dayName);
    if (targetDayIndex !== -1) {
      let currentDayIndex = now.getDay();
      let diff = targetDayIndex - currentDayIndex;
      if (diff <= 0) {
        diff += 7; // Move to next week
      }
      targetDate.setDate(now.getDate() + diff);
    }
  } else {
    // Try to parse the date directly
    const parsed = new Date(dateString);
    if (!isNaN(parsed.getTime())) {
      targetDate = parsed;
    } else {
      return null; // Can't parse the date
    }
  }

  // Get start of day (00:00:00) and end of day (23:59:59)
  const startOfDay = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate(), 0, 0, 0, 0);
  const endOfDay = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate(), 23, 59, 59, 999);
  
  // Check if server is already in CDT timezone
  const serverOffsetMinutes = now.getTimezoneOffset();
  const cdtOffsetMinutes = 300; // CDT is UTC-5 = 300 minutes
  
  let startOfDayUTC: Date;
  let endOfDayUTC: Date;
  
  if (serverOffsetMinutes === cdtOffsetMinutes) {
    // Server is already in CDT, no conversion needed
    startOfDayUTC = startOfDay;
    endOfDayUTC = endOfDay;
  } else {
    // Server is in different timezone, need to convert
    startOfDayUTC = new Date(startOfDay.getTime() + (5 * 60 * 60 * 1000));
    endOfDayUTC = new Date(endOfDay.getTime() + (5 * 60 * 60 * 1000));
  }

  console.log(`getDayRange for "${dateString}": ${startOfDayUTC.toISOString()} to ${endOfDayUTC.toISOString()}`);

  return {
    start: startOfDayUTC.toISOString(),
    end: endOfDayUTC.toISOString()
  };
}

/**
 * Retrieves calendar events for a given user, with optional filters.
 */
export async function dbGetEvents(
  userId: string,
  filters?: { 
    start_date?: string; 
    end_date?: string; 
    mood?: string; 
    priority?: number;
    title?: string;
    limit?: number;
  }
): Promise<CalendarEvent[]> {
  try {
    let query = supabase
      .from('calendar_events')
      .select('*')
      .eq('created_by', userId);

    // Special handling for day-based queries like "today", "tomorrow", "yesterday"
    if (filters?.start_date) {
      const lowerStart = filters.start_date.toLowerCase().trim();
      if (lowerStart.includes('today') || lowerStart.includes('tomorrow') || lowerStart.includes('yesterday') || lowerStart.startsWith('next ')) {
        const dayRange = getDayRange(filters.start_date);
        if (dayRange) {
          // For day-based queries, find events that overlap with the day
          query = query.gte('start_time', dayRange.start).lte('start_time', dayRange.end);
        }
      } else {
        const parsedStart = parseDateTime(filters.start_date);
        if (parsedStart) {
          query = query.gte('start_time', parsedStart);
        }
      }
    }
    
    // Only apply end_date filter if start_date wasn't a day-based query
    if (filters?.end_date && filters?.start_date) {
      const lowerStart = filters.start_date.toLowerCase().trim();
      if (!lowerStart.includes('today') && !lowerStart.includes('tomorrow') && !lowerStart.includes('yesterday') && !lowerStart.startsWith('next ')) {
        const parsedEnd = parseDateTime(filters.end_date);
        if (parsedEnd) {
          query = query.lte('end_time', parsedEnd);
        }
      }
    } else if (filters?.end_date) {
      const parsedEnd = parseDateTime(filters.end_date);
      if (parsedEnd) {
        query = query.lte('end_time', parsedEnd);
      }
    }
    
    if (filters?.mood) {
      query = query.eq('mood', filters.mood);
    }
    
    if (filters?.priority) {
      query = query.eq('priority', filters.priority);
    }
    
    if (filters?.title) {
      query = query.ilike('title', `%${filters.title}%`);
    }

    query = query.order('start_time', { ascending: true });
    
    if (filters?.limit) {
      query = query.limit(filters.limit);
    } else {
      query = query.limit(20); // Default limit
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error retrieving calendar events from Supabase:', error);
      return [];
    }
    
    console.log(`Retrieved ${data?.length || 0} events for user ${userId} with filters:`, filters);
    return (data as CalendarEvent[]) || [];
  } catch (e) {
    console.error('Unexpected error in dbGetEvents:', e);
    return [];
  }
}

/**
 * Updates an existing calendar event.
 */
export async function dbUpdateEvent(
  eventId: string,
  userId: string,
  updates: Partial<Pick<CalendarEvent, 'title' | 'description' | 'start_time' | 'end_time' | 'all_day' | 'location' | 'mood' | 'priority' | 'energy_level' | 'tags'>>
): Promise<CalendarEvent | null> {
  try {
    console.log(`[dbUpdateEvent] Starting update for event ${eventId} with updates:`, JSON.stringify(updates));
    
    // Parse time updates if provided
    if (updates.start_time && typeof updates.start_time === 'string') {
      console.log(`[dbUpdateEvent] Parsing start_time: "${updates.start_time}"`);
      const parsedStart = parseDateTime(updates.start_time);
      if (parsedStart) {
        console.log(`[dbUpdateEvent] Parsed start_time to: ${parsedStart}`);
        updates.start_time = parsedStart;
      } else {
        console.warn(`[dbUpdateEvent] Update Event ${eventId}: Start time "${updates.start_time}" could not be parsed.`);
        delete updates.start_time;
      }
    }
    
    if (updates.end_time && typeof updates.end_time === 'string') {
      console.log(`[dbUpdateEvent] Parsing end_time: "${updates.end_time}"`);
      const parsedEnd = parseDateTime(updates.end_time);
      if (parsedEnd) {
        console.log(`[dbUpdateEvent] Parsed end_time to: ${parsedEnd}`);
        updates.end_time = parsedEnd;
      } else {
        console.warn(`[dbUpdateEvent] Update Event ${eventId}: End time "${updates.end_time}" could not be parsed.`);
        delete updates.end_time;
      }
    }

    console.log(`[dbUpdateEvent] Final updates object:`, JSON.stringify(updates));

    const { data, error } = await supabase
      .from('calendar_events')
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .eq('id', eventId)
      .eq('created_by', userId)
      .select()
      .single();

    if (error) {
      console.error(`[dbUpdateEvent] Error updating calendar event in Supabase:`, error);
      return null;
    }
    
    if (!data) {
      console.warn(`[dbUpdateEvent] Calendar event ${eventId} not found for user ${userId} or update had no effect.`);
      return null;
    }
    
    console.log(`[dbUpdateEvent] Calendar event updated successfully: ID ${eventId}, new start_time: ${data.start_time}`);
    return data as CalendarEvent;
  } catch (e) {
    console.error(`[dbUpdateEvent] Unexpected error in dbUpdateEvent:`, e);
    return null;
  }
}

/**
 * Deletes a calendar event.
 */
export async function dbDeleteEvent(eventId: string, userId: string): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('calendar_events')
      .delete()
      .eq('id', eventId)
      .eq('created_by', userId);

    if (error) {
      console.error('Error deleting calendar event from Supabase:', error);
      return false;
    }
    
    console.log(`Calendar event deleted successfully: ID ${eventId}`);
    return true;
  } catch (e) {
    console.error('Unexpected error in dbDeleteEvent:', e);
    return false;
  }
}

/**
 * Find events by title or description for update/delete operations
 */
export async function dbFindEventByContent(
  userId: string,
  searchContent: string
): Promise<CalendarEvent[]> {
  try {
    const { data, error } = await supabase
      .from('calendar_events')
      .select('*')
      .eq('created_by', userId)
      .or(`title.ilike.%${searchContent}%,description.ilike.%${searchContent}%`)
      .order('start_time', { ascending: true })
      .limit(5);

    if (error) {
      console.error('Error finding calendar events by content:', error);
      return [];
    }
    
    return (data as CalendarEvent[]) || [];
  } catch (e) {
    console.error('Unexpected error in dbFindEventByContent:', e);
    return [];
  }
} 