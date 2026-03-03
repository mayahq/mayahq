import { SupabaseClient } from '@supabase/supabase-js'
import { Database } from './database-types'

/**
 * Generate daily reports for all users
 * This summarizes recent activity, memories, and tasks
 */
export async function dailyReport(supabase: SupabaseClient<Database>) {
  try {
    // Get all active users who have participated in chat in the last week
    const { data: activeUsers, error: userError } = await supabase
      .from('messages')
      .select('user_id')
      .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
      .order('created_at', { ascending: false })
      .limit(100)
    
    if (userError) {
      throw new Error(`Failed to get active users: ${userError.message}`)
    }
    
    if (!activeUsers || activeUsers.length === 0) {
      console.log('No active users found for daily reports')
      return
    }
    
    // Get unique user IDs
    const uniqueUserIds = [...new Set(activeUsers.map(u => u.user_id))]
    console.log(`Generating daily reports for ${uniqueUserIds.length} users`)
    
    // Generate report for each user
    for (const userId of uniqueUserIds) {
      await generateUserReport(supabase, userId)
    }
    
    console.log('Daily report generation complete')
  } catch (error) {
    console.error('Error generating daily reports:', error)
    throw error
  }
}

/**
 * Generate a daily report for a specific user
 */
async function generateUserReport(supabase: SupabaseClient<Database>, userId: string) {
  try {
    console.log(`Generating report for user: ${userId}`)
    
    // 1. Get undelivered tasks
    const { data: tasks, error: tasksError } = await supabase
      .from('daily_reports')
      .select('*')
      .eq('user_id', userId)
      .eq('delivered', false)
      .order('created_at', { ascending: false })
    
    if (tasksError) {
      throw new Error(`Failed to get tasks: ${tasksError.message}`)
    }
    
    // 2. Get user's recent memories
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const { data: recentMemories, error: memoriesError } = await supabase
      .from('maya_memories')
      .select('*')
      .gte('created_at', oneDayAgo)
      .filter('metadata->user_id', 'eq', userId)
      .order('created_at', { ascending: false })
      .limit(10)
    
    if (memoriesError) {
      throw new Error(`Failed to get memories: ${memoriesError.message}`)
    }
    
    // Skip if there's nothing to report
    if ((!tasks || tasks.length === 0) && (!recentMemories || recentMemories.length === 0)) {
      console.log(`No content for report for user ${userId}`)
      return
    }
    
    // 3. Compose the report
    let reportText = `Here's your daily update:\n\n`
    
    if (tasks && tasks.length > 0) {
      reportText += `📋 Your tasks:\n`
      tasks.forEach((task, index) => {
        reportText += `${index + 1}. ${task.report_text}\n`
      })
      reportText += `\n`
    }
    
    if (recentMemories && recentMemories.length > 0) {
      reportText += `💭 Recent activities:\n`
      const summaries = recentMemories.map(m => m.content.substring(0, 120) + (m.content.length > 120 ? '...' : ''))
      // Deduplicate and take top 5
      const uniqueSummaries = [...new Set(summaries)].slice(0, 5)
      uniqueSummaries.forEach((summary, index) => {
        reportText += `• ${summary}\n`
      })
    }
    
    // 4. Find the user's primary room
    const { data: rooms, error: roomError } = await supabase
      .from('rooms')
      .select('*')
      .eq('user_id', userId)
      .order('last_message_at', { ascending: false })
      .limit(1)
    
    if (roomError) {
      throw new Error(`Failed to get room: ${roomError.message}`)
    }
    
    if (!rooms || rooms.length === 0) {
      throw new Error(`No room found for user ${userId}`)
    }
    
    const roomId = rooms[0].id
    
    // 5. Insert the report message as the assistant
    const { error: insertError } = await supabase
      .from('messages')
      .insert({
        room_id: roomId,
        user_id: userId,
        content: reportText,
        role: 'assistant'
      })
    
    if (insertError) {
      throw new Error(`Failed to insert report message: ${insertError.message}`)
    }
    
    // 6. Mark tasks as delivered
    if (tasks && tasks.length > 0) {
      const { error: updateError } = await supabase
        .from('daily_reports')
        .update({ 
          delivered: true,
          delivered_at: new Date().toISOString(),
          delivery_method: 'chat'
        })
        .in('id', tasks.map(t => t.id))
      
      if (updateError) {
        console.error(`Failed to mark tasks as delivered: ${updateError.message}`)
      }
    }
    
    console.log(`Report generated and delivered for user ${userId}`)
  } catch (error) {
    console.error(`Error generating report for user ${userId}:`, error)
    // Continue with other users even if one fails
  }
} 