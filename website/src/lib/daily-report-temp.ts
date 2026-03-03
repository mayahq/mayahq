// Helper functions for the enhanced daily report

// Get priority value for sorting (high=3, medium=2, low=1, default=0)
export function getPriorityValue(priority: string | undefined): number {
  if (!priority) return 0;
  
  const lowerPriority = priority.toLowerCase();
  if (lowerPriority.includes('high')) return 3;
  if (lowerPriority.includes('medium')) return 2;
  if (lowerPriority.includes('low')) return 1;
  return 0;
}

// Function to get top 3 priority tasks sorted by priority and due date
export function getTopTasks(tasks: any[]): any[] {
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
export function getMicroCelebration(completedCount: number): string {
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
export function shouldAddHealthHabitNudge(memories: any[]): boolean {
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
export function getHealthHabitNudge(): string {
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