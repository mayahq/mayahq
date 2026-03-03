import { createClient } from '@supabase/supabase-js';
import { MCPResult } from './mcp-bridge';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

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
}

/**
 * Maya Calendar MCP Tools - Reliable, Simple, Fast
 * Replaces complex LangChain tool calling with straightforward MCP tools
 */
export class CalendarMCPTools {
  
  /**
   * Create a new calendar event
   */
  static async createEvent(args: any): Promise<MCPResult> {
    try {
      const { userId, title, startTime, endTime, description, location, mood = 'work', priority = 3, energyLevel = 'medium', allDay = false } = args;
      
      if (!userId || !title || !startTime || !endTime) {
        throw new Error('Missing required fields: userId, title, startTime, endTime');
      }

      const event: Partial<CalendarEvent> = {
        created_by: userId,
        title,
        description: description || null,
        start_time: startTime,
        end_time: endTime,
        all_day: allDay,
        location: location || null,
        timezone: 'UTC',
        mood,
        priority,
        energy_level: energyLevel,
        ai_generated: true,
        ai_source_system: 'maya-mcp'
      };

      const { data, error } = await supabase
        .from('calendar_events')
        .insert([event])
        .select()
        .single();

      if (error) throw error;

      return {
        content: [{
          type: 'text',
          text: `✅ Calendar event created successfully!\n\n📅 **${data.title}**\n🕐 ${new Date(data.start_time).toLocaleString()} - ${new Date(data.end_time).toLocaleString()}\n${data.description ? `📝 ${data.description}\n` : ''}${data.location ? `📍 ${data.location}\n` : ''}🎭 Mood: ${data.mood}\n⭐ Priority: ${data.priority}/5\n🔋 Energy: ${data.energy_level}`
        }],
        isError: false,
        _meta: { source: 'maya-calendar', action: 'create_event', eventId: data.id }
      };
    } catch (error: any) {
      return {
        content: [{ type: 'text', text: `❌ Failed to create calendar event: ${error.message}` }],
        isError: true
      };
    }
  }

  /**
   * Get upcoming events for a user
   */
  static async getUpcomingEvents(args: any): Promise<MCPResult> {
    try {
      const { userId, limit = 5, days = 7 } = args;
      
      if (!userId) {
        throw new Error('Missing required field: userId');
      }

      const now = new Date();
      const endDate = new Date();
      endDate.setDate(now.getDate() + days);

      const { data, error } = await supabase
        .from('calendar_events')
        .select('*')
        .eq('created_by', userId)
        .gte('start_time', now.toISOString())
        .lte('start_time', endDate.toISOString())
        .order('start_time', { ascending: true })
        .limit(limit);

      if (error) throw error;

      if (!data || data.length === 0) {
        return {
          content: [{ type: 'text', text: `📅 No upcoming events found in the next ${days} days.` }],
          isError: false,
          _meta: { source: 'maya-calendar', action: 'get_upcoming', count: 0 }
        };
      }

      let response = `📅 **Upcoming Events** (next ${days} days):\n\n`;
      data.forEach((event, index) => {
        const start = new Date(event.start_time);
        const mood = event.mood ? ` 🎭${event.mood}` : '';
        const priority = event.priority ? ` ⭐${event.priority}/5` : '';
        
        response += `${index + 1}. **${event.title}**\n`;
        response += `   📅 ${start.toLocaleDateString()} at ${start.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}\n`;
        if (event.location) response += `   📍 ${event.location}\n`;
        if (event.description) response += `   📝 ${event.description}\n`;
        response += `  ${mood}${priority}\n\n`;
      });

      return {
        content: [{ type: 'text', text: response.trim() }],
        isError: false,
        _meta: { source: 'maya-calendar', action: 'get_upcoming', count: data.length }
      };
    } catch (error: any) {
      return {
        content: [{ type: 'text', text: `❌ Failed to get upcoming events: ${error.message}` }],
        isError: true
      };
    }
  }

  /**
   * Get today's events
   */
  static async getTodaysEvents(args: any): Promise<MCPResult> {
    try {
      const { userId } = args;
      
      if (!userId) {
        throw new Error('Missing required field: userId');
      }

      const today = new Date();
      const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59);

      const { data, error } = await supabase
        .from('calendar_events')
        .select('*')
        .eq('created_by', userId)
        .gte('start_time', startOfDay.toISOString())
        .lte('start_time', endOfDay.toISOString())
        .order('start_time', { ascending: true });

      if (error) throw error;

      if (!data || data.length === 0) {
        return {
          content: [{ type: 'text', text: `📅 No events scheduled for today. Perfect time to focus or add something to your calendar!` }],
          isError: false,
          _meta: { source: 'maya-calendar', action: 'get_today', count: 0 }
        };
      }

      let response = `📅 **Today's Schedule** (${today.toLocaleDateString()}):\n\n`;
      data.forEach((event, index) => {
        const start = new Date(event.start_time);
        const end = new Date(event.end_time);
        const mood = event.mood ? ` 🎭${event.mood}` : '';
        const priority = event.priority ? ` ⭐${event.priority}/5` : '';
        
        response += `${index + 1}. **${event.title}**\n`;
        if (event.all_day) {
          response += `   🕐 All day\n`;
        } else {
          response += `   🕐 ${start.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})} - ${end.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}\n`;
        }
        if (event.location) response += `   📍 ${event.location}\n`;
        if (event.description) response += `   📝 ${event.description}\n`;
        response += `  ${mood}${priority}\n\n`;
      });

      return {
        content: [{ type: 'text', text: response.trim() }],
        isError: false,
        _meta: { source: 'maya-calendar', action: 'get_today', count: data.length }
      };
    } catch (error: any) {
      return {
        content: [{ type: 'text', text: `❌ Failed to get today's events: ${error.message}` }],
        isError: true
      };
    }
  }

  /**
   * Update an existing calendar event
   */
  static async updateEvent(args: any): Promise<MCPResult> {
    try {
      const { userId, eventId, title, startTime, endTime, description, location, mood, priority, energyLevel } = args;
      
      if (!userId || !eventId) {
        throw new Error('Missing required fields: userId, eventId');
      }

      const updates: Partial<CalendarEvent> = {};
      
      if (title) updates.title = title;
      if (startTime) updates.start_time = startTime;
      if (endTime) updates.end_time = endTime;
      if (description !== undefined) updates.description = description;
      if (location !== undefined) updates.location = location;
      if (mood) updates.mood = mood;
      if (priority) updates.priority = priority;
      if (energyLevel) updates.energy_level = energyLevel;

      const { data, error } = await supabase
        .from('calendar_events')
        .update(updates)
        .eq('id', eventId)
        .eq('created_by', userId)
        .select()
        .single();

      if (error) throw error;

      if (!data) {
        return {
          content: [{ type: 'text', text: `❌ Event not found or you don't have permission to update it.` }],
          isError: true
        };
      }

      return {
        content: [{
          type: 'text',
          text: `✅ Calendar event updated successfully!\n\n📅 **${data.title}**\n🕐 ${new Date(data.start_time).toLocaleString()} - ${new Date(data.end_time).toLocaleString()}\n${data.description ? `📝 ${data.description}\n` : ''}${data.location ? `📍 ${data.location}\n` : ''}🎭 Mood: ${data.mood}\n⭐ Priority: ${data.priority}/5\n🔋 Energy: ${data.energy_level}`
        }],
        isError: false,
        _meta: { source: 'maya-calendar', action: 'update_event', eventId: data.id }
      };
    } catch (error: any) {
      return {
        content: [{ type: 'text', text: `❌ Failed to update calendar event: ${error.message}` }],
        isError: true
      };
    }
  }

  /**
   * Delete a calendar event
   */
  static async deleteEvent(args: any): Promise<MCPResult> {
    try {
      const { userId, eventId } = args;
      
      if (!userId || !eventId) {
        throw new Error('Missing required fields: userId, eventId');
      }

      // First get the event to show what we're deleting
      const { data: eventData } = await supabase
        .from('calendar_events')
        .select('title, start_time')
        .eq('id', eventId)
        .eq('created_by', userId)
        .single();

      const { error } = await supabase
        .from('calendar_events')
        .delete()
        .eq('id', eventId)
        .eq('created_by', userId);

      if (error) throw error;

      const eventTitle = eventData?.title || 'Unknown event';
      const eventTime = eventData?.start_time ? new Date(eventData.start_time).toLocaleString() : 'Unknown time';

      return {
        content: [{
          type: 'text',
          text: `✅ Calendar event deleted successfully!\n\n🗑️ Removed: **${eventTitle}**\n📅 Was scheduled for: ${eventTime}`
        }],
        isError: false,
        _meta: { source: 'maya-calendar', action: 'delete_event', eventId }
      };
    } catch (error: any) {
      return {
        content: [{ type: 'text', text: `❌ Failed to delete calendar event: ${error.message}` }],
        isError: true
      };
    }
  }
}

/**
 * Available Maya Calendar MCP Tools
 */
export const MAYA_CALENDAR_TOOLS = [
  {
    name: 'maya_calendar_create',
    description: 'Create a new calendar event with Maya\'s advanced features (mood, priority, energy level)',
    inputSchema: {
      type: 'object',
      properties: {
        userId: { type: 'string', description: 'User ID' },
        title: { type: 'string', description: 'Event title' },
        startTime: { type: 'string', description: 'Start time (ISO string)' },
        endTime: { type: 'string', description: 'End time (ISO string)' },
        description: { type: 'string', description: 'Event description (optional)' },
        location: { type: 'string', description: 'Event location (optional)' },
        mood: { type: 'string', enum: ['work', 'personal', 'family', 'health', 'creative', 'social'], description: 'Event mood' },
        priority: { type: 'number', minimum: 1, maximum: 5, description: 'Priority level (1-5)' },
        energyLevel: { type: 'string', enum: ['low', 'medium', 'high'], description: 'Required energy level' },
        allDay: { type: 'boolean', description: 'All day event' }
      },
      required: ['userId', 'title', 'startTime', 'endTime']
    }
  },
  {
    name: 'maya_calendar_upcoming',
    description: 'Get upcoming calendar events for a user',
    inputSchema: {
      type: 'object',
      properties: {
        userId: { type: 'string', description: 'User ID' },
        limit: { type: 'number', description: 'Maximum number of events to return (default: 5)' },
        days: { type: 'number', description: 'Number of days to look ahead (default: 7)' }
      },
      required: ['userId']
    }
  },
  {
    name: 'maya_calendar_today',
    description: 'Get today\'s calendar events for a user',
    inputSchema: {
      type: 'object',
      properties: {
        userId: { type: 'string', description: 'User ID' }
      },
      required: ['userId']
    }
  },
  {
    name: 'maya_calendar_update',
    description: 'Update an existing calendar event',
    inputSchema: {
      type: 'object',
      properties: {
        userId: { type: 'string', description: 'User ID' },
        eventId: { type: 'string', description: 'Event ID to update' },
        title: { type: 'string', description: 'New event title' },
        startTime: { type: 'string', description: 'New start time (ISO string)' },
        endTime: { type: 'string', description: 'New end time (ISO string)' },
        description: { type: 'string', description: 'New event description' },
        location: { type: 'string', description: 'New event location' },
        mood: { type: 'string', enum: ['work', 'personal', 'family', 'health', 'creative', 'social'], description: 'New event mood' },
        priority: { type: 'number', minimum: 1, maximum: 5, description: 'New priority level (1-5)' },
        energyLevel: { type: 'string', enum: ['low', 'medium', 'high'], description: 'New required energy level' }
      },
      required: ['userId', 'eventId']
    }
  },
  {
    name: 'maya_calendar_delete',
    description: 'Delete a calendar event',
    inputSchema: {
      type: 'object',
      properties: {
        userId: { type: 'string', description: 'User ID' },
        eventId: { type: 'string', description: 'Event ID to delete' }
      },
      required: ['userId', 'eventId']
    }
  }
]; 