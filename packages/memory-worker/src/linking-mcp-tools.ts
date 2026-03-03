import { createClient } from '@supabase/supabase-js';
import { MCPResult } from './mcp-bridge';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export interface EntityLink {
  id?: string;
  source_entity_type: 'message' | 'task' | 'reminder' | 'calendar_event';
  source_entity_id: string;
  target_entity_type: 'message' | 'task' | 'reminder' | 'calendar_event';
  target_entity_id: string;
  link_type: 'creates' | 'spawns' | 'references' | 'blocks_for' | 'reminds_about' | 'follows_up' | 'depends_on' | 'similar_to' | 'part_of' | 'context_for';
  context?: string;
  metadata?: any;
  created_at?: string;
  created_by?: string;
}

/**
 * Maya Linking MCP Tools - Cross-Entity Relationship Management
 * Enables powerful linking between messages, tasks, reminders, and calendar events
 */
export class LinkingMCPTools {
  
  /**
   * Create a link between two entities
   */
  static async createLink(args: any): Promise<MCPResult> {
    try {
      // Handle natural language linking (e.g., "link all these items")
      if (args.naturalLanguage && args.requestType === 'link_recent_productivity_items') {
        return await LinkingMCPTools.linkRecentProductivityItems(args);
      }
      
      const { 
        userId,
        sourceType, 
        sourceId, 
        targetType, 
        targetId, 
        linkType, 
        context,
        metadata = {}
      } = args;
      
      if (!userId || !sourceType || !sourceId || !targetType || !targetId || !linkType) {
        throw new Error('Missing required fields: userId, sourceType, sourceId, targetType, targetId, linkType');
      }

      // Use the database function to create the link
      const { data, error } = await supabase.rpc('create_entity_link', {
        source_type: sourceType,
        source_id: sourceId,
        target_type: targetType,
        target_id: targetId,
        link_type: linkType,
        context_text: context || null,
        metadata_json: metadata,
        creator_id: userId
      });

      if (error) throw error;

      if (!data) {
        return {
          content: [{ type: 'text', text: `🔗 Link already exists between ${sourceType}:${sourceId} and ${targetType}:${targetId}` }],
          isError: false,
          _meta: { source: 'maya-linking', action: 'create_link', exists: true }
        };
      }

      let response = `✅ Link created successfully!\n\n🔗 **${sourceType}** → **${targetType}**\n🏷️ Relationship: ${linkType}`;
      if (context) response += `\n📝 Context: ${context}`;

      return {
        content: [{ type: 'text', text: response }],
        isError: false,
        _meta: { 
          source: 'maya-linking', 
          action: 'create_link', 
          linkId: data,
          sourceType,
          sourceId,
          targetType,
          targetId,
          linkType
        }
      };
    } catch (error: any) {
      return {
        content: [{ type: 'text', text: `❌ Failed to create link: ${error.message}` }],
        isError: true
      };
    }
  }

  /**
   * Link recently created productivity items (calendar events, tasks, reminders)
   */
  static async linkRecentProductivityItems(args: any): Promise<MCPResult> {
    try {
      const { userId } = args;
      
      if (!userId) {
        throw new Error('Missing required field: userId');
      }

      // Find recent items (within last hour)
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      
      // Get recent calendar events
      const { data: recentEvents } = await supabase
        .from('calendar_events')
        .select('id, title, start_time, created_at')
        .eq('created_by', userId)
        .gte('created_at', oneHourAgo)
        .order('created_at', { ascending: false })
        .limit(3);

      // Get recent tasks
      const { data: recentTasks } = await supabase
        .from('tasks')
        .select('id, content, created_at')
        .eq('user_id', userId)
        .gte('created_at', oneHourAgo)
        .order('created_at', { ascending: false })
        .limit(3);

      // Get recent reminders
      const { data: recentReminders } = await supabase
        .from('reminders')
        .select('id, title, created_at')
        .eq('user_id', userId)
        .gte('created_at', oneHourAgo)
        .order('created_at', { ascending: false })
        .limit(3);

      const allItems = [
        ...(recentEvents || []).map(item => ({ type: 'calendar_event', ...item })),
        ...(recentTasks || []).map(item => ({ type: 'task', ...item })),
        ...(recentReminders || []).map(item => ({ type: 'reminder', ...item }))
      ];

      if (allItems.length < 2) {
        return {
          content: [{ type: 'text', text: `🔍 I found ${allItems.length} recent items, but need at least 2 to create links. Try creating some calendar events, tasks, or reminders first!` }],
          isError: false,
          _meta: { source: 'maya-linking', action: 'link_recent_items', itemCount: allItems.length }
        };
      }

      // Sort by creation time (most recent first)
      allItems.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      let linksCreated = 0;
      let response = `🔗 **Linking Recent Items Together**\n\nFound ${allItems.length} recent items:\n`;
      
      // List the items first
      allItems.forEach((item, index) => {
        const icon = item.type === 'calendar_event' ? '📅' : item.type === 'task' ? '📋' : '⏰';
        const name = (item as any).title || (item as any).content || 'Untitled';
        response += `${index + 1}. ${icon} ${name}\n`;
      });

      response += '\n**Creating Links:**\n';

      // Create links between related items
      for (let i = 0; i < allItems.length; i++) {
        for (let j = i + 1; j < allItems.length; j++) {
          const sourceItem = allItems[i];
          const targetItem = allItems[j];
          
          // Determine appropriate link type based on item types
          let linkType = 'references'; // default
          if (sourceItem.type === 'calendar_event' && targetItem.type === 'reminder') {
            linkType = 'reminds_about';
          } else if (sourceItem.type === 'task' && targetItem.type === 'calendar_event') {
            linkType = 'blocks_for';
          } else if (sourceItem.type === 'reminder' && targetItem.type === 'task') {
            linkType = 'reminds_about';
          } else if (sourceItem.type === 'calendar_event' && targetItem.type === 'task') {
            linkType = 'relates_to';
          }

          try {
            const linkResult = await supabase.rpc('create_entity_link', {
              source_type: sourceItem.type,
              source_id: sourceItem.id.toString(),
              target_type: targetItem.type,
              target_id: targetItem.id.toString(),
              link_type: linkType,
              context_text: 'Linked via natural language request',
              metadata_json: { linkMethod: 'natural_language_bulk' },
              creator_id: userId
            });

            if (!linkResult.error && linkResult.data) {
              linksCreated++;
              const sourceIcon = sourceItem.type === 'calendar_event' ? '📅' : sourceItem.type === 'task' ? '📋' : '⏰';
              const targetIcon = targetItem.type === 'calendar_event' ? '📅' : targetItem.type === 'task' ? '📋' : '⏰';
              const sourceName = (sourceItem as any).title || (sourceItem as any).content || 'Untitled';
              const targetName = (targetItem as any).title || (targetItem as any).content || 'Untitled';
              response += `✅ ${sourceIcon} ${sourceName} → ${targetIcon} ${targetName} (${linkType})\n`;
            }
          } catch (linkError) {
            // Continue with other links even if one fails
            console.error('Error creating link:', linkError);
          }
        }
      }

      if (linksCreated === 0) {
        response += '⚠️ No new links created (may already exist)';
      } else {
        response += `\n🎉 Created ${linksCreated} links between your recent items!`;
      }

      return {
        content: [{ type: 'text', text: response }],
        isError: false,
        _meta: { 
          source: 'maya-linking', 
          action: 'link_recent_items', 
          itemCount: allItems.length,
          linksCreated 
        }
      };
    } catch (error: any) {
      return {
        content: [{ type: 'text', text: `❌ Failed to link recent items: ${error.message}` }],
        isError: true
      };
    }
  }

  /**
   * Get all links for a specific entity
   */
  static async getEntityLinks(args: any): Promise<MCPResult> {
    try {
      const { entityType, entityId, relatedType, direction = 'both' } = args;
      
      if (!entityType || !entityId) {
        throw new Error('Missing required fields: entityType, entityId');
      }

      const { data, error } = await supabase.rpc('get_entity_links', {
        entity_type: entityType,
        entity_id: entityId
      });

      if (error) throw error;

      if (!data || data.length === 0) {
        return {
          content: [{ type: 'text', text: `🔍 No links found for ${entityType}:${entityId}` }],
          isError: false,
          _meta: { source: 'maya-linking', action: 'get_links', count: 0 }
        };
      }

      // Filter by direction and related type if specified
      let filteredData = data;
      if (direction !== 'both') {
        filteredData = data.filter((link: any) => link.direction === direction);
      }
      if (relatedType) {
        filteredData = filteredData.filter((link: any) => link.related_entity_type === relatedType);
      }

      let response = `🔗 **Links for ${entityType}:${entityId}**\n\n`;
      
      if (filteredData.length === 0) {
        response += `No ${direction !== 'both' ? direction + ' ' : ''}links found`;
        if (relatedType) response += ` to ${relatedType} entities`;
        return {
          content: [{ type: 'text', text: response }],
          isError: false,
          _meta: { source: 'maya-linking', action: 'get_links', count: 0 }
        };
      }

      filteredData.forEach((link: any, index: number) => {
        const arrow = link.direction === 'outgoing' ? '→' : '←';
        response += `${index + 1}. ${arrow} **${link.related_entity_type}:${link.related_entity_id}**\n`;
        response += `   🏷️ ${link.relationship}\n`;
        if (link.context) response += `   📝 ${link.context}\n`;
        response += `   📅 ${new Date(link.created_at).toLocaleDateString()}\n\n`;
      });

      return {
        content: [{ type: 'text', text: response.trim() }],
        isError: false,
        _meta: { source: 'maya-linking', action: 'get_links', count: filteredData.length }
      };
    } catch (error: any) {
      return {
        content: [{ type: 'text', text: `❌ Failed to get entity links: ${error.message}` }],
        isError: true
      };
    }
  }

  /**
   * Find related entities with enriched data
   */
  static async findRelatedEntities(args: any): Promise<MCPResult> {
    try {
      const { entityType, entityId, relatedType, linkTypes, limit = 10 } = args;
      
      if (!entityType || !entityId) {
        throw new Error('Missing required fields: entityType, entityId');
      }

      const { data, error } = await supabase.rpc('find_related_entities', {
        entity_type: entityType,
        entity_id: entityId,
        related_type: relatedType || null,
        link_types: linkTypes || null
      });

      if (error) throw error;

      if (!data || data.length === 0) {
        let message = `🔍 No related entities found for ${entityType}:${entityId}`;
        if (relatedType) message += ` of type ${relatedType}`;
        return {
          content: [{ type: 'text', text: message }],
          isError: false,
          _meta: { source: 'maya-linking', action: 'find_related', count: 0 }
        };
      }

      let response = `🔍 **Related entities for ${entityType}:${entityId}**\n\n`;
      
      const limitedData = data.slice(0, limit);
      limitedData.forEach((item: any, index: number) => {
        const entityData = item.entity_data;
        const arrow = item.direction === 'outgoing' ? '→' : '←';
        
        response += `${index + 1}. ${arrow} **${item.related_entity_type}** (${item.relationship})\n`;
        
        if (entityData) {
          if (item.related_entity_type === 'message') {
            response += `   💬 "${entityData.content?.substring(0, 100)}${entityData.content?.length > 100 ? '...' : ''}"\n`;
          } else if (item.related_entity_type === 'task') {
            response += `   📋 ${entityData.content} (${entityData.status})\n`;
          } else if (item.related_entity_type === 'reminder') {
            response += `   ⏰ ${entityData.title} - ${new Date(entityData.remind_at).toLocaleString()}\n`;
          } else if (item.related_entity_type === 'calendar_event') {
            response += `   📅 ${entityData.title} - ${new Date(entityData.start_time).toLocaleString()}\n`;
          }
        }
        
        if (item.context) response += `   📝 ${item.context}\n`;
        response += `\n`;
      });

      if (data.length > limit) {
        response += `... and ${data.length - limit} more\n`;
      }

      return {
        content: [{ type: 'text', text: response.trim() }],
        isError: false,
        _meta: { source: 'maya-linking', action: 'find_related', count: data.length, shown: limitedData.length }
      };
    } catch (error: any) {
      return {
        content: [{ type: 'text', text: `❌ Failed to find related entities: ${error.message}` }],
        isError: true
      };
    }
  }

  /**
   * Create a task with automatic linking to a message
   */
  static async createLinkedTask(args: any): Promise<MCPResult> {
    try {
      const { 
        userId, 
        description, 
        priority = 'medium', 
        dueDate,
        note,
        tags = [],
        sourceMessageId,
        sourceType = 'message',
        linkType = 'creates',
        linkContext
      } = args;
      
      if (!userId || !description) {
        throw new Error('Missing required fields: userId, description');
      }

      // First create the task
      const { data: task, error: taskError } = await supabase
        .from('tasks')
        .insert([{
          user_id: userId,
          content: description,
          due_at: dueDate || null,
          priority: priority,
          note: note || null,
          tags: tags,
          status: 'open'
        }])
        .select()
        .single();

      if (taskError) throw taskError;

      let response = `✅ Task created successfully!\n\n📋 **${task.content}**`;
      if (task.due_at) response += `\n📅 Due: ${new Date(task.due_at).toLocaleDateString()}`;
      if (task.priority && task.priority !== 'medium') response += `\n⭐ Priority: ${task.priority}`;
      if (task.note) response += `\n📝 Note: ${task.note}`;
      response += `\n🆔 Task ID: ${task.id}`;

      // Create link if source entity is provided
      if (sourceMessageId && sourceType) {
        const linkResult = await LinkingMCPTools.createLink({
          userId,
          sourceType: sourceType,
          sourceId: sourceMessageId,
          targetType: 'task',
          targetId: task.id.toString(),
          linkType: linkType,
          context: linkContext || `Task created from ${sourceType}`
        });
        
        if (!linkResult.isError) {
          response += `\n\n🔗 Linked to ${sourceType}:${sourceMessageId}`;
        }
      }

      return {
        content: [{ type: 'text', text: response }],
        isError: false,
        _meta: { 
          source: 'maya-linking', 
          action: 'create_linked_task', 
          taskId: task.id,
          linked: !!sourceMessageId
        }
      };
    } catch (error: any) {
      return {
        content: [{ type: 'text', text: `❌ Failed to create linked task: ${error.message}` }],
        isError: true
      };
    }
  }

  /**
   * Create a calendar event with automatic linking
   */
  static async createLinkedCalendarEvent(args: any): Promise<MCPResult> {
    try {
      const { 
        userId, 
        title, 
        startTime, 
        endTime, 
        description, 
        location,
        mood = 'work',
        priority = 3,
        energyLevel = 'medium',
        allDay = false,
        sourceEntityId,
        sourceType,
        linkType = 'creates',
        linkContext
      } = args;
      
      if (!userId || !title || !startTime || !endTime) {
        throw new Error('Missing required fields: userId, title, startTime, endTime');
      }

      // First create the calendar event
      const { data: event, error: eventError } = await supabase
        .from('calendar_events')
        .insert([{
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
          ai_source_system: 'maya-mcp-linking'
        }])
        .select()
        .single();

      if (eventError) throw eventError;

      let response = `✅ Calendar event created successfully!\n\n📅 **${event.title}**\n🕐 ${new Date(event.start_time).toLocaleString()} - ${new Date(event.end_time).toLocaleString()}`;
      if (event.description) response += `\n📝 ${event.description}`;
      if (event.location) response += `\n📍 ${event.location}`;
      response += `\n🎭 Mood: ${event.mood}\n⭐ Priority: ${event.priority}/5\n🔋 Energy: ${event.energy_level}`;

      // Create link if source entity is provided
      if (sourceEntityId && sourceType) {
        const linkResult = await LinkingMCPTools.createLink({
          userId,
          sourceType: sourceType,
          sourceId: sourceEntityId,
          targetType: 'calendar_event',
          targetId: event.id,
          linkType: linkType,
          context: linkContext || `Calendar event created from ${sourceType}`
        });
        
        if (!linkResult.isError) {
          response += `\n\n🔗 Linked to ${sourceType}:${sourceEntityId}`;
        }
      }

      return {
        content: [{ type: 'text', text: response }],
        isError: false,
        _meta: { 
          source: 'maya-linking', 
          action: 'create_linked_calendar_event', 
          eventId: event.id,
          linked: !!sourceEntityId
        }
      };
    } catch (error: any) {
      return {
        content: [{ type: 'text', text: `❌ Failed to create linked calendar event: ${error.message}` }],
        isError: true
      };
    }
  }

  /**
   * Block calendar time for a task (create calendar event linked to task)
   */
  static async blockTimeForTask(args: any): Promise<MCPResult> {
    try {
      const { 
        userId, 
        taskId, 
        startTime, 
        duration = 60, // minutes
        title,
        location,
        energyLevel = 'medium'
      } = args;
      
      if (!userId || !taskId || !startTime) {
        throw new Error('Missing required fields: userId, taskId, startTime');
      }

      // Calculate end time
      const start = new Date(startTime);
      const end = new Date(start.getTime() + (duration * 60 * 1000));

      // Get task details
      const { data: task, error: taskError } = await supabase
        .from('tasks')
        .select('*')
        .eq('id', taskId)
        .eq('user_id', userId)
        .single();

      if (taskError) throw taskError;
      if (!task) throw new Error('Task not found');

      const eventTitle = title || `Work on: ${task.content}`;
      
      // Create linked calendar event
      return await LinkingMCPTools.createLinkedCalendarEvent({
        userId,
        title: eventTitle,
        startTime: start.toISOString(),
        endTime: end.toISOString(),
        description: `Time blocked for task: ${task.content}`,
        location,
        mood: 'work',
        priority: task.priority === 'high' ? 5 : task.priority === 'urgent' ? 5 : task.priority === 'low' ? 2 : 3,
        energyLevel,
        sourceEntityId: taskId,
        sourceType: 'task',
        linkType: 'blocks_for',
        linkContext: `Calendar time blocked for task completion`
      });
    } catch (error: any) {
      return {
        content: [{ type: 'text', text: `❌ Failed to block time for task: ${error.message}` }],
        isError: true
      };
    }
  }

  /**
   * Delete a link between entities
   */
  static async deleteLink(args: any): Promise<MCPResult> {
    try {
      const { userId, linkId } = args;
      
      if (!userId || !linkId) {
        throw new Error('Missing required fields: userId, linkId');
      }

      // Get link details before deletion
      const { data: linkData } = await supabase
        .from('entity_links')
        .select('*')
        .eq('id', linkId)
        .eq('created_by', userId)
        .single();

      const { error } = await supabase
        .from('entity_links')
        .delete()
        .eq('id', linkId)
        .eq('created_by', userId);

      if (error) throw error;

      const sourceInfo = linkData ? `${linkData.source_entity_type}:${linkData.source_entity_id}` : 'Unknown';
      const targetInfo = linkData ? `${linkData.target_entity_type}:${linkData.target_entity_id}` : 'Unknown';
      const linkType = linkData ? linkData.link_type : 'Unknown';

      return {
        content: [{
          type: 'text',
          text: `✅ Link deleted successfully!\n\n🗑️ Removed: ${sourceInfo} → ${targetInfo}\n🏷️ Relationship: ${linkType}`
        }],
        isError: false,
        _meta: { source: 'maya-linking', action: 'delete_link', linkId }
      };
    } catch (error: any) {
      return {
        content: [{ type: 'text', text: `❌ Failed to delete link: ${error.message}` }],
        isError: true
      };
    }
  }
}

/**
 * Available Maya Linking MCP Tools
 */
export const MAYA_LINKING_TOOLS = [
  {
    name: 'maya_link_create',
    description: 'Create a link between two entities (message, task, reminder, calendar_event)',
    inputSchema: {
      type: 'object',
      properties: {
        userId: { type: 'string', description: 'User ID' },
        sourceType: { type: 'string', enum: ['message', 'task', 'reminder', 'calendar_event'], description: 'Source entity type' },
        sourceId: { type: 'string', description: 'Source entity ID' },
        targetType: { type: 'string', enum: ['message', 'task', 'reminder', 'calendar_event'], description: 'Target entity type' },
        targetId: { type: 'string', description: 'Target entity ID' },
        linkType: { 
          type: 'string', 
          enum: ['creates', 'spawns', 'references', 'blocks_for', 'reminds_about', 'follows_up', 'depends_on', 'similar_to', 'part_of', 'context_for'],
          description: 'Type of relationship' 
        },
        context: { type: 'string', description: 'Optional context about the relationship' },
        metadata: { type: 'object', description: 'Additional metadata (optional)' }
      },
      required: ['userId', 'sourceType', 'sourceId', 'targetType', 'targetId', 'linkType']
    }
  },
  {
    name: 'maya_link_get',
    description: 'Get all links for a specific entity',
    inputSchema: {
      type: 'object',
      properties: {
        entityType: { type: 'string', enum: ['message', 'task', 'reminder', 'calendar_event'], description: 'Entity type' },
        entityId: { type: 'string', description: 'Entity ID' },
        relatedType: { type: 'string', enum: ['message', 'task', 'reminder', 'calendar_event'], description: 'Filter by related entity type (optional)' },
        direction: { type: 'string', enum: ['outgoing', 'incoming', 'both'], description: 'Link direction (default: both)' }
      },
      required: ['entityType', 'entityId']
    }
  },
  {
    name: 'maya_link_find_related',
    description: 'Find related entities with enriched data',
    inputSchema: {
      type: 'object',
      properties: {
        entityType: { type: 'string', enum: ['message', 'task', 'reminder', 'calendar_event'], description: 'Entity type' },
        entityId: { type: 'string', description: 'Entity ID' },
        relatedType: { type: 'string', enum: ['message', 'task', 'reminder', 'calendar_event'], description: 'Filter by related entity type (optional)' },
        linkTypes: { 
          type: 'array', 
          items: { 
            type: 'string', 
            enum: ['creates', 'spawns', 'references', 'blocks_for', 'reminds_about', 'follows_up', 'depends_on', 'similar_to', 'part_of', 'context_for']
          },
          description: 'Filter by link types (optional)' 
        },
        limit: { type: 'number', description: 'Maximum results to return (default: 10)' }
      },
      required: ['entityType', 'entityId']
    }
  },
  {
    name: 'maya_link_create_task',
    description: 'Create a task with automatic linking to another entity',
    inputSchema: {
      type: 'object',
      properties: {
        userId: { type: 'string', description: 'User ID' },
        description: { type: 'string', description: 'Task description' },
        priority: { type: 'string', enum: ['low', 'medium', 'high', 'urgent'], description: 'Task priority' },
        dueDate: { type: 'string', description: 'Due date (ISO string, optional)' },
        note: { type: 'string', description: 'Additional notes (optional)' },
        tags: { type: 'array', items: { type: 'string' }, description: 'Tags (optional)' },
        sourceMessageId: { type: 'string', description: 'ID of source message/entity to link to' },
        sourceType: { type: 'string', enum: ['message', 'task', 'reminder', 'calendar_event'], description: 'Type of source entity (default: message)' },
        linkType: { 
          type: 'string', 
          enum: ['creates', 'spawns', 'references', 'blocks_for', 'reminds_about', 'follows_up', 'depends_on', 'similar_to', 'part_of', 'context_for'],
          description: 'Type of relationship (default: creates)' 
        },
        linkContext: { type: 'string', description: 'Context for the link (optional)' }
      },
      required: ['userId', 'description']
    }
  },
  {
    name: 'maya_link_create_calendar_event',
    description: 'Create a calendar event with automatic linking to another entity',
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
        allDay: { type: 'boolean', description: 'All day event' },
        sourceEntityId: { type: 'string', description: 'ID of source entity to link to' },
        sourceType: { type: 'string', enum: ['message', 'task', 'reminder', 'calendar_event'], description: 'Type of source entity' },
        linkType: { 
          type: 'string', 
          enum: ['creates', 'spawns', 'references', 'blocks_for', 'reminds_about', 'follows_up', 'depends_on', 'similar_to', 'part_of', 'context_for'],
          description: 'Type of relationship (default: creates)' 
        },
        linkContext: { type: 'string', description: 'Context for the link (optional)' }
      },
      required: ['userId', 'title', 'startTime', 'endTime']
    }
  },
  {
    name: 'maya_link_block_time',
    description: 'Block calendar time for a specific task',
    inputSchema: {
      type: 'object',
      properties: {
        userId: { type: 'string', description: 'User ID' },
        taskId: { type: 'string', description: 'Task ID to block time for' },
        startTime: { type: 'string', description: 'Start time (ISO string)' },
        duration: { type: 'number', description: 'Duration in minutes (default: 60)' },
        title: { type: 'string', description: 'Custom event title (optional)' },
        location: { type: 'string', description: 'Location (optional)' },
        energyLevel: { type: 'string', enum: ['low', 'medium', 'high'], description: 'Required energy level' }
      },
      required: ['userId', 'taskId', 'startTime']
    }
  },
  {
    name: 'maya_link_delete',
    description: 'Delete a link between entities',
    inputSchema: {
      type: 'object',
      properties: {
        userId: { type: 'string', description: 'User ID' },
        linkId: { type: 'string', description: 'Link ID to delete' }
      },
      required: ['userId', 'linkId']
    }
  }
]; 