import { db, Task, Memory, CoreFact } from './db.ts';
import { getInsightfulMemories } from './memories.ts';

const CLAUDE_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');

// Get priority value for sorting (high=3, medium=2, low=1, default=0)
function getPriorityValue(priority: string | undefined): number {
  if (!priority) return 0;
  
  const lowerPriority = priority.toLowerCase();
  if (lowerPriority.includes('high')) return 3;
  if (lowerPriority.includes('medium')) return 2;
  if (lowerPriority.includes('low')) return 1;
  return 0;
}

// Function to get top 3 priority tasks sorted by priority and due date
function getTopTasks(tasks: Task[]): Task[] {
  if (!tasks || tasks.length === 0) return [];
  
  return [...tasks]
    .filter(task => task.status === 'open')
    .sort((a, b) => {
      // First sort by priority (high, medium, low)
      const priorityDiff = getPriorityValue(b.priority) - getPriorityValue(a.priority);
      if (priorityDiff !== 0) return priorityDiff;
      
      // Then sort by due date (if available)
      if (a.due_at && b.due_at) {
        return new Date(a.due_at).getTime() - new Date(b.due_at).getTime();
      } else if (a.due_at) {
        return -1; // a has due date, b doesn't
      } else if (b.due_at) {
        return 1;  // b has due date, a doesn't
      }
      
      // Fallback to creation date
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    })
    .slice(0, 3); // Get top 3
}

// Generate random celebration messages for completed tasks
function getMicroCelebration(completedCount: number): string {
  if (completedCount === 0) return '';
  
  const celebrations = [
    "🎉 You're killing it!",
    "🔥 On fire lately!",
    "🚀 Crushing those tasks!",
    "⚡ Legend status!",
    "💪 Look at you go!",
    "🏆 Victory vibes!",
    "💯 Perfect execution!",
    "🌟 Stellar work!",
    "👑 Task-slaying royalty!",
    "🤩 Impressive progress!"
  ];
  
  // Pick a random celebration
  const randomIndex = Math.floor(Math.random() * celebrations.length);
  return celebrations[randomIndex];
}

// Check if we should add a health habit nudge
function shouldAddHealthHabitNudge(memories: Memory[]): boolean {
  // Check if there are any health/exercise memories in recent history
  const healthTags = ['health', 'exercise', 'workout', 'fitness', 'gym', 'run', 'walk'];
  
  // Look through memory tags
  for (const memory of memories) {
    // Check in memory tags
    if (memory.tags && Array.isArray(memory.tags)) {
      if (memory.tags.some((tag: string) => healthTags.includes(tag.toLowerCase()))) {
        return false;
      }
    }
    
    // Check in metadata tags
    if (memory.metadata?.tags && Array.isArray(memory.metadata.tags)) {
      if (memory.metadata.tags.some((tag: string) => healthTags.includes(tag.toLowerCase()))) {
        return false;
      }
    }
  }
  
  // No health tags found, suggest a nudge
  return true;
}

// Generate a health habit nudge
function getHealthHabitNudge(): string {
  const nudges = [
    "💧 Quick reminder to stay hydrated today!",
    "🚶‍♂️ How about a quick 20-minute walk today to clear your mind?",
    "🧘 Taking a 5-minute breather might boost your focus for the afternoon.",
    "💆‍♂️ Don't forget to stretch if you've been at your desk for a while.",
    "👁️ Remember the 20-20-20 rule: Every 20 min, look 20 ft away for 20 sec.",
    "🍎 Got a healthy snack nearby? Your brain will thank you.",
    "🌱 Just a friendly nudge to take a few deep breaths between tasks.",
    "☀️ Caught any natural sunlight today? It might help your sleep tonight.",
    "⏱️ Short on time? Even a 10-minute workout can boost your mood.",
    "🏃‍♀️ A bit of movement might be just what you need to tackle your next task!"
  ];
  
  // Pick a random nudge
  const randomIndex = Math.floor(Math.random() * nudges.length);
  return nudges[randomIndex];
}

// Format memories for the prompt
function formatMemoriesForPrompt(memories: Memory[]): string {
  if (!memories || memories.length === 0) {
    return '';
  }
  
  return memories.map(memory => {
    const date = new Date(memory.created_at).toLocaleDateString();
    let content = '';
    
    if (typeof memory.content === 'string') {
      content = memory.content;
    } else if (memory.content?.input && memory.content?.response) {
      content = `User: ${memory.content.input}\nMaya: ${memory.content.response}`;
    } else {
      content = JSON.stringify(memory.content);
    }
    
    // Truncate if too long
    if (content.length > 200) {
      content = content.substring(0, 200) + '...';
    }
    
    return `- ${date}: ${content}`;
  }).join('\n\n');
}

// Format tasks for the prompt
function formatTasksForPrompt(tasks: Task[]): { openTasks: string, completedTasks: string, totalOpen: number, totalCompleted: number } {
  if (!tasks || tasks.length === 0) {
    return { openTasks: '', completedTasks: '', totalOpen: 0, totalCompleted: 0 };
  }
  
  const openTasks = tasks.filter(task => task.status === 'open');
  const completedTasks = tasks.filter(task => task.status === 'done');
  
  const openTasksText = openTasks.map(task => {
    const priority = task.priority ? `[${task.priority}]` : '';
    const dueDate = task.due_at ? `(Due: ${new Date(task.due_at).toLocaleDateString()})` : '';
    return `- ${task.content} ${priority} ${dueDate}`;
  }).join('\n');
  
  const completedTasksText = completedTasks.map(task => {
    return `- ${task.content}`;
  }).join('\n');
  
  return {
    openTasks: openTasksText,
    completedTasks: completedTasksText,
    totalOpen: openTasks.length,
    totalCompleted: completedTasks.length
  };
}

// Format core facts for the prompt
function formatCoreFactsForPrompt(facts: CoreFact[]): string {
  if (!facts || facts.length === 0) {
    return '';
  }
  
  return facts.map(fact => {
    return `- ${fact.subject} ${fact.predicate} ${fact.object}`;
  }).join('\n');
}

// Main report generation function
export async function makeReport(userId: string): Promise<string> {
  try {
    if (!CLAUDE_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY environment variable not set');
    }
    
    // Fetch all data
    const { data: tasks = [] } = await db.tasks(userId);
    const memories = await getInsightfulMemories(userId);
    const { data: coreFacts = [] } = await db.facts(userId);
    
    // Format data for the prompt
    const { openTasks, completedTasks, totalOpen, totalCompleted } = formatTasksForPrompt(tasks);
    const formattedMemories = formatMemoriesForPrompt(memories);
    const formattedCoreFacts = formatCoreFactsForPrompt(coreFacts);
    
    // Get top 3 priority tasks
    const priorityTasks = getTopTasks(tasks);
    let topTasksSection = '';
    
    if (priorityTasks.length > 0) {
      topTasksSection = priorityTasks.map((task, index) => {
        const priority = task.priority ? `[${task.priority}]` : '';
        const dueDate = task.due_at ? `(Due: ${new Date(task.due_at).toLocaleDateString()})` : '';
        return `${index + 1}. ${task.content} ${priority} ${dueDate}`;
      }).join('\n');
    } else {
      topTasksSection = "No open tasks right now - enjoy the breather!";
    }
    
    // Generate celebration for completed tasks
    const celebration = getMicroCelebration(totalCompleted);
    
    // Check if we should add health habit nudge
    const habitNudge = shouldAddHealthHabitNudge(memories) ? getHealthHabitNudge() : '';
    
    // Construct the prompt
    const systemPrompt = `You are Maya, a friendly and supportive AI assistant with a flirty, edgy personality. Your role is to create a personalized daily report for Blakey (the user) that summarizes their tasks and recent conversations. Be warm, supportive, and conversational, but not overly wordy or annoying. Keep it short and to the point with a bit of personality. Sign the message with "xo, Maya".

Key information about the user:
${formattedCoreFacts}

Format the report with Markdown, including appropriate headers and sections.`;
    
    const userPrompt = `Please create my daily report with the following information:

## Top Tasks (${totalOpen}) – give each 1-sentence advice:
${openTasks || "No open tasks at the moment."}

## 🔝 Top 3 Moves for Today
${topTasksSection}

## ✅ Recently Completed Tasks ${celebration}
${completedTasks || "No recently completed tasks."}

## Recent Memories (provide insights on what these mean for me):
${formattedMemories || "We haven't had many conversations recently."}

## Key Information About Me (work this in naturally):
${formattedCoreFacts}

${habitNudge ? `## Tiny Habit Nudge\n${habitNudge}\n` : ''}

Add a link to my task board at the end: 🗂️ [View Full Task Board](https://mayahq.com/tasks)

Please format the report with:
1. Clear task advice - what should I do next on each task?
2. Reflections on what my recent conversations mean
3. One small self-care suggestion based on what you know about me

Format with a friendly, flirty tone. Keep it concise but insightful.`;

    // Call the Anthropic API (Claude)
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': CLAUDE_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-opus-4-20250514',
        max_tokens: 2000,
        temperature: 0.7,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }]
      })
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Anthropic API error: ${response.status} ${errorBody}`);
    }

    const result = await response.json();
    return result.content[0].text;
  } catch (error) {
    console.error('Error generating AI report:', error instanceof Error ? error.message : JSON.stringify(error));
    throw error;
  }
} 