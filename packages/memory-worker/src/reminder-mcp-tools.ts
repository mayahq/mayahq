import { createClient } from '@supabase/supabase-js';
import { MCPResult } from './mcp-bridge';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export interface Reminder {
  id?: string;
  user_id: string;
  title: string;
  content?: string | null;
  remind_at: string;
  created_at?: string;
  updated_at?: string;
  status: 'pending' | 'sent' | 'acknowledged' | 'dismissed' | 'snoozed';
  reminder_type: 'manual' | 'pattern' | 'context' | 'relationship';
  rrule?: string | null;
  source_message_id?: string | null;
  source_room_id?: string | null;
  priority?: string | null;
  metadata?: any;
}

/**
 * Maya Reminder MCP Tools - Reliable, Simple, Smart
 * Replaces complex regex-based reminder parsing with straightforward MCP tools
 */
export class ReminderMCPTools {
  
  /**
   * Create a new reminder
   */
  static async createReminder(args: any): Promise<MCPResult> {
    try {
      const { 
        userId, 
        title, 
        reminderTime, 
        content,
        priority = 'medium',
        reminderType = 'manual',
        rrule,
        sourceMessageId,
        sourceRoomId
      } = args;
      
      if (!userId || !title || !reminderTime) {
        throw new Error('Missing required fields: userId, title, reminderTime');
      }

      const reminder: any = {
        user_id: userId,
        title,
        content: content || null,
        remind_at: reminderTime,
        status: 'pending',
        reminder_type: reminderType,
        rrule: rrule || null,
        source_message_id: sourceMessageId || null,
        source_room_id: sourceRoomId || null,
        priority: priority,
        metadata: {},
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      const { data, error } = await supabase
        .from('maya_reminders')
        .insert([reminder])
        .select()
        .single();

      if (error) throw error;

      let response = `✅ Reminder created successfully!\n\n⏰ **${data.title}**\n🕐 ${new Date(data.remind_at).toLocaleString()}`;
      
      if (data.content) response += `\n📝 ${data.content}`;
      if (data.priority && data.priority !== 'medium') response += `\n⭐ Priority: ${data.priority}`;
      if (data.reminder_type === 'pattern') response += `\n🔄 Smart reminder`;
      if (data.rrule) response += `\n🔄 Recurring reminder`;

      return {
        content: [{ type: 'text', text: response }],
        isError: false,
        _meta: { 
          source: 'maya-reminders', 
          action: 'create_reminder', 
          reminderId: data.id
        }
      };
    } catch (error: any) {
      return {
        content: [{ type: 'text', text: `❌ Failed to create reminder: ${error.message}` }],
        isError: true
      };
    }
  }

  /**
   * Get upcoming reminders for a user
   */
  static async getUpcomingReminders(args: any): Promise<MCPResult> {
    try {
      const { userId, limit = 5, hours = 24 } = args;
      
      if (!userId) {
        throw new Error('Missing required field: userId');
      }

      const now = new Date();
      const endTime = new Date();
      endTime.setHours(now.getHours() + hours);

      const { data, error } = await supabase
        .from('maya_reminders')
        .select('*')
        .eq('user_id', userId)
        .eq('status', 'pending')
        .gte('remind_at', now.toISOString())
        .lte('remind_at', endTime.toISOString())
        .order('remind_at', { ascending: true })
        .limit(limit);

      if (error) throw error;

      if (!data || data.length === 0) {
        return {
          content: [{ type: 'text', text: `⏰ No upcoming reminders in the next ${hours} hours.` }],
          isError: false,
          _meta: { source: 'maya-reminders', action: 'get_upcoming', count: 0 }
        };
      }

      let response = `⏰ **Upcoming Reminders** (next ${hours} hours):\n\n`;
      data.forEach((reminder, index) => {
        const time = new Date(reminder.remind_at);
        const priorityIcon = reminder.priority === 'high' ? ' ⭐⭐' : 
                            reminder.priority === 'urgent' ? ' ⭐⭐⭐' : 
                            reminder.priority === 'low' ? ' ⭐' : '';
        const recurring = reminder.rrule ? ' 🔄' : '';
        
        response += `${index + 1}. **${reminder.title}**${priorityIcon}${recurring}\n`;
        response += `   🕐 ${time.toLocaleDateString()} at ${time.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}\n`;
        if (reminder.content) response += `   📝 ${reminder.content}\n`;
        response += `\n`;
      });

      return {
        content: [{ type: 'text', text: response.trim() }],
        isError: false,
        _meta: { source: 'maya-reminders', action: 'get_upcoming', count: data.length }
      };
    } catch (error: any) {
      return {
        content: [{ type: 'text', text: `❌ Failed to get upcoming reminders: ${error.message}` }],
        isError: true
      };
    }
  }

  /**
   * Get all reminders for a user with optional filtering
   */
  static async getAllReminders(args: any): Promise<MCPResult> {
    try {
      const { userId, status = 'pending', limit = 10 } = args;
      
      if (!userId) {
        throw new Error('Missing required field: userId');
      }

      let query = supabase
        .from('maya_reminders')
        .select('*')
        .eq('user_id', userId)
        .order('remind_at', { ascending: true })
        .limit(limit);

      if (status !== 'all') {
        query = query.eq('status', status);
      }

      const { data, error } = await query;

      if (error) throw error;

      if (!data || data.length === 0) {
        return {
          content: [{ type: 'text', text: `⏰ No ${status === 'all' ? '' : status + ' '}reminders found.` }],
          isError: false,
          _meta: { source: 'maya-reminders', action: 'get_all', count: 0 }
        };
      }

      let response = `⏰ **Your ${status === 'all' ? 'All' : status.charAt(0).toUpperCase() + status.slice(1)} Reminders**:\n\n`;
      data.forEach((reminder, index) => {
        const time = new Date(reminder.remind_at);
        const priorityIcon = reminder.priority === 'high' ? ' ⭐⭐' : 
                            reminder.priority === 'urgent' ? ' ⭐⭐⭐' : 
                            reminder.priority === 'low' ? ' ⭐' : '';
        const recurring = reminder.rrule ? ' 🔄' : '';
        const statusIcon = reminder.status === 'pending' ? '⏰' : 
                          reminder.status === 'sent' ? '✅' : 
                          reminder.status === 'acknowledged' ? '✅' : 
                          reminder.status === 'dismissed' ? '❌' : '😴';
        
        response += `${index + 1}. ${statusIcon} **${reminder.title}**${priorityIcon}${recurring}\n`;
        response += `   🕐 ${time.toLocaleDateString()} at ${time.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}\n`;
        if (reminder.content) response += `   📝 ${reminder.content}\n`;
        response += `\n`;
      });

      return {
        content: [{ type: 'text', text: response.trim() }],
        isError: false,
        _meta: { source: 'maya-reminders', action: 'get_all', count: data.length }
      };
    } catch (error: any) {
      return {
        content: [{ type: 'text', text: `❌ Failed to get reminders: ${error.message}` }],
        isError: true
      };
    }
  }

  /**
   * Update an existing reminder
   */
  static async updateReminder(args: any): Promise<MCPResult> {
    try {
      const { userId, reminderId, updates } = args;
      
      if (!userId || !reminderId || !updates) {
        throw new Error('Missing required fields: userId, reminderId, updates');
      }

      const updateData = {
        ...updates,
        updated_at: new Date().toISOString()
      };

      const { data, error } = await supabase
        .from('maya_reminders')
        .update(updateData)
        .eq('id', reminderId)
        .eq('user_id', userId)
        .select()
        .single();

      if (error) throw error;

      if (!data) {
        return {
          content: [{ type: 'text', text: `❌ Reminder not found or you don't have permission to update it.` }],
          isError: true
        };
      }

      return {
        content: [{
          type: 'text',
          text: `✅ Reminder updated successfully!\n\n⏰ **${data.title}**\n🕐 ${new Date(data.remind_at).toLocaleString()}`
        }],
        isError: false,
        _meta: { source: 'maya-reminders', action: 'update_reminder', reminderId: data.id }
      };
    } catch (error: any) {
      return {
        content: [{ type: 'text', text: `❌ Failed to update reminder: ${error.message}` }],
        isError: true
      };
    }
  }

  /**
   * Delete a reminder
   */
  static async deleteReminder(args: any): Promise<MCPResult> {
    try {
      const { userId, reminderId } = args;
      
      if (!userId || !reminderId) {
        throw new Error('Missing required fields: userId, reminderId');
      }

      // First get the reminder to show what we're deleting
      const { data: reminderData } = await supabase
        .from('maya_reminders')
        .select('title, remind_at')
        .eq('id', reminderId)
        .eq('user_id', userId)
        .single();

      const { error } = await supabase
        .from('maya_reminders')
        .delete()
        .eq('id', reminderId)
        .eq('user_id', userId);

      if (error) throw error;

      const reminderTitle = reminderData?.title || 'Unknown reminder';
      const reminderTime = reminderData?.remind_at ? new Date(reminderData.remind_at).toLocaleString() : 'Unknown time';

      return {
        content: [{
          type: 'text',
          text: `✅ Reminder deleted successfully!\n\n🗑️ Removed: **${reminderTitle}**\n📅 Was scheduled for: ${reminderTime}`
        }],
        isError: false,
        _meta: { source: 'maya-reminders', action: 'delete_reminder', reminderId }
      };
    } catch (error: any) {
      return {
        content: [{ type: 'text', text: `❌ Failed to delete reminder: ${error.message}` }],
        isError: true
      };
    }
  }

  /**
   * Create a linked reminder (connected to task, event, or message)
   */
  static async createLinkedReminder(args: any): Promise<MCPResult> {
    try {
      const { 
        userId, 
        title, 
        reminderTime, 
        content,
        linkType, // 'task', 'event', 'message'
        linkId,   // ID of the linked item
        priority = 'medium'
      } = args;
      
      if (!userId || !title || !reminderTime || !linkType || !linkId) {
        throw new Error('Missing required fields: userId, title, reminderTime, linkType, linkId');
      }

      // Store link info in metadata since we don't have separate columns
      const linkField = linkType === 'message' ? 'source_message_id' : null;
      const metadata = {
        linkedTo: linkType,
        linkedId: linkId
      };

      const reminder: any = {
        user_id: userId,
        title,
        content: content || null,
        remind_at: reminderTime,
        status: 'pending',
        reminder_type: 'manual',
        priority,
        metadata,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      // If linking to a message, use the proper field
      if (linkField && linkType === 'message') {
        reminder[linkField] = linkId;
      }

      const { data, error } = await supabase
        .from('maya_reminders')
        .insert([reminder])
        .select()
        .single();

      if (error) throw error;

      return {
        content: [{
          type: 'text',
          text: `✅ Linked reminder created!\n\n⏰ **${data.title}**\n🕐 ${new Date(data.remind_at).toLocaleString()}\n🔗 Linked to ${linkType}: ${linkId}`
        }],
        isError: false,
        _meta: { 
          source: 'maya-reminders', 
          action: 'create_linked_reminder', 
          reminderId: data.id,
          linkType,
          linkId
        }
      };
    } catch (error: any) {
      return {
        content: [{ type: 'text', text: `❌ Failed to create linked reminder: ${error.message}` }],
        isError: true
      };
    }
  }
}

/**
 * Available Maya Reminder MCP Tools
 */
export const MAYA_REMINDER_TOOLS = [
  {
    name: 'maya_reminder_create',
    description: 'Create a new reminder with optional linking to tasks, events, or messages',
    inputSchema: {
      type: 'object',
      properties: {
        userId: { type: 'string', description: 'User ID' },
        title: { type: 'string', description: 'Reminder title/content' },
        reminderTime: { type: 'string', description: 'When to remind (ISO string)' },
        content: { type: 'string', description: 'Additional details (optional)' },
        priority: { type: 'string', enum: ['low', 'medium', 'high', 'urgent'], description: 'Priority level' },
        reminderType: { type: 'string', enum: ['manual', 'pattern', 'context', 'relationship'], description: 'Type of reminder' },
        rrule: { type: 'string', description: 'Recurrence pattern for recurring reminders' },
        sourceMessageId: { type: 'string', description: 'ID of source message if created from conversation' },
        sourceRoomId: { type: 'string', description: 'ID of source room if created from conversation' }
      },
      required: ['userId', 'title', 'reminderTime']
    }
  },
  {
    name: 'maya_reminder_upcoming',
    description: 'Get upcoming reminders for a user',
    inputSchema: {
      type: 'object',
      properties: {
        userId: { type: 'string', description: 'User ID' },
        limit: { type: 'number', description: 'Maximum number of reminders to return (default: 5)' },
        hours: { type: 'number', description: 'Number of hours to look ahead (default: 24)' }
      },
      required: ['userId']
    }
  },
  {
    name: 'maya_reminder_list',
    description: 'Get all reminders for a user with optional status filtering',
    inputSchema: {
      type: 'object',
      properties: {
        userId: { type: 'string', description: 'User ID' },
        status: { type: 'string', enum: ['pending', 'sent', 'completed', 'cancelled', 'all'], description: 'Filter by status (default: pending)' },
        limit: { type: 'number', description: 'Maximum number of reminders to return (default: 10)' }
      },
      required: ['userId']
    }
  },
  {
    name: 'maya_reminder_update',
    description: 'Update an existing reminder',
    inputSchema: {
      type: 'object',
      properties: {
        userId: { type: 'string', description: 'User ID' },
        reminderId: { type: 'string', description: 'Reminder ID to update' },
        updates: { 
          type: 'object', 
          description: 'Fields to update',
          properties: {
            title: { type: 'string' },
            remind_at: { type: 'string' },
            content: { type: 'string' },
            status: { type: 'string', enum: ['pending', 'sent', 'completed', 'cancelled'] },
            priority: { type: 'string', enum: ['low', 'medium', 'high', 'urgent'] }
          }
        }
      },
      required: ['userId', 'reminderId', 'updates']
    }
  },
  {
    name: 'maya_reminder_delete',
    description: 'Delete a reminder',
    inputSchema: {
      type: 'object',
      properties: {
        userId: { type: 'string', description: 'User ID' },
        reminderId: { type: 'string', description: 'Reminder ID to delete' }
      },
      required: ['userId', 'reminderId']
    }
  },
  {
    name: 'maya_reminder_create_linked',
    description: 'Create a reminder linked to a specific task, event, or message',
    inputSchema: {
      type: 'object',
      properties: {
        userId: { type: 'string', description: 'User ID' },
        title: { type: 'string', description: 'Reminder title/content' },
        reminderTime: { type: 'string', description: 'When to remind (ISO string)' },
        content: { type: 'string', description: 'Additional details (optional)' },
        linkType: { type: 'string', enum: ['task', 'event', 'message'], description: 'Type of item to link to' },
        linkId: { type: 'string', description: 'ID of the item to link to' },
        priority: { type: 'string', enum: ['low', 'medium', 'high', 'urgent'], description: 'Priority level' }
      },
      required: ['userId', 'title', 'reminderTime', 'linkType', 'linkId']
    }
  }
]; 