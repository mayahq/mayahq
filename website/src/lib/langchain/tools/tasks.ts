import { Tool } from "@langchain/core/tools";
import { z } from "zod";
import { 
  listTasks, 
  updateTask, 
  extractTasksFromMessage,
  formatTasksForDisplay,
  findTasksNeedingReminders,
  markTaskReminded,
  TaskStatus,
  TaskPriority
} from "@/lib/db/tasks";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

/**
 * Tool for finding tasks by fuzzy matching their content
 */
export class FindTaskTool extends Tool {
  name = "find_task";
  description = "Find tasks that match a description using fuzzy text search. Input should be a JSON string with userId and query (the text to search for in task descriptions).";

  async _call(input: string): Promise<string> {
    try {
      let params: { userId: string; query: string } = { userId: "", query: "" };
      
      try {
        params = JSON.parse(input);
      } catch (e) {
        return "Input must be a valid JSON string with userId and query.";
      }
      
      if (!params.userId || !params.query) {
        return "userId and query are required";
      }
      
      // Create Supabase client for direct RPC function call
      const supabase = createClient(supabaseUrl, supabaseKey);
      
      // Call the find_tasks_fuzzy RPC function
      const { data, error } = await supabase
        .rpc('find_tasks_fuzzy', {
          p_user_id: params.userId,
          p_query: params.query
        });
      
      if (error) {
        console.error('Error finding tasks:', error);
        return `Error finding tasks: ${error.message}`;
      }
      
      if (!data || data.length === 0) {
        return "No matching tasks found.";
      }
      
      // Format the results with similarity scores
      const formattedResults = data.map((task: {
        id: number;
        content: string;
        status: string;
        rank: number;
      }) => {
        const similarity = Math.round(task.rank * 100);
        return `Task #${task.id}: ${task.content} (${similarity}% match) [${task.status}]`;
      }).join('\n');
      
      return formattedResults;
    } catch (error) {
      return `Error finding tasks: ${error}`;
    }
  }
}

/**
 * Tool for finding the most recent task for a user
 */
export class GetRecentTaskTool extends Tool {
  name = "get_recent_task";
  description = "Get the most recently created task for a user. Input should be a JSON string with userId.";

  async _call(input: string): Promise<string> {
    try {
      let params: { userId: string } = { userId: "" };
      
      try {
        params = JSON.parse(input);
      } catch (e) {
        return "Input must be a valid JSON string with userId.";
      }
      
      if (!params.userId) {
        return "userId is required";
      }
      
      // Create Supabase client for direct RPC function call
      const supabase = createClient(supabaseUrl, supabaseKey);
      
      // Call the get_most_recent_task RPC function
      const { data, error } = await supabase
        .rpc('get_most_recent_task', {
          p_user_id: params.userId
        });
      
      if (error) {
        console.error('Error getting recent task:', error);
        return `Error getting recent task: ${error.message}`;
      }
      
      if (!data || data.length === 0) {
        return "No recent tasks found.";
      }
      
      const task = data[0];
      return `Most recent task: #${task.id}: ${task.content} [${task.status}]`;
    } catch (error) {
      return `Error getting recent task: ${error}`;
    }
  }
}

/**
 * Tool for fetching user tasks from the database
 */
export class GetTasksTool extends Tool {
  name = "get_tasks";
  description = "Fetch all tasks or filter by status (open/done/canceled) or tag for a user. Input should be a JSON string with userId, optional status (default: open), and optional tag.";

  async _call(input: string): Promise<string> {
    try {
      let params: { userId: string; status?: string; tag?: string } = { userId: "" };
      
      try {
        params = JSON.parse(input);
      } catch (e) {
        return "Input must be a valid JSON string with userId.";
      }
      
      if (!params.userId) {
        return "userId is required";
      }
      
      const status = (params.status || "open") as TaskStatus | "all";
      const tag = params.tag;
      
      const tasks = await listTasks(params.userId, status, tag);
      const formattedTasks = formatTasksForDisplay(tasks);
      return formattedTasks;
    } catch (error) {
      return `Error fetching tasks: ${error}`;
    }
  }
}

/**
 * Tool for creating a new task from a message
 */
export class CreateTaskTool extends Tool {
  name = "create_task";
  description = "Create a new task from a message. Input should be a JSON string with message, userId, and optional tags array.";

  async _call(input: string): Promise<string> {
    try {
      let params: { message: string; userId: string; tags?: string[] } = { message: "", userId: "" };
      
      try {
        params = JSON.parse(input);
      } catch (e) {
        return "Input must be a valid JSON string with message and userId.";
      }
      
      if (!params.message || !params.userId) {
        return "message and userId are required";
      }
      
      const taskId = await extractTasksFromMessage(params.message, params.userId, params.tags || []);
      
      if (taskId) {
        return `✅ Task created successfully! ID: ${taskId}`;
      } else {
        return "❌ Failed to create the task.";
      }
    } catch (error) {
      return `Error creating task: ${error}`;
    }
  }
}

/**
 * Tool for updating a task's status
 */
export class UpdateTaskTool extends Tool {
  name = "update_task";
  description = "Update a task's status, priority, or add notes. Input should be a JSON string with taskId, userId, and optional status, priority, note, and dueDate.";

  async _call(input: string): Promise<string> {
    try {
      let params: { 
        taskId: number; 
        userId: string; 
        status?: TaskStatus; 
        priority?: TaskPriority;
        note?: string;
        dueDate?: string;
      } = { taskId: 0, userId: "" };
      
      try {
        params = JSON.parse(input);
      } catch (e) {
        return "Input must be a valid JSON string with taskId and userId.";
      }
      
      if (!params.taskId || !params.userId) {
        return "taskId and userId are required";
      }
      
      // Prepare updates object with only provided fields
      const updates: any = {};
      if (params.status) updates.status = params.status;
      if (params.priority) updates.priority = params.priority;
      if (params.note) updates.note = params.note;
      if (params.dueDate) updates.due_at = new Date(params.dueDate);

      const updatedTask = await updateTask(params.taskId, updates, params.userId);
      
      if (updatedTask) {
        return `✅ Task ${params.taskId} updated successfully!`;
      } else {
        return `❌ Failed to update task ${params.taskId}. It may not exist or you may not have permission.`;
      }
    } catch (error) {
      return `Error updating task: ${error}`;
    }
  }
}

/**
 * Tool for identifying tasks that need reminders
 */
export class TaskRemindersTool extends Tool {
  name = "get_task_reminders";
  description = "Get tasks that need reminders soon. Input should be a JSON string with userId and optional hoursThreshold (default: 24).";

  async _call(input: string): Promise<string> {
    try {
      let params: { userId: string; hoursThreshold?: number } = { userId: "" };
      
      try {
        params = JSON.parse(input);
      } catch (e) {
        return "Input must be a valid JSON string with userId.";
      }
      
      if (!params.userId) {
        return "userId is required";
      }
      
      const hoursThreshold = params.hoursThreshold || 24;
      
      const tasks = await findTasksNeedingReminders(params.userId, hoursThreshold);
      
      if (tasks.length === 0) {
        return "No upcoming tasks that need reminders.";
      }
      
      const formattedTasks = formatTasksForDisplay(tasks);
      return formattedTasks;
    } catch (error) {
      return `Error getting task reminders: ${error}`;
    }
  }
}

/**
 * Get tools related to tasks
 */
export function getTaskTools() {
  return [
    new GetTasksTool(),
    new CreateTaskTool(),
    new UpdateTaskTool(),
    new TaskRemindersTool(),
    new FindTaskTool(),
    new GetRecentTaskTool()
  ];
} 