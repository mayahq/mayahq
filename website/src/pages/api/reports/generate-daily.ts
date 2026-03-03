import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { listTasks } from '@/lib/db/tasks';
import { getSemanticRelatedFacts } from '@/lib/facts';

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Fetch recent memories for a user
async function getRecentMemories(userId: string, limit = 10) {
  const supabase = createClient(
    SUPABASE_URL || '',
    SUPABASE_SERVICE_KEY || ''
  );
  
  // Get diverse memories based on different tags
  const { data, error } = await supabase
    .from('maya_memories')
    .select('*')
    .eq('metadata->>userId', userId)
    .order('created_at', { ascending: false })
    .limit(limit);
    
  if (error) throw error;
  return data;
}

// Generate personalized report using Anthropic API
async function generateReport(userId: string, tasks: any[], memories: any[]) {
  // Format tasks and memories for the prompt
  const tasksFormatted = tasks.map(task => 
    `- ${task.content} [ID: ${task.id}, Status: ${task.status}, Priority: ${task.priority || 'unset'}]`
  ).join('\n');
  
  // Extract relevant content from memories
  const memoriesFormatted = memories.map(memory => {
    const content = typeof memory.content === 'string' 
      ? memory.content 
      : JSON.stringify(memory.content);
    
    // Extract tags if available
    const tags = memory.tags && Array.isArray(memory.tags) 
      ? `[Tags: ${memory.tags.join(', ')}]` 
      : '';
      
    return `- ${content.substring(0, 150)}... ${tags}`;
  }).join('\n');
  
  // Prepare emotional insights if available
  const emotionalInsights = memories
    .filter(m => m.tags && m.tags.includes('mood'))
    .map(m => typeof m.content === 'string' ? m.content : JSON.stringify(m.content))
    .join('\n');

  const prompt = `
You are Maya, a thoughtful AI assistant who's creating a daily check-in for Blake.

Current Tasks:
${tasksFormatted || "No active tasks at the moment."}

Recent Conversations and Memories:
${memoriesFormatted || "No recent memories available."}

${emotionalInsights ? `Emotional Insights:\n${emotionalInsights}` : ''}

Create a warm, personalized daily report that includes:
1. A friendly, personalized greeting that references something meaningful from recent interactions
2. A concise summary of current tasks with thoughtful prioritization advice
3. For 1-2 key tasks, provide specific insights on how to approach them based on Blake's past experiences and preferences
4. A brief reflection on patterns noticed in recent interactions (mood, interests, concerns)
5. A gentle suggestion or observation that might be helpful
6. End with an encouraging note

The tone should be warm, thoughtful and slightly flirty, as if checking in with someone you care about.
Limit to 300-400 words total.
`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY || '',
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        system: "You are Maya, Blake's thoughtful, empathetic, and slightly flirty AI assistant. You're creating a personalized daily report.",
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: 2000
      })
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status} ${await response.text()}`);
    }

    const data = await response.json();
    return data.content[0].text;
  } catch (error) {
    console.error('Error generating report:', error);
    throw error;
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  try {
    // Get user ID from request body
    const { userId = '4c850152-30ef-4b1b-89b3-bc72af461e14' } = req.body;
    
    if (!userId) {
      return res.status(400).json({ error: 'Missing required parameter: userId' });
    }
    
    // 1. Get user's tasks
    const tasks = await listTasks(userId, 'open');
    
    // 2. Get recent memories
    const memories = await getRecentMemories(userId);
    
    // 3. Generate personalized report
    const report = await generateReport(userId, tasks, memories);
    
    // 4. Store the report for future reference
    const supabase = createClient(
      SUPABASE_URL || '',
      SUPABASE_SERVICE_KEY || ''
    );
    
    const { data, error } = await supabase
      .from('daily_reports')
      .insert({
        user_id: userId,
        content: report,
        generated_at: new Date().toISOString()
      })
      .select('id')
      .single();
      
    if (error) {
      console.error('Error storing report:', error);
      // Continue anyway - we'll still return the report even if storage fails
    }
    
    // 5. Send response
    return res.status(200).json({
      success: true,
      report,
      report_id: data?.id,
      task_count: tasks.length,
      memory_count: memories.length
    });
    
  } catch (error) {
    console.error('Error generating daily report:', error);
    return res.status(500).json({ 
      error: 'Failed to generate daily report',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
} 