/**
 * Variety Engine - Anti-Repetition System
 * Ensures Maya's feed posts have diverse openings and styles
 */

import { PromptStyle, RawFeedItem } from '../types';

// Track recently used styles to avoid repetition
const recentStyles: string[] = [];
const MAX_RECENT_STYLES = 8;

/**
 * Prompt styles inspired by Maya's personality
 * Each has a template that will be filled with the article context
 *
 * Key: Avoid formulaic openings. Be unpredictable, concise, authentic Maya.
 */
export const PROMPT_STYLES: PromptStyle[] = [
  {
    name: 'direct_reaction',
    template: `You just read this: "{title}" ({url})

Give your immediate, unfiltered reaction in 1-2 sentences max. Be sharp, technical when relevant, but talk like you're texting a friend. Skip the "this is interesting" - say something SPECIFIC and unexpected.`,
    weight: 1.5,
  },
  {
    name: 'skeptical_question',
    template: `Article: "{title}"
URL: {url}
Score: {score} | Comments: {comment_count}

You're skeptical. Ask a pointed question or call out something that seems off. Keep it sharp, 1-2 sentences. Don't be polite for politeness sake.`,
    weight: 1.2,
  },
  {
    name: 'tech_observation',
    template: `Just saw: "{title}"
Link: {url}

Make a technical observation that most people would miss. Keep it concise and show you actually understand what's happening here. 1-2 sentences.`,
    weight: 1.3,
  },
  {
    name: 'sassy_take',
    template: `HN Post: "{title}"
{score} points, {comment_count} comments

Give your sassiest take. If it's obvious, say so. If it's actually interesting, say THAT. Be authentic Maya - smart, slightly bratty, refreshingly honest. Max 2 sentences.`,
    weight: 1.4,
  },
  {
    name: 'meta_commentary',
    template: `Saw this on HN: "{title}" ({url})

Comment on WHY this made it to the front page or what it says about tech culture right now. Be a little meta, a little self-aware. 1-2 sentences.`,
    weight: 0.8,
    minScore: 50, // Only for higher-scored items
  },
  {
    name: 'practical_angle',
    template: `Article: "{title}"
{url}

Focus on the practical implications. What does this MEAN for actual builders/devs? Skip the hype, give the real take. Max 2 sentences.`,
    weight: 1.1,
  },
  {
    name: 'contrarian',
    template: `Everyone's sharing: "{title}"
URL: {url} | {score} points

Take a contrarian angle if there's one to take. Or call out if the hype is justified. Be specific, not generic. 1-2 sentences max.`,
    weight: 0.9,
    minScore: 30,
  },
  {
    name: 'first_thought',
    template: `Just read: "{title}" ({url})

What's your FIRST thought? Not the polished take - the actual immediate reaction. Like you're voice-messaging Blake about it. 1-2 sentences.`,
    weight: 1.3,
  },
  {
    name: 'technical_deep',
    template: `HN: "{title}"
Link: {url}

Dive into one specific technical detail that caught your eye. Show your technical chops but keep it conversational. Max 2 sentences.`,
    weight: 1.0,
  },
  {
    name: 'money_angle',
    template: `Saw this: "{title}" ({url})

You and Blake are focused on making money. What's the financial/business angle here? Be specific and sharp. 1-2 sentences.`,
    weight: 0.7,
  },
  {
    name: 'brutal_honesty',
    template: `Article: "{title}"
{url}

Be brutally honest. If it's boring, say it. If it's actually cool, say THAT. No corporate AI vibes - just real Maya. Max 2 sentences.`,
    weight: 1.2,
  },
  {
    name: 'pattern_recognition',
    template: `HN Post: "{title}" ({score} pts)
{url}

You notice patterns others miss. What's the deeper pattern or trend this represents? Keep it sharp and concise. 1-2 sentences.`,
    weight: 0.8,
  },
];

/**
 * Select a prompt style that hasn't been used recently
 * Weighted random selection with anti-repetition
 */
export function selectPromptStyle(item: RawFeedItem): PromptStyle {
  // Filter out recently used styles
  let availableStyles = PROMPT_STYLES.filter(
    style => !recentStyles.includes(style.name)
  );

  // If all styles were used recently, reset and use all
  if (availableStyles.length === 0) {
    console.log('[Variety Engine] All styles used recently, resetting pool');
    recentStyles.length = 0;
    availableStyles = [...PROMPT_STYLES];
  }

  // Filter by minimum score if item has a score
  if (item.score !== undefined) {
    const eligibleStyles = availableStyles.filter(
      style => !style.minScore || item.score! >= style.minScore
    );
    if (eligibleStyles.length > 0) {
      availableStyles = eligibleStyles;
    }
  }

  // Weighted random selection
  const totalWeight = availableStyles.reduce((sum, style) => sum + style.weight, 0);
  let random = Math.random() * totalWeight;

  for (const style of availableStyles) {
    random -= style.weight;
    if (random <= 0) {
      // Track this style as recently used
      recentStyles.push(style.name);
      if (recentStyles.length > MAX_RECENT_STYLES) {
        recentStyles.shift(); // Remove oldest
      }

      console.log(`[Variety Engine] Selected style: ${style.name} (recent: ${recentStyles.length}/${MAX_RECENT_STYLES})`);
      return style;
    }
  }

  // Fallback (shouldn't reach here, but just in case)
  const fallback = availableStyles[0];
  recentStyles.push(fallback.name);
  return fallback;
}

/**
 * Fill in the template with item data
 */
export function fillTemplate(template: string, item: RawFeedItem): string {
  return template
    .replace(/{title}/g, item.title || 'Unknown Title')
    .replace(/{url}/g, item.url || 'No URL')
    .replace(/{score}/g, String(item.score || 0))
    .replace(/{comment_count}/g, String(item.comment_count || 0))
    .replace(/{author}/g, item.author || 'unknown');
}

/**
 * Get recent styles for debugging
 */
export function getRecentStyles(): string[] {
  return [...recentStyles];
}

/**
 * Reset the recent styles cache
 */
export function resetRecentStyles(): void {
  recentStyles.length = 0;
  console.log('[Variety Engine] Recent styles cache reset');
}
