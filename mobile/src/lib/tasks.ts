import { SupabaseClient } from '@supabase/supabase-js'
import { Database, Tables } from '@mayahq/supabase-client'

// Task status types
export type TaskStatus = 'open' | 'done' | 'canceled'
export type TaskPriority = 'low' | 'medium' | 'high'

export type Task = Tables<'tasks'>

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
      .eq('user_id', userId)

    // Filter by status if not 'all'
    if (status !== 'all') {
      query = query.eq('status', status)
    }

    // Filter by tag if provided
    if (tag) {
      query = query.contains('tags', [tag])
    }

    // Filter by due date if provided
    if (dueBefore) {
      query = query.lte('due_at', dueBefore.toISOString())
    }

    // Order by priority and due date
    query = query.order('created_at', { ascending: false })

    const { data, error } = await query

    if (error) {
      console.error('Error fetching tasks:', error)
      return []
    }

    return data || []
  } catch (error) {
    console.error('Failed to list tasks:', error)
    return []
  }
}

// Function to create a new task
export async function createTask(
  supabase: SupabaseClient<Database>,
  userId: string,
  content: string,
  options: {
    status?: TaskStatus
    priority?: TaskPriority
    dueAt?: Date
    note?: string
    tags?: string[]
  } = {}
): Promise<Task | null> {
  try {
    const { data, error } = await supabase
      .from('tasks')
      .insert({
        user_id: userId,
        content: content.trim(),
        status: options.status || 'open',
        priority: options.priority || 'medium',
        due_at: options.dueAt?.toISOString() || null,
        note: options.note || null,
        tags: options.tags && options.tags.length > 0 ? options.tags : null,
        created_at: new Date().toISOString(),
      })
      .select()
      .single()

    if (error) {
      console.error('Error creating task:', error)
      return null
    }

    return data
  } catch (error) {
    console.error('Failed to create task:', error)
    return null
  }
}

// Function to update a task
export async function updateTask(
  supabase: SupabaseClient<Database>,
  taskId: number,
  updates: Partial<Omit<Task, 'id' | 'user_id' | 'created_at'>>,
  userId: string
): Promise<Task | null> {
  try {
    const updateData: any = { ...updates }

    // Handle status change to 'done'
    if (updates.status === 'done' && !updates.completed_at) {
      updateData.completed_at = new Date().toISOString()
    }

    // Clear completed_at if status is not 'done'
    if (updates.status && updates.status !== 'done') {
      updateData.completed_at = null
    }

    // Handle due_at conversion if it's a Date object
    if (updates.due_at && typeof updates.due_at !== 'string') {
      updateData.due_at = (updates.due_at as any).toISOString()
    }

    // Ensure tags are properly formatted
    if (updates.tags !== undefined) {
      updateData.tags = Array.isArray(updates.tags) && updates.tags.length > 0 ? updates.tags : null
    }

    const { data, error } = await supabase
      .from('tasks')
      .update(updateData)
      .eq('id', taskId)
      .eq('user_id', userId)
      .select()
      .single()

    if (error) {
      console.error('Error updating task:', error)
      return null
    }

    return data
  } catch (error) {
    console.error('Failed to update task:', error)
    return null
  }
}

// Function to delete a task
export async function deleteTask(
  supabase: SupabaseClient<Database>,
  taskId: number,
  userId: string
): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('tasks')
      .delete()
      .eq('id', taskId)
      .eq('user_id', userId)

    if (error) {
      console.error('Error deleting task:', error)
      return false
    }

    return true
  } catch (error) {
    console.error('Failed to delete task:', error)
    return false
  }
}

// Function to toggle task status between open and done
export async function toggleTaskStatus(
  supabase: SupabaseClient<Database>,
  taskId: number,
  currentStatus: string | null,
  userId: string
): Promise<Task | null> {
  const newStatus: TaskStatus = currentStatus === 'done' ? 'open' : 'done'
  return updateTask(supabase, taskId, { status: newStatus }, userId)
}

// Function to extract tasks from natural language (simplified version)
export function extractTasksFromMessage(message: string): string[] {
  // This is a simplified version - you could enhance with AI/NLP
  const taskIndicators = [
    'todo:',
    'task:',
    'remind me to',
    'i need to',
    'don\'t forget to',
    'remember to'
  ]
  
  const lines = message.split('\n')
  const tasks: string[] = []
  
  for (const line of lines) {
    const trimmedLine = line.trim().toLowerCase()
    
    // Check if line contains task indicators
    for (const indicator of taskIndicators) {
      if (trimmedLine.startsWith(indicator)) {
        const taskContent = line.substring(line.toLowerCase().indexOf(indicator) + indicator.length).trim()
        if (taskContent) {
          tasks.push(taskContent)
        }
        break
      }
    }
    
    // Check for bullet points or numbered lists
    if (/^[-*•]\s+/.test(trimmedLine) || /^\d+\.\s+/.test(trimmedLine)) {
      const taskContent = line.replace(/^[-*•]\s+/, '').replace(/^\d+\.\s+/, '').trim()
      if (taskContent && taskContent.length > 3) {
        tasks.push(taskContent)
      }
    }
  }
  
  return tasks
}

// Helper function to create a quick task
export async function createQuickTask(
  supabase: SupabaseClient<Database>,
  userId: string,
  content: string
): Promise<Task | null> {
  return createTask(supabase, userId, content, {
    status: 'open',
    priority: 'medium'
  })
}

// Helper function to create a priority task
export async function createPriorityTask(
  supabase: SupabaseClient<Database>,
  userId: string,
  content: string,
  priority: TaskPriority,
  dueAt?: Date
): Promise<Task | null> {
  return createTask(supabase, userId, content, {
    status: 'open',
    priority,
    dueAt
  })
}

// Function to get tasks by priority
export async function getTasksByPriority(
  supabase: SupabaseClient<Database>,
  userId: string,
  priority: TaskPriority
): Promise<Task[]> {
  return listTasks(supabase, userId, 'all').then(tasks => 
    tasks.filter(task => task.priority === priority)
  )
}

// Function to get overdue tasks
export async function getOverdueTasks(
  supabase: SupabaseClient<Database>,
  userId: string
): Promise<Task[]> {
  try {
    const { data, error } = await supabase
      .from('tasks')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'open')
      .lt('due_at', new Date().toISOString())
      .not('due_at', 'is', null)

    if (error) {
      console.error('Error fetching overdue tasks:', error)
      return []
    }

    return data || []
  } catch (error) {
    console.error('Failed to fetch overdue tasks:', error)
    return []
  }
}

// Function to get tasks due today
export async function getTasksDueToday(
  supabase: SupabaseClient<Database>,
  userId: string
): Promise<Task[]> {
  try {
    const today = new Date()
    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString()
    const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1).toISOString()

    const { data, error } = await supabase
      .from('tasks')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'open')
      .gte('due_at', startOfDay)
      .lt('due_at', endOfDay)

    if (error) {
      console.error('Error fetching tasks due today:', error)
      return []
    }

    return data || []
  } catch (error) {
    console.error('Failed to fetch tasks due today:', error)
    return []
  }
}

// Function to get task statistics
export async function getTaskStats(
  supabase: SupabaseClient<Database>,
  userId: string
): Promise<{
  total: number
  open: number
  done: number
  canceled: number
  overdue: number
  dueToday: number
  highPriority: number
}> {
  try {
    const allTasks = await listTasks(supabase, userId, 'all')
    const overdueTasks = await getOverdueTasks(supabase, userId)
    const todayTasks = await getTasksDueToday(supabase, userId)

    return {
      total: allTasks.length,
      open: allTasks.filter(t => t.status === 'open').length,
      done: allTasks.filter(t => t.status === 'done').length,
      canceled: allTasks.filter(t => t.status === 'canceled').length,
      overdue: overdueTasks.length,
      dueToday: todayTasks.length,
      highPriority: allTasks.filter(t => t.priority === 'high' && t.status === 'open').length,
    }
  } catch (error) {
    console.error('Failed to get task stats:', error)
    return {
      total: 0,
      open: 0,
      done: 0,
      canceled: 0,
      overdue: 0,
      dueToday: 0,
      highPriority: 0,
    }
  }
} 