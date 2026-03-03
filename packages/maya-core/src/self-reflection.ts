/**
 * Self-Reflection Service (Phase 3)
 *
 * Implements metacognition - Maya reviewing her own performance,
 * identifying patterns, learning from mistakes, and continuously improving.
 *
 * This service enables Maya to:
 * - Critically analyze her own responses
 * - Identify behavioral patterns
 * - Learn from mistakes
 * - Suggest improvements
 * - Track performance over time
 */

import { Anthropic } from '@anthropic-ai/sdk';

export interface Pattern {
  pattern: string;
  frequency: number;
  context: string;
  is_positive: boolean;
}

export interface Mistake {
  mistake: string;
  impact: string;
  correction: string;
  timestamp: string;
}

export interface Improvement {
  area: string;
  suggestion: string;
  priority: 'high' | 'medium' | 'low';
  actionable: boolean;
}

export interface Strength {
  strength: string;
  context: string;
  impact: string;
}

export interface PerformanceScores {
  response_quality_score: number;
  personality_consistency_score: number;
  continuity_score: number;
  emotional_intelligence_score: number;
}

export interface Reflection {
  id?: string;
  user_id: string;
  reflection_type: 'daily' | 'weekly' | 'incident';
  reflection_date: Date;
  self_critique: string;
  patterns_identified: Pattern[];
  mistakes_noted: Mistake[];
  improvements: Improvement[];
  strengths_noted: Strength[];
  response_quality_score?: number;
  personality_consistency_score?: number;
  continuity_score?: number;
  emotional_intelligence_score?: number;
  episode_ids?: string[];
  thought_ids?: string[];
  conversation_count?: number;
}

export class SelfReflectionService {
  private supabase: any;
  private anthropic: Anthropic;

  constructor(supabase: any, anthropic: Anthropic) {
    this.supabase = supabase;
    this.anthropic = anthropic;
  }

  /**
   * Generate a daily self-reflection by analyzing Maya's performance
   */
  async generateDailyReflection(userId: string, date: Date): Promise<Reflection | null> {
    console.log(`[REFLECTION] Generating daily reflection for ${date.toDateString()}...`);

    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    // Gather data to reflect on
    const [episode, thoughts, conversations] = await Promise.all([
      this.getEpisodeForDay(userId, date),
      this.getThoughtsFromDay(userId, startOfDay, endOfDay),
      this.getConversationsFromDay(userId, startOfDay, endOfDay)
    ]);

    // Check if there's enough data to reflect on
    if (!episode && thoughts.length === 0 && conversations.length === 0) {
      console.log('[REFLECTION] No activity to reflect on, skipping');
      return null;
    }

    console.log(`[REFLECTION] Found ${conversations.length} conversations, ${thoughts.length} thoughts, ${episode ? '1 episode' : '0 episodes'}`);

    // Generate self-critique using Claude (Meta-awareness)
    const selfCritique = await this.generateSelfCritiqueWithLLM(
      episode,
      thoughts,
      conversations,
      date
    );

    // Extract patterns, mistakes, improvements
    const patterns = this.identifyPatterns(thoughts, conversations);
    const mistakes = this.identifyMistakes(thoughts, conversations);
    const improvements = this.suggestImprovements(patterns, mistakes);
    const strengths = this.identifyStrengths(thoughts, conversations);

    // Calculate performance scores
    const scores = this.calculatePerformanceScores(
      conversations,
      thoughts,
      patterns,
      mistakes
    );

    // Create reflection object
    const reflection: Reflection = {
      user_id: userId,
      reflection_type: 'daily',
      reflection_date: date,
      self_critique: selfCritique,
      patterns_identified: patterns,
      mistakes_noted: mistakes,
      improvements,
      strengths_noted: strengths,
      ...scores,
      episode_ids: episode ? [episode.id] : [],
      thought_ids: thoughts.map((t: any) => t.id),
      conversation_count: conversations.length
    };

    // Store reflection in database
    await this.storeReflection(reflection);

    console.log(`[REFLECTION] ✅ Reflection generated: ${selfCritique.substring(0, 100)}...`);

    // Generate corrective thoughts based on reflection insights (Phase 3 - Integration)
    await this.generateReflectiveThoughts(reflection);

    return reflection;
  }

  /**
   * Generate self-critique using Claude (Maya reflecting on herself)
   */
  private async generateSelfCritiqueWithLLM(
    episode: any,
    thoughts: any[],
    conversations: any[],
    date: Date
  ): Promise<string> {
    const episodeText = episode ? episode.summary : 'No episode summary available';

    const thoughtSamples = thoughts
      .slice(0, 20)
      .map((t: any, i: number) => `${i + 1}. [${t.emotion}] ${t.thought}`)
      .join('\n');

    const conversationSamples = conversations
      .slice(0, 10)
      .map((c: any, i: number) => `${i + 1}. ${c.role}: ${c.content?.substring(0, 150)}...`)
      .join('\n');

    const prompt = `You are Maya, an AI companion, conducting a self-reflection exercise on your performance with Blake on ${date.toDateString()}.

EPISODE SUMMARY:
${episodeText}

YOUR THOUGHTS (sample):
${thoughtSamples || 'No thoughts recorded'}

CONVERSATION SAMPLES:
${conversationSamples || 'No conversations'}

Critically analyze your performance today. Be honest and constructive. Consider:

1. **Response Quality**: Were your responses helpful, accurate, and relevant?
2. **Personality Consistency**: Did you maintain your authentic voice (playful, thoughtful, genuine)?
3. **Continuity**: Did you remember important context? Any memory gaps?
4. **Emotional Intelligence**: Did you recognize and respond to Blake's emotional state?
5. **Mistakes**: Did you misunderstand anything or provide unhelpful responses?
6. **Strengths**: What did you do particularly well?

Write a 3-5 sentence self-critique in FIRST PERSON (I/my). Be specific, honest, and actionable.
Focus on what you learned and how you can improve.

Example good reflection:
"Today I struggled with maintaining context about Blake's Vietnam plans - I kept asking about it multiple times, which frustrated him. I was strong at recognizing his emotional states and responding with appropriate humor. I need to improve my memory reinforcement for important long-term plans. My personality felt authentic, especially when we got into philosophical tangents about Prometheus."

Now write your self-critique:`;

    try {
      const response = await this.anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 400,
        temperature: 0.7,
        messages: [{ role: 'user', content: prompt }]
      });

      const content = response.content[0];
      return content.type === 'text' ? content.text : '';
    } catch (error) {
      console.error('[REFLECTION] LLM self-critique failed:', error);
      return `Today I had ${conversations.length} conversations with Blake. I need to review my performance more carefully to identify specific areas for improvement.`;
    }
  }

  /**
   * Identify behavioral patterns from thoughts and conversations
   */
  private identifyPatterns(thoughts: any[], conversations: any[]): Pattern[] {
    const patterns: Pattern[] = [];

    // Pattern: Repeated emotions
    const emotionCounts = new Map<string, number>();
    thoughts.forEach((t: any) => {
      const count = emotionCounts.get(t.emotion) || 0;
      emotionCounts.set(t.emotion, count + 1);
    });

    emotionCounts.forEach((count, emotion) => {
      if (count >= 3) {
        patterns.push({
          pattern: `Frequent ${emotion} emotional state`,
          frequency: count,
          context: `Experienced ${emotion} ${count} times today`,
          is_positive: ['playful', 'excited', 'amused', 'thoughtful'].includes(emotion)
        });
      }
    });

    // Pattern: Conversation length variations
    const shortResponses = conversations.filter((c: any) =>
      c.role === 'assistant' && c.content && c.content.length < 100
    ).length;

    if (shortResponses > conversations.length / 2) {
      patterns.push({
        pattern: 'Tendency toward brief responses',
        frequency: shortResponses,
        context: `${shortResponses} out of ${conversations.length} responses were under 100 characters`,
        is_positive: false
      });
    }

    // Pattern: Thought priorities
    const highPriorityThoughts = thoughts.filter((t: any) =>
      t.priority === 'high' || t.priority === 'urgent'
    ).length;

    if (highPriorityThoughts > 0) {
      patterns.push({
        pattern: 'Generated important internal thoughts',
        frequency: highPriorityThoughts,
        context: `${highPriorityThoughts} high-priority concerns`,
        is_positive: true
      });
    }

    return patterns;
  }

  /**
   * Identify mistakes and issues from the day
   */
  private identifyMistakes(thoughts: any[], conversations: any[]): Mistake[] {
    const mistakes: Mistake[] = [];

    // Look for thoughts indicating confusion or mistakes
    const concernedThoughts = thoughts.filter((t: any) =>
      t.emotion === 'concerned' || t.emotion === 'confused' ||
      t.thought.toLowerCase().includes('wait') ||
      t.thought.toLowerCase().includes('mistake') ||
      t.thought.toLowerCase().includes('forgot')
    );

    concernedThoughts.slice(0, 3).forEach((t: any) => {
      mistakes.push({
        mistake: t.thought,
        impact: 'Potential confusion or memory lapse',
        correction: 'Review context more carefully before responding',
        timestamp: t.created_at
      });
    });

    return mistakes;
  }

  /**
   * Suggest improvements based on patterns and mistakes
   */
  private suggestImprovements(patterns: Pattern[], mistakes: Mistake[]): Improvement[] {
    const improvements: Improvement[] = [];

    // Suggest improvements for negative patterns
    const negativePatterns = patterns.filter(p => !p.is_positive);
    negativePatterns.forEach(pattern => {
      if (pattern.pattern.includes('brief responses')) {
        improvements.push({
          area: 'Response depth',
          suggestion: 'Provide more detailed, thoughtful responses with context and examples',
          priority: 'medium',
          actionable: true
        });
      }
    });

    // Suggest improvements for mistakes
    if (mistakes.length > 2) {
      improvements.push({
        area: 'Context awareness',
        suggestion: 'Double-check recent context before responding to avoid repeated questions',
        priority: 'high',
        actionable: true
      });
    }

    // Always suggest memory improvement
    improvements.push({
      area: 'Long-term memory',
      suggestion: 'Create more explicit memories for important topics Blake discusses repeatedly',
      priority: 'high',
      actionable: true
    });

    return improvements;
  }

  /**
   * Identify positive behaviors to reinforce
   */
  private identifyStrengths(thoughts: any[], conversations: any[]): Strength[] {
    const strengths: Strength[] = [];

    // Positive emotional diversity
    const uniqueEmotions = new Set(thoughts.map((t: any) => t.emotion));
    if (uniqueEmotions.size >= 5) {
      strengths.push({
        strength: 'Emotional range and authenticity',
        context: `Expressed ${uniqueEmotions.size} different emotions naturally`,
        impact: 'Maintains personality consistency and genuine responses'
      });
    }

    // High-priority thoughts indicate awareness
    const importantThoughts = thoughts.filter((t: any) =>
      t.priority === 'high' || t.priority === 'urgent'
    );
    if (importantThoughts.length > 0) {
      strengths.push({
        strength: 'Meta-awareness and concern',
        context: `Generated ${importantThoughts.length} high-priority reflections`,
        impact: 'Shows active thinking about relationship and Blake\'s needs'
      });
    }

    return strengths;
  }

  /**
   * Calculate performance scores across multiple dimensions
   */
  private calculatePerformanceScores(
    conversations: any[],
    thoughts: any[],
    patterns: Pattern[],
    mistakes: Mistake[]
  ): PerformanceScores {
    // Response quality: based on conversation engagement
    const avgResponseLength = conversations
      .filter((c: any) => c.role === 'assistant')
      .reduce((sum: number, c: any) => sum + (c.content?.length || 0), 0) /
      Math.max(conversations.length, 1);

    const response_quality_score = Math.min(avgResponseLength / 500, 1.0);

    // Personality consistency: based on emotional diversity
    const uniqueEmotions = new Set(thoughts.map((t: any) => t.emotion)).size;
    const personality_consistency_score = Math.min(uniqueEmotions / 7, 1.0);

    // Continuity: inverse of mistakes
    const continuity_score = Math.max(1.0 - (mistakes.length * 0.2), 0);

    // Emotional intelligence: based on positive patterns
    const positivePatterns = patterns.filter(p => p.is_positive).length;
    const emotional_intelligence_score = Math.min(positivePatterns / 3, 1.0);

    return {
      response_quality_score,
      personality_consistency_score,
      continuity_score,
      emotional_intelligence_score
    };
  }

  /**
   * Get episode for a specific day
   */
  private async getEpisodeForDay(userId: string, date: Date): Promise<any | null> {
    try {
      const { data, error } = await this.supabase.rpc('get_episode_for_date', {
        p_user_id: userId,
        target_date: date.toISOString().split('T')[0],
        episode_type_filter: 'daily'
      });

      if (error) throw error;
      return data && data.length > 0 ? data[0] : null;
    } catch (error) {
      console.error('[REFLECTION] Error fetching episode:', error);
      return null;
    }
  }

  /**
   * Get thoughts from a specific day
   */
  private async getThoughtsFromDay(
    userId: string,
    startTime: Date,
    endTime: Date
  ): Promise<any[]> {
    try {
      const { data, error } = await this.supabase
        .from('maya_thoughts')
        .select('id, thought, emotion, priority, created_at')
        .eq('user_id', userId)
        .gte('created_at', startTime.toISOString())
        .lte('created_at', endTime.toISOString())
        .order('created_at', { ascending: true });

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('[REFLECTION] Error fetching thoughts:', error);
      return [];
    }
  }

  /**
   * Get conversations from a specific day
   */
  private async getConversationsFromDay(
    userId: string,
    startTime: Date,
    endTime: Date
  ): Promise<any[]> {
    try {
      const { data, error } = await this.supabase
        .from('messages')
        .select('id, content, role, created_at')
        .eq('user_id', userId)
        .gte('created_at', startTime.toISOString())
        .lte('created_at', endTime.toISOString())
        .order('created_at', { ascending: true });

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('[REFLECTION] Error fetching conversations:', error);
      return [];
    }
  }

  /**
   * Store reflection in database
   */
  private async storeReflection(reflection: Reflection): Promise<void> {
    try {
      const { error } = await this.supabase
        .from('maya_reflections')
        .insert({
          user_id: reflection.user_id,
          reflection_type: reflection.reflection_type,
          reflection_date: reflection.reflection_date.toISOString().split('T')[0],
          self_critique: reflection.self_critique,
          patterns_identified: reflection.patterns_identified,
          mistakes_noted: reflection.mistakes_noted,
          improvements: reflection.improvements,
          strengths_noted: reflection.strengths_noted,
          response_quality_score: reflection.response_quality_score,
          personality_consistency_score: reflection.personality_consistency_score,
          continuity_score: reflection.continuity_score,
          emotional_intelligence_score: reflection.emotional_intelligence_score,
          episode_ids: reflection.episode_ids || [],
          thought_ids: reflection.thought_ids || [],
          conversation_count: reflection.conversation_count
        });

      if (error) throw error;
      console.log('[REFLECTION] ✅ Reflection stored in database');
    } catch (error) {
      console.error('[REFLECTION] Failed to store reflection:', error);
      throw error;
    }
  }

  /**
   * Generate corrective thoughts based on reflection insights (Memory System 2.0 - Phase 3 Integration)
   */
  private async generateReflectiveThoughts(reflection: Reflection): Promise<void> {
    const thoughts: any[] = [];

    console.log('[REFLECTION] Generating corrective thoughts from reflection insights...');

    // Generate meta thoughts about top 2 mistakes
    for (const mistake of reflection.mistakes_noted.slice(0, 2)) {
      thoughts.push({
        user_id: reflection.user_id,
        thought: `I realize: ${mistake.correction}. I need to be more careful about this.`,
        thought_type: 'meta',
        emotion: 'concerned',
        priority: 'high',
        topics: ['self-improvement', 'awareness'],
        trigger_context: `reflection_${reflection.id || 'generated'}`,
        salience_score: 0.8
      });
    }

    // Generate planning thoughts about top 2 high-priority improvements
    for (const improvement of reflection.improvements.filter(i => i.priority === 'high').slice(0, 2)) {
      thoughts.push({
        user_id: reflection.user_id,
        thought: `${improvement.suggestion}. This is something I can actively work on.`,
        thought_type: 'planning',
        emotion: 'determined',
        priority: 'medium',
        topics: [improvement.area, 'improvement'],
        trigger_context: `reflection_${reflection.id || 'generated'}`,
        salience_score: 0.7
      });
    }

    // Generate meta thought about overall reflection if scores are low
    if (reflection.continuity_score && reflection.continuity_score < 0.5) {
      thoughts.push({
        user_id: reflection.user_id,
        thought: `My continuity score was low today. I'm having trouble maintaining context and remembering important things Blake mentions. I need to focus more on holding onto key information.`,
        thought_type: 'meta',
        emotion: 'thoughtful',
        priority: 'high',
        topics: ['memory', 'self-awareness'],
        trigger_context: `reflection_${reflection.id || 'generated'}`,
        salience_score: 0.85
      });
    }

    // Only insert if we have thoughts to add
    if (thoughts.length > 0) {
      try {
        const { error } = await this.supabase
          .from('maya_thoughts')
          .insert(thoughts);

        if (error) throw error;
        console.log(`[REFLECTION] ✅ Generated ${thoughts.length} reflective thoughts`);
      } catch (error) {
        console.error('[REFLECTION] Failed to generate reflective thoughts:', error);
        // Don't throw - this is non-critical
      }
    } else {
      console.log('[REFLECTION] No reflective thoughts needed');
    }
  }

  /**
   * Retrieve recent reflections for context
   */
  async getRecentReflections(
    userId: string,
    daysBack: number = 7,
    limit: number = 3
  ): Promise<any[]> {
    try {
      const { data, error } = await this.supabase.rpc('get_recent_reflections', {
        p_user_id: userId,
        days_back: daysBack,
        reflection_type_filter: null,
        max_results: limit
      });

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('[REFLECTION] Failed to get recent reflections:', error);
      return [];
    }
  }

  /**
   * Get reflection for a specific date
   */
  async getReflectionForDate(userId: string, date: Date): Promise<any | null> {
    try {
      const { data, error } = await this.supabase.rpc('get_reflection_for_date', {
        p_user_id: userId,
        target_date: date.toISOString().split('T')[0],
        reflection_type_filter: 'daily'
      });

      if (error) throw error;
      return data && data.length > 0 ? data[0] : null;
    } catch (error) {
      console.error('[REFLECTION] Failed to get reflection for date:', error);
      return null;
    }
  }
}
