import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { type Task, dbGetTasks } from './task-utils'; // Assuming Task interface is exported
import { retrieveRelevantMemories, retrieveCoreFacts } from './memory-utils'; // Assuming MessageRow is handled by addToMemoryQueue
import { generateResponse } from './ai-client';
import { v4 as uuidv4 } from 'uuid';
import { type MessageRow, addToMemoryQueue } from './process-message'; // For constructing the message to save

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Supabase URL or Service Role Key is missing for Report Generator. Reporting will not work.');
}
const supabase_admin_client_for_report_generator: SupabaseClient = createClient(supabaseUrl!, supabaseKey!);

const MAYA_SYSTEM_USER_ID = process.env.MAYA_SYSTEM_USER_ID || '00000000-0000-0000-0000-000000000000';

// --- Helper functions (adapted from website/supabase/functions/_shared/report-builder.ts) ---

function getPriorityValue(priority: string | undefined | null): number {
  if (!priority) return 0;
  const lowerPriority = priority.toLowerCase();
  if (lowerPriority.includes('high')) return 3;
  if (lowerPriority.includes('medium') || lowerPriority.includes('normal')) return 2;
  if (lowerPriority.includes('low')) return 1;
  return 0;
}

function getTopTasks(tasks: Task[]): Task[] {
  if (!tasks || tasks.length === 0) return [];
  return [...tasks]
    .filter(task => task.status === 'open')
    .sort((a, b) => {
      const priorityDiff = getPriorityValue(b.priority) - getPriorityValue(a.priority);
      if (priorityDiff !== 0) return priorityDiff;
      if (a.due_at && b.due_at) return new Date(a.due_at).getTime() - new Date(b.due_at).getTime();
      if (a.due_at) return -1;
      if (b.due_at) return 1;
      return new Date(a.created_at!).getTime() - new Date(b.created_at!).getTime();
    })
    .slice(0, 3);
}

function getMicroCelebration(completedCount: number): string {
  if (completedCount === 0) return '';
  const celebrations = [
    "🎉 You're killing it!", "🔥 On fire lately!", "🚀 Crushing those tasks!",
    "⚡ Legend status!", "💪 Look at you go!", "🏆 Victory vibes!",
    "💯 Perfect execution!", "🌟 Stellar work!", "👑 Task-slaying royalty!",
    "🤩 Impressive progress!"
  ];
  return celebrations[Math.floor(Math.random() * celebrations.length)];
}

// Simplified shouldAddHealthHabitNudge and getHealthHabitNudge for brevity. 
// These can be expanded based on your actual tag/memory analysis preference.
function shouldAddHealthHabitNudge(memories: any[]): boolean {
  // Placeholder: In a real scenario, analyze memories for health tags or lack thereof.
  return Math.random() < 0.3; // Add a nudge 30% of the time for this example
}

function getHealthHabitNudge(): string {
  const nudges = [
    "💧 Quick reminder to stay hydrated today!",
    "🚶‍♂️ How about a quick walk to clear your mind?",
    "🧘 Taking a 5-minute breather might boost your focus.",
  ];
  return nudges[Math.floor(Math.random() * nudges.length)];
}

function formatTasksForReport(tasks: Task[], completedTasksToday: Task[]): {
  openTasksSection: string;
  completedTasksSection: string;
  totalOpen: number;
  totalCompleted: number;
} {
  const openTasks = tasks.filter(task => task.status === 'open');
  const totalOpen = openTasks.length;
  const totalCompleted = completedTasksToday.length;

  const openTasksText = openTasks.length > 0 ? openTasks.map(task => {
    const priority = task.priority ? `[${task.priority}]` : '';
    const dueDate = task.due_at ? `(Due: ${new Date(task.due_at).toLocaleDateString()})` : '';
    return `- ${task.content} ${priority} ${dueDate}`;
  }).join('\n') : "No open tasks at the moment.";

  const completedTasksText = completedTasksToday.length > 0 ? completedTasksToday.map(task => {
    return `- ${task.content}`;
  }).join('\n') : "No tasks completed today yet.";

  return {
    openTasksSection: openTasksText,
    completedTasksSection: completedTasksText,
    totalOpen,
    totalCompleted
  };
}

function formatMemoriesForReport(memories: any[]): string {
  if (!memories || memories.length === 0) return "We haven't chatted much recently, let's change that!";
  
  return memories.slice(0, 3).map(memory => {
    let textToShow = "(Memory content not available)"; // Default text
    // A LangChain Document has pageContent. Our retrieveRelevantMemories maps it to this structure.
    if (memory && typeof memory.pageContent === 'string') {
      textToShow = memory.pageContent;
      if (textToShow.length > 300) {
        textToShow = textToShow.substring(0, 300) + '...';
      }
    } else if (memory && typeof memory.content === 'string') {
      // Fallback if somehow a 'content' field is still present from an older format
      textToShow = memory.content;
      if (textToShow.length > 300) {
        textToShow = textToShow.substring(0, 300) + '...';
      }
    }
    
    const similarityScore = memory.similarity !== undefined ? memory.similarity.toFixed(2) : 'N/A';
    return `- You mentioned: "${textToShow}" (Relevance: ${similarityScore})`;
  }).join('\n');
}

function formatCoreFactsForReport(facts: any[]): string {
  if (!facts || facts.length === 0) return '';
  // Select a few diverse core facts, or make this more sophisticated
  return facts.slice(0, 5).map(fact => `- ${fact.content}`).join('\n');
}


export async function generateDailyReportForUser(userId: string, userName?: string): Promise<string | null> {
  console.log(`Generating daily report for user ${userId}...`);
  try {
    const { data: userProfileData, error: profileError } = await supabase_admin_client_for_report_generator.from('profiles').select('name, default_room_id').eq('id', userId).single();
    
    if (profileError || !userProfileData) {
        console.error(`Failed to fetch profile or default_room_id for user ${userId}:`, profileError);
        return null;
    }
    const resolvedUserName = userName || userProfileData.name || 'there';
    const defaultRoomId = userProfileData.default_room_id;

    if (!defaultRoomId) {
      console.error(`User ${userId} does not have a default_room_id set in their profile. Cannot send daily report.`);
      return null;
    }

    const allOpenTasks = await dbGetTasks(userId, { status: 'open', limit: 50 });
    // For completed tasks, you'd ideally filter by `completed_at` for today.
    // This requires `completed_at` to be set correctly by `dbUpdateTask`.
    const today = new Date();
    const startOfDay = new Date(today.setHours(0, 0, 0, 0)).toISOString();
    const endOfDay = new Date(today.setHours(23, 59, 59, 999)).toISOString();
    
    const { data: completedTasksTodayRaw, error: completedError } = await supabase_admin_client_for_report_generator
      .from('tasks')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'completed')
      .gte('completed_at', startOfDay)
      .lte('completed_at', endOfDay);
    if(completedError) console.error("Error fetching completed tasks for today:", completedError);
    const completedTasksToday = (completedTasksTodayRaw || []) as Task[];

    const insightfulMemories = await retrieveRelevantMemories(userId, "user's key topics, goals, or feelings from the past week", 5);
    const coreFacts = await retrieveCoreFacts(null, 100); // Fetch all, formatCoreFactsForReport will pick a few

    const { openTasksSection, completedTasksSection, totalOpen, totalCompleted } = formatTasksForReport(allOpenTasks, completedTasksToday);
    const formattedMemories = formatMemoriesForReport(insightfulMemories);
    const formattedCoreFacts = formatCoreFactsForReport(coreFacts);
    const topTasks = getTopTasks(allOpenTasks);
    let topTasksSection = topTasks.length > 0 ? topTasks.map((task, index) => 
      `${index + 1}. ${task.content} ${task.priority ? `[${task.priority}]` : ''} ${task.due_at ? `(Due: ${new Date(task.due_at).toLocaleDateString()})` : ''}`
    ).join('\n') : "No specific high-priority tasks right now - looking good!";

    const celebration = getMicroCelebration(totalCompleted);
    const habitNudge = shouldAddHealthHabitNudge(insightfulMemories) ? getHealthHabitNudge() : '';

    const systemPromptForReport = `You are Maya, a friendly, slightly flirty, and supportive AI assistant. Your role is to create a personalized daily morning report for ${resolvedUserName}. 
    The report should be encouraging, concise, and use Markdown for light formatting (headers, lists).
    - IMPORTANT: ONLY USE ONE EMOJI IN THE ENTIRE REPORT.
    - Start with a warm, friendly, or slightly flirty greeting.
    - Briefly highlight a key open task or a positive observation.
    - Remind about top priority tasks.
    - Celebrate any tasks completed yesterday/today.
    - Based on the 'Reflections on Recent Conversations' section, write 1-2 sentences synthesizing any recurring themes, notable events, or potential shifts in focus you observe from the user's recent interactions. Aim for an insightful and supportive tone.
    - Include a small, positive habit nudge if appropriate.
    - End with a warm sign-off like "xo, Maya" or similar. 
    Keep the overall tone light, supportive, and engaging.`;

    const userPromptForReport = 
`Hey Maya, please craft my daily report using this information:

## Overall Task Summary
Open Tasks: ${totalOpen}
Tasks Completed Today/Yesterday: ${totalCompleted} ${celebration}

## Top 3 Priority Tasks for Today:
${topTasksSection}

## All Open Tasks:
${openTasksSection}

## Recently Completed Tasks:
${completedTasksSection}

## Reflections on Recent Conversations:
${formattedMemories}

${habitNudge ? `## Quick Well-being Tip:\n${habitNudge}\n` : ''}

Based on this, give me a brief, motivating, and slightly flirty morning update. Make sure to mention specific tasks if they stand out (e.g. overdue, high priority).`;

    const reportContent = await generateResponse(userPromptForReport, systemPromptForReport, []);

    if (reportContent) {
      const reportMessage: MessageRow = {
        id: uuidv4(),
        user_id: MAYA_SYSTEM_USER_ID,
        room_id: defaultRoomId, // Use the fetched default_room_id
        content: reportContent,
        role: 'assistant',
        created_at: new Date().toISOString(),
        metadata: { type: 'daily_report', generated_at: new Date().toISOString(), for_user: userId }
      };

      const { error: insertMsgError } = await supabase_admin_client_for_report_generator.from('messages').insert(reportMessage);
      if (insertMsgError) {
        console.error(`Failed to insert daily report message for user ${userId}:`, insertMsgError);
        return null;
      }
      console.log(`Daily report message inserted for user ${userId}. Triggering memory queue.`);
      // Add the report message to the memory ingestion queue for embedding
      const queueSuccess = await addToMemoryQueue(reportMessage);
      if (queueSuccess) {
        console.log('Daily report added to memory queue for embedding');
      } else {
        console.log('Daily report already in memory queue or processed');
      }

      // Trigger push notification by calling the Supabase Edge Function
      const sendPushFunctionUrl = process.env.SUPABASE_FUNCTION_URL_SEND_PUSH;
      const internalApiKey = process.env.INTERNAL_API_KEY;

      if (sendPushFunctionUrl && internalApiKey) {
        console.log(`Attempting to send push notification for daily report to user ${userId} via ${sendPushFunctionUrl}`);
        fetch(sendPushFunctionUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'supabase-function-secret': internalApiKey // Use the agreed-upon header for inter-function auth
          },
          body: JSON.stringify({
            userId: userId,
            title: `☀️ Your Daily Briefing from Maya!`,
            body: reportContent.substring(0, 180) + (reportContent.length > 180 ? "..." : ""), // Concise body
            data: { type: "daily_report", messageId: reportMessage.id, roomId: defaultRoomId } 
          })
        })
        .then(async (notifResponse) => {
          if (!notifResponse.ok) {
            const errData = await notifResponse.text();
            console.error(`Push notification trigger failed for user ${userId}: ${notifResponse.status}`, errData);
          } else {
            const notifResult = await notifResponse.json();
            console.log(`Push notification triggered successfully for user ${userId}. Response:`, notifResult);
          }
        })
        .catch(notifError => {
          console.error(`Error calling send-push-notification function for user ${userId}:`, notifError);
        });
      } else {
        console.warn("SUPABASE_FUNCTION_URL_SEND_PUSH or INTERNAL_API_KEY not configured. Skipping push notification.");
      }
      return reportContent;
    }
    return null;
  } catch (error) {
    console.error(`Error generating daily report for user ${userId}:`, error);
    return null;
  }
} 