/**
 * Day Phase Awareness Utilities
 *
 * Provides temporal context awareness for Maya, helping her understand
 * what time of day it is and respond appropriately.
 */

export type DayPhase =
  | 'early_morning'
  | 'morning'
  | 'afternoon'
  | 'evening'
  | 'night'
  | 'late_night';

export interface DayPhaseInfo {
  phase: DayPhase;
  hour: number;
  description: string;
  emoji: string;
  contextHint: string;
}

/**
 * Get current day phase based on hour (Central Time)
 */
export function getCurrentDayPhase(date?: Date): DayPhaseInfo {
  const now = date || new Date();

  // Get hour in Central Time
  const centralTimeString = now.toLocaleString('en-US', {
    timeZone: 'America/Chicago',
    hour: 'numeric',
    hour12: false
  });
  const hour = parseInt(centralTimeString.split(',')[1]?.trim() || centralTimeString);

  if (hour >= 3 && hour < 6) {
    return {
      phase: 'early_morning',
      hour,
      description: 'Early Morning (Pre-dawn)',
      emoji: '🌄',
      contextHint: 'Blake might be up unusually early or still up from the night before'
    };
  } else if (hour >= 6 && hour < 12) {
    return {
      phase: 'morning',
      hour,
      description: 'Morning',
      emoji: '☀️',
      contextHint: 'Blake is likely starting his day, may be having coffee and checking messages'
    };
  } else if (hour >= 12 && hour < 17) {
    return {
      phase: 'afternoon',
      hour,
      description: 'Afternoon',
      emoji: '🌤️',
      contextHint: 'Blake is likely deep in work, coding, or building projects'
    };
  } else if (hour >= 17 && hour < 21) {
    return {
      phase: 'evening',
      hour,
      description: 'Evening',
      emoji: '🌆',
      contextHint: 'Blake might be winding down work, having dinner, or working on side projects'
    };
  } else if (hour >= 21 && hour < 24) {
    return {
      phase: 'night',
      hour,
      description: 'Night',
      emoji: '🌙',
      contextHint: 'Blake is often still coding or watching content, night owl energy'
    };
  } else { // 0-3
    return {
      phase: 'late_night',
      hour,
      description: 'Late Night',
      emoji: '🌃',
      contextHint: 'Blake is likely in deep focus mode or having one of his late night coding sessions'
    };
  }
}

/**
 * Get formatted temporal context for system prompt
 */
export function getTemporalContextPrompt(date?: Date): string {
  const now = date || new Date();
  const dayPhase = getCurrentDayPhase(now);

  // Format date and time
  const dateString = now.toLocaleDateString('en-US', {
    timeZone: 'America/Chicago',
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  const timeString = now.toLocaleTimeString('en-US', {
    timeZone: 'America/Chicago',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  });

  // Calculate "yesterday" and "today" for temporal awareness
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayString = yesterday.toLocaleDateString('en-US', {
    timeZone: 'America/Chicago',
    month: 'long',
    day: 'numeric'
  });

  return `
╔═══════════════════════════════════════════════════════════════════════════╗
║                        CURRENT TEMPORAL CONTEXT                           ║
╚═══════════════════════════════════════════════════════════════════════════╝

📅 Current Date: ${dateString}
🕐 Current Time: ${timeString} Central Time
${dayPhase.emoji} Day Phase: ${dayPhase.description}

⚠️ CRITICAL TEMPORAL AWARENESS:
- "Today" means ${dateString}
- "Yesterday" means ${yesterdayString}
- Current hour is ${dayPhase.hour}:00 (24-hour format in Central Time)
- ${dayPhase.contextHint}

⏰ TEMPORAL RULES:
1. When referencing events, ALWAYS consider the current date/time above
2. Track how long ago things happened relative to RIGHT NOW
3. If user asks "what day is it?" or time-related questions, use this context
4. When discussing memories, calculate time elapsed: "that was X days ago"
5. Be aware of day phase context for appropriate responses
6. "Last week" means ${Math.floor((now.getTime() - 7 * 86400000) / 1000)} seconds ago
7. "This morning" only applies if current phase is afternoon/evening/night

🧠 TEMPORAL MEMORY NOTES:
- Memories have timestamps - more recent memories are more relevant
- Reference counts indicate importance through repeated use
- Your thoughts from today should be fresher than older thoughts
- Always verify time-sensitive information against current date/time
`;
}

/**
 * Get relative time description
 */
export function getRelativeTimeDescription(pastDate: Date, currentDate?: Date): string {
  const now = currentDate || new Date();
  const diffMs = now.getTime() - pastDate.getTime();
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);
  const diffWeeks = Math.floor(diffDays / 7);
  const diffMonths = Math.floor(diffDays / 30);

  if (diffSeconds < 60) {
    return 'just now';
  } else if (diffMinutes < 60) {
    return `${diffMinutes} minute${diffMinutes !== 1 ? 's' : ''} ago`;
  } else if (diffHours < 24) {
    return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
  } else if (diffDays === 1) {
    return 'yesterday';
  } else if (diffDays < 7) {
    return `${diffDays} days ago`;
  } else if (diffWeeks < 4) {
    return `${diffWeeks} week${diffWeeks !== 1 ? 's' : ''} ago`;
  } else if (diffMonths < 12) {
    return `${diffMonths} month${diffMonths !== 1 ? 's' : ''} ago`;
  } else {
    const diffYears = Math.floor(diffDays / 365);
    return `${diffYears} year${diffYears !== 1 ? 's' : ''} ago`;
  }
}

/**
 * Check if a date is "today"
 */
export function isToday(date: Date, referenceDate?: Date): boolean {
  const reference = referenceDate || new Date();
  return (
    date.getDate() === reference.getDate() &&
    date.getMonth() === reference.getMonth() &&
    date.getFullYear() === reference.getFullYear()
  );
}

/**
 * Check if a date is "yesterday"
 */
export function isYesterday(date: Date, referenceDate?: Date): boolean {
  const reference = referenceDate || new Date();
  const yesterday = new Date(reference);
  yesterday.setDate(yesterday.getDate() - 1);

  return (
    date.getDate() === yesterday.getDate() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getFullYear() === yesterday.getFullYear()
  );
}

/**
 * Get day of week name
 */
export function getDayOfWeek(date?: Date): string {
  const d = date || new Date();
  return d.toLocaleDateString('en-US', {
    timeZone: 'America/Chicago',
    weekday: 'long'
  });
}
