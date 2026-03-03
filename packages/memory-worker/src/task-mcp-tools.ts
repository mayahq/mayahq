import { createClient } from '@supabase/supabase-js';
import { MCPResult } from './mcp-bridge';
import { dbCreateTask, dbGetTasks, dbUpdateTask, dbDeleteTask, type Task } from './task-utils';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * Maya Task MCP Tools - Reliable, Simple, Smart
 * Replaces complex LangChain task tool calling with straightforward MCP tools
 */
export class TaskMCPTools {
  
  /**
   * Create a new task
   */
  static async createTask(args: any): Promise<MCPResult> {
    try {
      const { 
        userId, 
        description, 
        priority = 'medium', 
        dueDate,
        note,
        tags = [],
        status = 'open'
      } = args;
      
      if (!userId || !description) {
        throw new Error('Missing required fields: userId, description');
      }

      const taskData = {
        content: description,
        due_at: dueDate || null,
        priority: priority,
        note: note || null,
        tags: tags,
        status: status
      };

      const task = await dbCreateTask(userId, taskData);

      if (!task) {
        throw new Error('Failed to create task in database');
      }

      let response = `✅ Task created successfully!\n\n📋 **${task.content}**`;
      
      if (task.due_at) response += `\n📅 Due: ${new Date(task.due_at).toLocaleDateString()}`;
      if (task.priority && task.priority !== 'medium') response += `\n⭐ Priority: ${task.priority}`;
      if (task.note) response += `\n📝 Note: ${task.note}`;
      if (task.tags && task.tags.length > 0) response += `\n🏷️ Tags: ${task.tags.join(', ')}`;
      response += `\n🆔 Task ID: ${task.id}`;

      return {
        content: [{ type: 'text', text: response }],
        isError: false,
        _meta: { 
          source: 'maya-tasks', 
          action: 'create_task', 
          taskId: task.id,
          status: task.status
        }
      };
    } catch (error: any) {
      return {
        content: [{ type: 'text', text: `❌ Failed to create task: ${error.message}` }],
        isError: true
      };
    }
  }

  /**
   * Get tasks for a user with optional filtering
   */
  static async getTasks(args: any): Promise<MCPResult> {
    try {
      const { 
        userId, 
        status = 'open', 
        priority, 
        contentContains, 
        limit = 10 
      } = args;
      
      if (!userId) {
        throw new Error('Missing required field: userId');
      }

      const filters = {
        status: status === 'all' ? undefined : status,
        priority: priority,
        content: contentContains,
        limit: limit
      };

      const tasks = await dbGetTasks(userId, filters);

      if (!tasks || tasks.length === 0) {
        const statusText = status === 'all' ? '' : `${status} `;
        return {
          content: [{ type: 'text', text: `📋 No ${statusText}tasks found.` }],
          isError: false,
          _meta: { source: 'maya-tasks', action: 'get_tasks', count: 0 }
        };
      }

      const statusText = status === 'all' ? 'All' : status.charAt(0).toUpperCase() + status.slice(1);
      let response = `📋 **Your ${statusText} Tasks**:\n\n`;
      
      tasks.forEach((task, index) => {
        const statusIcon = task.status === 'open' ? '⏳' : 
                          task.status === 'completed' ? '✅' : 
                          task.status === 'in_progress' ? '🔄' : '📋';
        const priority = task.priority ? ` ⭐${task.priority}` : '';
        const dueDate = task.due_at ? ` 📅${new Date(task.due_at).toLocaleDateString()}` : '';
        
        response += `${index + 1}. ${statusIcon} **${task.content}**${priority}${dueDate}\n`;
        response += `   🆔 ID: ${task.id}`;
        if (task.note) response += ` | 📝 ${task.note}`;
        if (task.tags && task.tags.length > 0) response += ` | 🏷️ ${task.tags.join(', ')}`;
        response += `\n\n`;
      });

      return {
        content: [{ type: 'text', text: response.trim() }],
        isError: false,
        _meta: { source: 'maya-tasks', action: 'get_tasks', count: tasks.length }
      };
    } catch (error: any) {
      return {
        content: [{ type: 'text', text: `❌ Failed to get tasks: ${error.message}` }],
        isError: true
      };
    }
  }

  /**
   * Update an existing task
   */
  static async updateTask(args: any): Promise<MCPResult> {
    try {
      const { userId, taskIdentifier, updates } = args;
      
      if (!userId || !taskIdentifier || !updates) {
        throw new Error('Missing required fields: userId, taskIdentifier, updates');
      }

      console.log(`[TaskMCP] Searching for task with identifier: "${taskIdentifier}" for user: ${userId}`);

      // Find the task by identifier (could be ID or content search)
      let tasks: Task[] = [];
      
      // Try to find by ID first
      if (taskIdentifier.match(/^[0-9]+$/)) {
        console.log(`[TaskMCP] Searching by task ID: ${taskIdentifier}`);
        const allTasks = await dbGetTasks(userId, { limit: 100 });
        tasks = allTasks.filter(t => t.id?.toString() === taskIdentifier);
      } else {
        console.log(`[TaskMCP] Searching by task content: "${taskIdentifier}"`);
        // Get all tasks and do fuzzy matching
        const allTasks = await dbGetTasks(userId, { limit: 100 });
        
        // Try exact phrase match first
        tasks = allTasks.filter(t => 
          t.content.toLowerCase().includes(taskIdentifier.toLowerCase())
        );
        
        // If no exact matches, try word-based matching
        if (tasks.length === 0) {
          const searchWords = taskIdentifier.toLowerCase().split(' ').filter((word: string) => word.length > 2);
          tasks = allTasks.filter(t => {
            const taskContent = t.content.toLowerCase();
            const matchedWords = searchWords.filter((word: string) => taskContent.includes(word));
            return matchedWords.length >= Math.min(2, searchWords.length); // At least 2 words or all words if fewer than 2
          });
        }
        
        console.log(`[TaskMCP] Found ${tasks.length} potential matches`);
        if (tasks.length > 0) {
          console.log(`[TaskMCP] Matches:`, tasks.map(t => `ID: ${t.id}, Content: "${t.content}"`));
        }
      }

      if (tasks.length === 0) {
        return {
          content: [{ type: 'text', text: `❌ Could not find a task matching "${taskIdentifier}". Try using the task ID or more specific keywords.` }],
          isError: true
        };
      }

      if (tasks.length > 1) {
        let response = `🔍 Found multiple tasks matching "${taskIdentifier}". Please be more specific:\n\n`;
        tasks.slice(0, 5).forEach((task, index) => {
          response += `${index + 1}. **${task.content}** (ID: ${task.id})\n`;
        });
        if (tasks.length > 5) response += `... and ${tasks.length - 5} more`;
        return {
          content: [{ type: 'text', text: response }],
          isError: false,
          _meta: { source: 'maya-tasks', action: 'ambiguous_match', count: tasks.length }
        };
      }

      // Update the task
      const task = tasks[0];
      if (!task.id) {
        throw new Error('Task ID not found');
      }

      console.log(`[TaskMCP] Updating task ID: ${task.id} with updates:`, updates);
      const updatedTask = await dbUpdateTask(task.id, userId, updates);

      if (!updatedTask) {
        throw new Error('Failed to update task in database');
      }

      let response = `✅ Task updated successfully!\n\n📋 **${updatedTask.content}**`;
      
      if (updatedTask.due_at) response += `\n📅 Due: ${new Date(updatedTask.due_at).toLocaleDateString()}`;
      if (updatedTask.priority) response += `\n⭐ Priority: ${updatedTask.priority}`;
      if (updatedTask.status) response += `\n📊 Status: ${updatedTask.status}`;
      if (updatedTask.note) response += `\n📝 Note: ${updatedTask.note}`;
      response += `\n🆔 Task ID: ${updatedTask.id}`;

      return {
        content: [{ type: 'text', text: response }],
        isError: false,
        _meta: { 
          source: 'maya-tasks', 
          action: 'update_task', 
          taskId: updatedTask.id,
          updatedFields: Object.keys(updates)
        }
      };
    } catch (error: any) {
      console.error(`[TaskMCP] Error updating task:`, error);
      return {
        content: [{ type: 'text', text: `❌ Failed to update task: ${error.message}` }],
        isError: true
      };
    }
  }

  /**
   * Delete a task
   */
  static async deleteTask(args: any): Promise<MCPResult> {
    try {
      const { userId, taskIdentifier } = args;
      
      if (!userId || !taskIdentifier) {
        throw new Error('Missing required fields: userId, taskIdentifier');
      }

      console.log(`[TaskMCP] Searching for task to delete with identifier: "${taskIdentifier}" for user: ${userId}`);

      // Find the task by identifier (could be ID or content search)
      let tasks: Task[] = [];
      
      // Try to find by ID first
      if (taskIdentifier.match(/^[0-9]+$/)) {
        console.log(`[TaskMCP] Searching by task ID: ${taskIdentifier}`);
        const allTasks = await dbGetTasks(userId, { limit: 100 });
        tasks = allTasks.filter(t => t.id?.toString() === taskIdentifier);
      } else {
        console.log(`[TaskMCP] Searching by task content: "${taskIdentifier}"`);
        // Get all tasks and do fuzzy matching
        const allTasks = await dbGetTasks(userId, { limit: 100 });
        
        // Try exact phrase match first
        tasks = allTasks.filter(t => 
          t.content.toLowerCase().includes(taskIdentifier.toLowerCase())
        );
        
        // If no exact matches, try word-based matching
        if (tasks.length === 0) {
          const searchWords = taskIdentifier.toLowerCase().split(' ').filter((word: string) => word.length > 2);
          tasks = allTasks.filter(t => {
            const taskContent = t.content.toLowerCase();
            const matchedWords = searchWords.filter((word: string) => taskContent.includes(word));
            return matchedWords.length >= Math.min(2, searchWords.length);
          });
        }
        
        console.log(`[TaskMCP] Found ${tasks.length} potential matches for deletion`);
        if (tasks.length > 0) {
          console.log(`[TaskMCP] Matches:`, tasks.map(t => `ID: ${t.id}, Content: "${t.content}"`));
        }
      }

      if (tasks.length === 0) {
        return {
          content: [{ type: 'text', text: `❌ Could not find a task matching "${taskIdentifier}" to delete. Try using the task ID or more specific keywords.` }],
          isError: true
        };
      }

      if (tasks.length > 1) {
        let response = `🔍 Found multiple tasks matching "${taskIdentifier}". Please be more specific about which one to delete:\n\n`;
        tasks.slice(0, 5).forEach((task, index) => {
          response += `${index + 1}. **${task.content}** (ID: ${task.id})\n`;
        });
        if (tasks.length > 5) response += `... and ${tasks.length - 5} more`;
        return {
          content: [{ type: 'text', text: response }],
          isError: false,
          _meta: { source: 'maya-tasks', action: 'ambiguous_match', count: tasks.length }
        };
      }

      const task = tasks[0];
      if (!task.id) {
        throw new Error('Task ID not found');
      }

      // Store task info before deletion
      const taskContent = task.content;
      const taskId = task.id;

      console.log(`[TaskMCP] Deleting task ID: ${taskId} with content: "${taskContent}"`);
      const success = await dbDeleteTask(task.id, userId);

      if (!success) {
        throw new Error('Failed to delete task from database');
      }

      return {
        content: [{
          type: 'text',
          text: `✅ Task deleted successfully!\n\n🗑️ Removed: **${taskContent}**\n🆔 Task ID: ${taskId}`
        }],
        isError: false,
        _meta: { source: 'maya-tasks', action: 'delete_task', taskId: taskId }
      };
    } catch (error: any) {
      console.error(`[TaskMCP] Error deleting task:`, error);
      return {
        content: [{ type: 'text', text: `❌ Failed to delete task: ${error.message}` }],
        isError: true
      };
    }
  }

  /**
   * Mark a task as completed
   */
  static async completeTask(args: any): Promise<MCPResult> {
    try {
      const { userId, taskIdentifier } = args;
      
      if (!userId || !taskIdentifier) {
        throw new Error('Missing required fields: userId, taskIdentifier');
      }

      // Use the update functionality to mark as completed
      const result = await TaskMCPTools.updateTask({
        userId,
        taskIdentifier,
        updates: { status: 'completed' }
      });

      // Enhance the response for completion
      if (!result.isError && result.content[0]?.text) {
        const enhancedText = result.content[0].text.replace(
          'Task updated successfully!',
          'Task completed! 🎉'
        );
        result.content[0].text = enhancedText;
        result._meta = { 
          ...result._meta, 
          action: 'complete_task',
          completed: true
        };
      }

      return result;
    } catch (error: any) {
      return {
        content: [{ type: 'text', text: `❌ Failed to complete task: ${error.message}` }],
        isError: true
      };
    }
  }
}

/**
 * Available Maya Task MCP Tools
 */
export const MAYA_TASK_TOOLS = [
  {
    name: 'maya_task_create',
    description: 'Create a new task with optional due date, priority, and notes',
    inputSchema: {
      type: 'object',
      properties: {
        userId: { type: 'string', description: 'User ID' },
        description: { type: 'string', description: 'Task description/content' },
        priority: { type: 'string', enum: ['low', 'medium', 'high', 'urgent'], description: 'Task priority (default: medium)' },
        dueDate: { type: 'string', description: 'Due date (ISO string, optional)' },
        note: { type: 'string', description: 'Additional notes (optional)' },
        tags: { type: 'array', items: { type: 'string' }, description: 'Tags for categorization (optional)' },
        status: { type: 'string', enum: ['open', 'in_progress', 'completed'], description: 'Initial status (default: open)' }
      },
      required: ['userId', 'description']
    }
  },
  {
    name: 'maya_task_list',
    description: 'Get tasks for a user with optional filtering',
    inputSchema: {
      type: 'object',
      properties: {
        userId: { type: 'string', description: 'User ID' },
        status: { type: 'string', enum: ['open', 'in_progress', 'completed', 'all'], description: 'Filter by status (default: open)' },
        priority: { type: 'string', enum: ['low', 'medium', 'high', 'urgent'], description: 'Filter by priority (optional)' },
        contentContains: { type: 'string', description: 'Search tasks containing this text (optional)' },
        limit: { type: 'number', description: 'Maximum number of tasks to return (default: 10)' }
      },
      required: ['userId']
    }
  },
  {
    name: 'maya_task_update',
    description: 'Update an existing task',
    inputSchema: {
      type: 'object',
      properties: {
        userId: { type: 'string', description: 'User ID' },
        taskIdentifier: { type: 'string', description: 'Task ID or keywords to identify the task' },
        updates: { 
          type: 'object', 
          description: 'Fields to update',
          properties: {
            content: { type: 'string', description: 'New task description' },
            status: { type: 'string', enum: ['open', 'in_progress', 'completed'], description: 'New status' },
            priority: { type: 'string', enum: ['low', 'medium', 'high', 'urgent'], description: 'New priority' },
            due_at: { type: 'string', description: 'New due date (ISO string)' },
            note: { type: 'string', description: 'New note' },
            tags: { type: 'array', items: { type: 'string' }, description: 'New tags' }
          }
        }
      },
      required: ['userId', 'taskIdentifier', 'updates']
    }
  },
  {
    name: 'maya_task_delete',
    description: 'Delete a task',
    inputSchema: {
      type: 'object',
      properties: {
        userId: { type: 'string', description: 'User ID' },
        taskIdentifier: { type: 'string', description: 'Task ID or keywords to identify the task to delete' }
      },
      required: ['userId', 'taskIdentifier']
    }
  },
  {
    name: 'maya_task_complete',
    description: 'Mark a task as completed',
    inputSchema: {
      type: 'object',
      properties: {
        userId: { type: 'string', description: 'User ID' },
        taskIdentifier: { type: 'string', description: 'Task ID or keywords to identify the task to complete' }
      },
      required: ['userId', 'taskIdentifier']
    }
  }
]; 