import { SupabaseClient, createClient } from '@supabase/supabase-js';
import { formatDistance, format } from 'date-fns';
import { Database } from '@/lib/database.types';

// Task status types
export type TaskStatus = 'open' | 'done' | 'canceled';

// Task priority types
export type TaskPriority = 'low' | 'normal' | 'high';

// Task interface
export interface Task {
  id: number;
  user_id: string;
  content: string;
  status: TaskStatus;
  tags: string[];
  created_at: string;
  completed_at: string | null;
  due_at: string | null;
  note: string | null;
  priority: TaskPriority;
  reminder_sent: boolean;
}

// Function to extract tasks from a message
export async function extractTasksFromMessage(
  supabase: SupabaseClient<Database>,
  message: string,
  userId: string,
  tags: string[] = []
): Promise<number | null> {
  if (!message.trim()) {
    console.error('Error extracting tasks: Message is empty');
    return null;
  }

  try {
    console.log('Calling RPC add_task_from_message with params:', {
      p_message: message,
      p_user_id: userId,
      p_tags: tags
    });

    const { data, error } = await supabase.rpc('add_task_from_message', {
      p_message: message,
      p_user_id: userId,
      p_tags: tags
    });

    if (error) {
      console.error('Error extracting tasks from RPC call:', error);
      throw new Error(`Database error: ${error.message}`);
    }

    console.log('RPC call result:', data);
    
    // If data is null or not a number, insert directly
    if (data === null || typeof data !== 'number') {
      console.log('Fallback: Inserting task directly');
      const { data: insertData, error: insertError } = await supabase
        .from('tasks')
        .insert({
          user_id: userId,
          content: message,
          tags: tags,
          status: 'open',
          priority: 'normal',
          reminder_sent: false
        })
        .select('id')
        .single();
        
      if (insertError) {
        console.error('Error inserting task directly:', insertError);
        throw new Error(`Insert error: ${insertError.message}`);
      }
      
      return insertData && 'id' in insertData ? (insertData.id as number) : null;
    }

    return data as number;
  } catch (error) {
    console.error('Failed to extract tasks:', error);
    throw error; // Re-throw to let the caller handle it
  }
}

// Function to list tasks with optional filtering
export async function listTasks(
  supabase: SupabaseClient<Database>,
  userId: string,
  status: TaskStatus | 'all' = 'open',
  tag?: string,
  dueBefore?: Date
): Promise<Task[]> {
  try {
    let query = supabase
      .from('tasks')
      .select('*')
      .eq('user_id', userId);

    // Filter by status if not 'all'
    if (status !== 'all') {
      query = query.eq('status', status);
    }

    // Filter by tag if provided
    if (tag) {
      query = query.contains('tags', [tag]);
    }

    // Filter by due date if provided
    if (dueBefore) {
      query = query.lte('due_at', dueBefore.toISOString());
    }

    // Order by priority and due date
    query = query.order('priority', { ascending: false })
                .order('due_at', { ascending: true });

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching tasks:', error);
      return [];
    }

    return data as unknown as Task[];
  } catch (error) {
    console.error('Failed to list tasks:', error);
    return [];
  }
}

// Function to update a task
export async function updateTask(
  supabase: SupabaseClient<Database>,
  taskId: number,
  updates: {
    content?: string;
    status?: TaskStatus;
    note?: string | null;
    priority?: TaskPriority;
    due_at?: string | null;
    tags?: string[];
  },
  userId: string
): Promise<Task | null> {
  try {
    // First verify the task belongs to this user
    const { data: taskCheck, error: checkError } = await supabase
      .from('tasks')
      .select('id')
      .eq('id', taskId)
      .eq('user_id', userId)
      .single();

    if (checkError || !taskCheck) {
      console.error('Task not found or not owned by user:', checkError);
      return null;
    }

    const updateData: any = { ...updates };
    
    // If marking as done, set the completed_at timestamp
    if (updates.status === 'done' && !updateData.completed_at) {
      updateData.completed_at = new Date().toISOString();
    }

    const { data, error } = await supabase
      .from('tasks')
      .update(updateData)
      .eq('id', taskId)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) {
      console.error('Error updating task:', error);
      return null;
    }

    return data as unknown as Task;
  } catch (error) {
    console.error('Failed to update task:', error);
    return null;
  }
}

// Function to add a log entry for autonomous actions
export async function logAutonomousAction(
  supabase: SupabaseClient<Database>,
  userId: string,
  actionType: string,
  taskId: number | null,
  content: string
): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('autonomy_log')
      .insert({
        user_id: userId,
        action_type: actionType,
        task_id: taskId,
        content
      });

    if (error) {
      console.error('Error logging autonomous action:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Failed to log autonomous action:', error);
    return false;
  }
}

// Function to format tasks for display in chat
export function formatTasksForDisplay(tasks: Task[]): string {
  if (tasks.length === 0) {
    return "You don't have any tasks that match those criteria.";
  }

  const now = new Date();
  let result = `You have ${tasks.length} task${tasks.length === 1 ? '' : 's'}:\n\n`;

  tasks.forEach((task, index) => {
    // Format due date if present
    let dueText = '';
    if (task.due_at) {
      const dueDate = new Date(task.due_at);
      
      if (dueDate < now) {
        dueText = ` (OVERDUE: due ${formatDistance(dueDate, now, { addSuffix: true })})`;
      } else {
        dueText = ` (due ${formatDistance(dueDate, now, { addSuffix: true })})`;
      }
    }

    // Format priority indicator
    let priorityIndicator = '';
    if (task.priority === 'high') {
      priorityIndicator = '⚠️ ';
    }

    result += `${index + 1}. ${priorityIndicator}${task.content}${dueText} [ID: ${task.id}]\n`;
  });

  return result;
}

// Function to find tasks that need reminders
export async function findTasksNeedingReminders(
  supabase: SupabaseClient<Database>,
  userId: string,
  hoursThreshold: number = 2
): Promise<Task[]> {
  const thresholdDate = new Date();
  thresholdDate.setHours(thresholdDate.getHours() + hoursThreshold);

  try {
    const { data, error } = await supabase
      .from('tasks')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'open')
      .eq('reminder_sent', false)
      .lte('due_at', thresholdDate.toISOString())
      .not('due_at', 'is', null);

    if (error) {
      console.error('Error finding tasks needing reminders:', error);
      return [];
    }

    return data as unknown as Task[];
  } catch (error) {
    console.error('Failed to find tasks needing reminders:', error);
    return [];
  }
}

// Function to mark a task as having been reminded about
export async function markTaskReminded(
  supabase: SupabaseClient<Database>,
  taskId: number,
  userId: string
): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('tasks')
      .update({ reminder_sent: true })
      .eq('id', taskId)
      .eq('user_id', userId);

    if (error) {
      console.error('Error marking task as reminded:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Failed to mark task as reminded:', error);
    return false;
  }
} 