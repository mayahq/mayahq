import { createClient } from '@supabase/supabase-js';

// Ensure Supabase client is initialized using environment variables
// This assumes SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Supabase URL or Service Role Key is missing. Task utilities will not work.');
  // Depending on desired behavior, you might throw an error here or allow module to load with non-functional methods.
}

const supabase = createClient(supabaseUrl!, supabaseKey!);

export interface Task {
  id?: number; // Auto-incrementing, so optional on create
  user_id: string; // Should align with your auth user ID format (text in DB)
  content: string;
  status?: string; // e.g., 'open', 'in_progress', 'completed', 'archived'
  tags?: string[] | null;
  created_at?: string;
  completed_at?: string | null;
  due_at?: string | null;
  note?: string | null;
  priority?: string; // e.g., 'low', 'normal', 'high'
  // reminder_sent is not directly managed by these CRUD ops for now
}

/**
 * Attempts to parse a natural language due date string into an ISO string.
 * This is a simplified parser and can be expanded or replaced with a more robust library.
 * @param dateString The natural language date string (e.g., "tomorrow", "next Friday").
 * @returns An ISO date string or null if parsing fails.
 */
function parseDueDate(dateString: string | undefined | null): string | null {
  if (!dateString) return null;

  const lowerDateString = dateString.toLowerCase();
  const now = new Date();
  let targetDate = new Date(now);

  if (lowerDateString === 'today') {
    // Keep as is, will set time to start of day or use current time depending on DB
  } else if (lowerDateString === 'tomorrow') {
    targetDate.setDate(now.getDate() + 1);
  } else if (lowerDateString.startsWith('next ')) {
    const dayName = lowerDateString.split(' ')[1];
    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    let targetDayIndex = days.indexOf(dayName);
    if (targetDayIndex !== -1) {
      let currentDayIndex = now.getDay();
      let diff = targetDayIndex - currentDayIndex;
      if (diff <= 0) {
        diff += 7; // Move to next week's day
      }
      targetDate.setDate(now.getDate() + diff);
    } else {
      // Could not parse specific day like "next Wednesday"
      return null; 
    }
  } else {
    // Try direct parsing (handles YYYY-MM-DD, specific dates recognized by Date constructor)
    const parsed = new Date(dateString);
    if (!isNaN(parsed.getTime())) {
      targetDate = parsed;
    } else {
      // Cannot parse, return null or handle as error
      console.warn(`Could not parse due_date string: "${dateString}"`);
      return null;
    }
  }
  
  // Set to a reasonable time like noon if only date is given, or let DB handle default time part
  // For simplicity, we'll just use the date part, PostgreSQL will handle the time.
  // To ensure it's treated as a specific day, you might want to normalize time e.g. targetDate.setHours(23, 59, 59, 999);
  return targetDate.toISOString();
}

/**
 * Creates a new task in the database.
 * @param userId The ID of the user creating the task.
 * @param taskData The core data for the new task.
 * @returns The created task object or null if an error occurred.
 */
export async function dbCreateTask(
  userId: string,
  taskData: Pick<Task, 'content' | 'status' | 'priority' | 'due_at' | 'note' | 'tags'>
): Promise<Task | null> {
  try {
    const parsedDueAt = parseDueDate(taskData.due_at);
    if (taskData.due_at && !parsedDueAt) {
      // Original due_date string was present but couldn't be parsed
      console.warn(`Task creation for user ${userId}: Due date "${taskData.due_at}" could not be parsed. Task will be created without a due date.`);
    }

    const { data, error } = await supabase
      .from('tasks')
      .insert({
        user_id: userId,
        content: taskData.content,
        status: taskData.status || 'open',
        priority: taskData.priority || 'normal',
        due_at: parsedDueAt, // Use parsed date or null
        note: taskData.note,
        tags: taskData.tags,
        // created_at is default now()
      })
      .select()
      .single(); // Assuming you want the created record back

    if (error) {
      console.error('Error creating task in Supabase:', error);
      // Check if the error is due to invalid date format, even after parsing
      if (error.message.includes('invalid input syntax for type timestamp')) {
        console.error(`Supabase rejected the parsed due_date: ${parsedDueAt}. Original input: "${taskData.due_at}"`);
      }
      return null;
    }
    console.log(`Task created successfully for user ${userId}: ID ${data?.id}, Due: ${data?.due_at}`);
    return data as Task;
  } catch (e) {
    console.error('Unexpected error in dbCreateTask:', e);
    return null;
  }
}

/**
 * Retrieves tasks for a given user, with optional filters.
 * @param userId The ID of the user whose tasks to retrieve.
 * @param filters Optional filters for status and priority.
 * @returns An array of tasks or an empty array if none found or an error occurred.
 */
export async function dbGetTasks(
  userId: string,
  filters?: { status?: string; priority?: string; content?: string; limit?: number }
): Promise<Task[]> {
  try {
    let query = supabase
      .from('tasks')
      .select('*')
      .eq('user_id', userId);

    if (filters?.status) {
      query = query.eq('status', filters.status);
    }
    if (filters?.priority) {
      query = query.eq('priority', filters.priority);
    }
    if (filters?.content) {
      query = query.ilike('content', `%${filters.content}%`); // Case-insensitive search for content
    }

    query = query.order('created_at', { ascending: false }); // Default sort: newest first
    
    if (filters?.limit) {
      query = query.limit(filters.limit);
    } else {
      query = query.limit(50); // Default limit to prevent fetching too many tasks
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error retrieving tasks from Supabase:', error);
      return [];
    }
    return (data as Task[]) || [];
  } catch (e) {
    console.error('Unexpected error in dbGetTasks:', e);
    return [];
  }
}

/**
 * Updates an existing task.
 * @param taskId The ID of the task to update.
 * @param userId The ID of the user, for authorization.
 * @param updates The fields to update.
 * @returns The updated task object or null if an error occurred or not found.
 */
export async function dbUpdateTask(
  taskId: number,
  userId: string,
  updates: Partial<Pick<Task, 'content' | 'status' | 'priority' | 'due_at' | 'note' | 'tags' | 'completed_at'>>
): Promise<Task | null> {
  try {
    // Add completed_at timestamp if status is being set to 'completed' and not already set
    if (updates.status === 'completed' && !updates.completed_at) {
      updates.completed_at = new Date().toISOString();
    }
    // If status is being changed from 'completed' to something else, nullify completed_at
    if (updates.status && updates.status !== 'completed') {
        updates.completed_at = null;
    }

    // If due_date is part of updates and is a natural language string, parse it
    if (updates.due_at && typeof updates.due_at === 'string') {
      const parsedDueAt = parseDueDate(updates.due_at);
      if (!parsedDueAt) {
        console.warn(`Update Task ${taskId}: Due date "${updates.due_at}" could not be parsed. Due date will not be updated.`);
        delete updates.due_at; // Remove unparsable due_date from updates
      } else {
        updates.due_at = parsedDueAt;
      }
    }

    const { data, error } = await supabase
      .from('tasks')
      .update(updates)
      .eq('id', taskId)
      .eq('user_id', userId) // Ensure user can only update their own tasks
      .select()
      .single();

    if (error) {
      console.error(`Error updating task ${taskId} in Supabase:`, error);
      return null;
    }
    if (!data) {
        console.warn(`Task ${taskId} not found or user ${userId} not authorized to update.`);
        return null;
    }
    console.log(`Task ${taskId} updated successfully for user ${userId}.`);
    return data as Task;
  } catch (e) {
    console.error('Unexpected error in dbUpdateTask:', e);
    return null;
  }
}

/**
 * Deletes a task.
 * @param taskId The ID of the task to delete.
 * @param userId The ID of the user, for authorization.
 * @returns True if deleted successfully, false otherwise.
 */
export async function dbDeleteTask(taskId: number, userId: string): Promise<boolean> {
  try {
    const { error, count } = await supabase
      .from('tasks')
      .delete({ count: 'exact' })
      .eq('id', taskId)
      .eq('user_id', userId); // Ensure user can only delete their own tasks

    if (error) {
      console.error(`Error deleting task ${taskId} in Supabase:`, error);
      return false;
    }
    if (count === 0) {
        console.warn(`Task ${taskId} not found or user ${userId} not authorized to delete.`);
        return false;
    }
    console.log(`Task ${taskId} deleted successfully for user ${userId}.`);
    return true;
  } catch (e) {
    console.error('Unexpected error in dbDeleteTask:', e);
    return false;
  }
} 