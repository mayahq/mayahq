import { SupabaseClient } from '@supabase/supabase-js'

/**
 * Detects tasks in message content
 * Currently detects common task patterns like:
 * - #todo
 * - todo:
 * - to-do:
 * - remember to
 */
export function detectTasks(content: string): string[] {
  const tasks: string[] = []
  
  // Detect #todo pattern (primary focus)
  const todoTagRegex = /#todo\s+([^#\n]+)/ig
  let match
  
  while ((match = todoTagRegex.exec(content)) !== null) {
    if (match[1] && match[1].trim()) {
      tasks.push(match[1].trim())
    }
  }
  
  // Only if no #todo tags found, check for other patterns
  if (tasks.length === 0) {
    const normalizedContent = content.toLowerCase()
    
    // Detect "todo:" pattern 
    const todoColonRegex = /todo:\s*([^\n]+)/gi
    while ((match = todoColonRegex.exec(content)) !== null) {
      if (match[1] && match[1].trim()) {
        tasks.push(match[1].trim())
      }
    }
    
    // Detect "to-do:" pattern
    const toDoRegex = /to-do:\s*([^\n]+)/gi
    while ((match = toDoRegex.exec(content)) !== null) {
      if (match[1] && match[1].trim()) {
        tasks.push(match[1].trim())
      }
    }
    
    // Detect "remember to" pattern
    const rememberToRegex = /remember to\s+([^.!?\n]+[.!?]?)/gi
    while ((match = rememberToRegex.exec(content)) !== null) {
      if (match[1] && match[1].trim()) {
        tasks.push(match[1].trim())
      }
    }
  }
  
  return tasks
}

/**
 * Inserts detected tasks into the tasks table
 */
export async function saveTasksFromMessage(content: string, userId: string, supabase: SupabaseClient): Promise<boolean> {
  const tasks = detectTasks(content)
  
  if (tasks.length === 0) {
    return false
  }
  
  console.log(`Detected ${tasks.length} tasks in message from user ${userId}`)
  
  // Create tasks for each detected task
  for (const taskContent of tasks) {
    try {
      const { error } = await supabase
        .from('tasks')
        .insert({
          content: taskContent,
          user_id: userId,
          status: 'pending',
          priority: 'medium'
        })
      
      if (error) {
        console.error(`Failed to create task: ${error.message}`)
      } else {
        console.log(`Created task: "${taskContent.substring(0, 30)}..."`)
      }
    } catch (err) {
      console.error('Error saving task:', err)
    }
  }
  
  return true
}

/**
 * Detects if a message contains tasks
 */
export function containsTasks(content: string): boolean {
  return detectTasks(content).length > 0
}

/**
 * Parses a task's completion status
 * For example: "todo: buy milk [done]" would return true
 */
export function isTaskComplete(taskText: string): boolean {
  const completionMarkers = [
    /\[done\]/i,
    /\[complete\]/i,
    /\[completed\]/i,
    /\[x\]/i,
    /✓/,
    /✅/
  ]
  
  return completionMarkers.some(marker => marker.test(taskText))
} 