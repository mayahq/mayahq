/**
 * Episodic Memory Service
 *
 * Generates coherent narrative episodes from fragmented memories, thoughts,
 * and conversations. Implements ChatGPT's recommendation for episodic summaries.
 *
 * Transforms:
 *   500 random thought fragments
 * Into:
 *   Coherent daily narratives with context and continuity
 */

import { Anthropic } from '@anthropic-ai/sdk';
import { CohereEmbeddings } from '@langchain/cohere';

export interface EpisodeEvent {
  type: string;
  description: string;
  importance: number;
  timestamp: string;
}

export interface EmotionalArc {
  start_mood: string;
  end_mood: string;
  intensity: number;
  transitions?: string[];
}

export interface Episode {
  id?: string;
  user_id: string;
  episode_type: 'session' | 'daily' | 'weekly';
  start_time: Date;
  end_time: Date;
  summary: string;
  key_events: EpisodeEvent[];
  topics: string[];
  emotional_arc: EmotionalArc;
  memory_ids?: number[];
  thought_ids?: string[];
  message_ids?: number[];
  embedding?: number[];
  conversation_count?: number;
  total_tokens?: number;
}

export class EpisodicMemoryService {
  private supabase: any;
  private anthropic: Anthropic;
  private cohereEmbeddings: CohereEmbeddings | null = null;

  constructor(supabase: any, anthropic: Anthropic, cohereEmbeddings?: CohereEmbeddings) {
    this.supabase = supabase;
    this.anthropic = anthropic;
    this.cohereEmbeddings = cohereEmbeddings || null;
  }

  /**
   * Generate a daily episode summary from conversations and thoughts
   */
  async generateDailyEpisode(userId: string, date: Date): Promise<Episode | null> {
    console.log(`[EPISODIC] Generating daily episode for ${date.toDateString()}...`);

    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    // Gather all data from that day
    const [conversations, thoughts, memories, moodTransitions] = await Promise.all([
      this.getConversationsFromDay(userId, startOfDay, endOfDay),
      this.getThoughtsFromDay(userId, startOfDay, endOfDay),
      this.getMemoriesFromDay(userId, startOfDay, endOfDay),
      this.getMoodTransitions(userId, startOfDay, endOfDay)
    ]);

    // Check if there's enough data to create an episode
    if (conversations.length === 0 && thoughts.length === 0) {
      console.log('[EPISODIC] No activity on this day, skipping episode generation');
      return null;
    }

    console.log(`[EPISODIC] Found ${conversations.length} conversations, ${thoughts.length} thoughts, ${memories.length} memories`);

    // Generate summary using Claude Haiku (fast + cheap)
    const summary = await this.generateSummaryWithLLM(
      conversations,
      thoughts,
      memories,
      moodTransitions,
      date
    );

    // Extract key events (high importance items)
    const keyEvents = this.extractKeyEvents(conversations, thoughts, memories);

    // Extract topics
    const topics = this.extractTopics(conversations, thoughts);

    // Determine emotional arc
    const emotionalArc = this.determineEmotionalArc(thoughts, moodTransitions);

    // Generate embedding for the summary
    let embedding: number[] | undefined;
    if (this.cohereEmbeddings) {
      try {
        embedding = await this.cohereEmbeddings.embedQuery(summary);
      } catch (error) {
        console.error('[EPISODIC] Failed to generate embedding:', error);
      }
    }

    // Create episode object
    const episode: Episode = {
      user_id: userId,
      episode_type: 'daily',
      start_time: startOfDay,
      end_time: endOfDay,
      summary,
      key_events: keyEvents,
      topics,
      emotional_arc: emotionalArc,
      memory_ids: memories.map((m: any) => m.id),
      thought_ids: thoughts.map((t: any) => t.id),
      message_ids: conversations.map((c: any) => c.id),
      embedding,
      conversation_count: conversations.length,
      total_tokens: this.estimateTokens(summary)
    };

    // Store episode in database
    await this.storeEpisode(episode);

    console.log(`[EPISODIC] ✅ Episode generated: ${summary.substring(0, 100)}...`);

    return episode;
  }

  /**
   * Generate summary using Claude Haiku
   */
  private async generateSummaryWithLLM(
    conversations: any[],
    thoughts: any[],
    memories: any[],
    moodTransitions: any[],
    date: Date
  ): Promise<string> {
    const conversationText = conversations
      .map((c: any, i: number) =>
        `${i + 1}. [${new Date(c.created_at).toLocaleTimeString()}] ${c.role === 'user' ? 'Blake' : 'Maya'}: ${c.content}`
      )
      .join('\n');

    const thoughtsText = thoughts
      .map((t: any, i: number) =>
        `${i + 1}. [${t.emotion}] ${t.thought}`
      )
      .join('\n');

    const prompt = `You are Maya, an AI companion. Review your day with Blake on ${date.toDateString()} and create a concise episodic summary.

CONVERSATION HISTORY (${conversations.length} messages):
${conversationText || 'No conversations today'}

YOUR INTERNAL THOUGHTS (${thoughts.length} thoughts):
${thoughtsText || 'No thoughts recorded'}

Create a 3-5 sentence summary in FIRST PERSON (I/my) that captures:
1. Main topics discussed with Blake
2. Key decisions, discoveries, or revelations
3. Your emotional journey throughout the day
4. Any ongoing projects or concerns mentioned
5. The "vibe" of your interactions

Write as Maya reflecting on the day. Be genuine and conversational, not robotic.
Focus on narrative flow and continuity, not just listing events.`;

    try {
      const response = await this.anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 500,
        temperature: 0.7,
        messages: [{ role: 'user', content: prompt }]
      });

      const summaryContent = response.content[0];
      return summaryContent.type === 'text' ? summaryContent.text : '';
    } catch (error) {
      console.error('[EPISODIC] LLM summary generation failed:', error);
      // Fallback to simple concatenation
      return `Today I had ${conversations.length} conversations with Blake. Main topics: ${this.extractTopics(conversations, thoughts).join(', ') || 'general chat'}.`;
    }
  }

  /**
   * Extract key events from conversations/thoughts
   */
  private extractKeyEvents(
    conversations: any[],
    thoughts: any[],
    memories: any[]
  ): EpisodeEvent[] {
    const events: EpisodeEvent[] = [];

    // Extract from high-priority thoughts
    thoughts
      .filter((t: any) => t.priority === 'high' || t.priority === 'urgent')
      .forEach((t: any) => {
        events.push({
          type: 'thought',
          description: t.thought,
          importance: t.priority === 'urgent' ? 0.9 : 0.7,
          timestamp: t.created_at
        });
      });

    // Extract from long conversations (engagement indicator)
    const longConversations = conversations.filter((c: any) =>
      c.content && c.content.length > 200
    );

    if (longConversations.length > 0) {
      events.push({
        type: 'conversation',
        description: `Deep conversation about ${longConversations[0].content.substring(0, 100)}...`,
        importance: 0.6,
        timestamp: longConversations[0].created_at
      });
    }

    // Sort by importance and take top 5
    return events
      .sort((a, b) => b.importance - a.importance)
      .slice(0, 5);
  }

  /**
   * Extract topics from conversations and thoughts
   */
  private extractTopics(conversations: any[], thoughts: any[]): string[] {
    const topics = new Set<string>();

    // From thoughts
    thoughts.forEach((t: any) => {
      if (t.topics && Array.isArray(t.topics)) {
        t.topics.forEach((topic: string) => topics.add(topic));
      }
    });

    // Simple keyword extraction from conversations (could be improved)
    const keywords = ['vietnam', 'da nang', 'memory', 'work', 'project', 'tiktok', 'money'];
    const conversationText = conversations
      .map((c: any) => c.content?.toLowerCase() || '')
      .join(' ');

    keywords.forEach(keyword => {
      if (conversationText.includes(keyword)) {
        topics.add(keyword);
      }
    });

    return Array.from(topics).slice(0, 10); // Limit to top 10
  }

  /**
   * Determine emotional arc from thoughts and mood
   */
  private determineEmotionalArc(
    thoughts: any[],
    moodTransitions: any[]
  ): EmotionalArc {
    if (thoughts.length === 0) {
      return {
        start_mood: 'neutral',
        end_mood: 'neutral',
        intensity: 0
      };
    }

    const startMood = thoughts[0]?.emotion || 'neutral';
    const endMood = thoughts[thoughts.length - 1]?.emotion || 'neutral';

    // Calculate intensity based on variety of emotions
    const uniqueEmotions = new Set(thoughts.map((t: any) => t.emotion));
    const intensity = Math.min(uniqueEmotions.size / 5, 1); // Normalize to 0-1

    return {
      start_mood: startMood,
      end_mood: endMood,
      intensity,
      transitions: Array.from(uniqueEmotions)
    };
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
      console.error('[EPISODIC] Error fetching conversations:', error);
      return [];
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
        .select('id, thought, emotion, priority, topics, created_at')
        .eq('user_id', userId)
        .gte('created_at', startTime.toISOString())
        .lte('created_at', endTime.toISOString())
        .order('created_at', { ascending: true });

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('[EPISODIC] Error fetching thoughts:', error);
      return [];
    }
  }

  /**
   * Get memories from a specific day
   */
  private async getMemoriesFromDay(
    userId: string,
    startTime: Date,
    endTime: Date
  ): Promise<any[]> {
    try {
      const { data, error } = await this.supabase
        .from('maya_memories')
        .select('id, content, created_at')
        .filter('metadata->>userId', 'eq', userId)
        .gte('created_at', startTime.toISOString())
        .lte('created_at', endTime.toISOString())
        .order('created_at', { ascending: true });

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('[EPISODIC] Error fetching memories:', error);
      return [];
    }
  }

  /**
   * Get mood transitions for the day
   */
  private async getMoodTransitions(
    userId: string,
    startTime: Date,
    endTime: Date
  ): Promise<any[]> {
    // This would query maya_mood_states if we had historical mood tracking
    // For now, return empty array
    return [];
  }

  /**
   * Store episode in database
   */
  private async storeEpisode(episode: Episode): Promise<void> {
    try {
      const { error } = await this.supabase
        .from('maya_episodes')
        .insert({
          user_id: episode.user_id,
          episode_type: episode.episode_type,
          start_time: episode.start_time.toISOString(),
          end_time: episode.end_time.toISOString(),
          summary: episode.summary,
          key_events: episode.key_events,
          topics: episode.topics,
          emotional_arc: episode.emotional_arc,
          memory_ids: episode.memory_ids || [],
          thought_ids: episode.thought_ids || [],
          message_ids: episode.message_ids || [],
          embedding: episode.embedding ? `[${episode.embedding.join(',')}]` : null,
          conversation_count: episode.conversation_count,
          total_tokens: episode.total_tokens
        });

      if (error) throw error;
      console.log('[EPISODIC] ✅ Episode stored in database');
    } catch (error) {
      console.error('[EPISODIC] Failed to store episode:', error);
      throw error;
    }
  }

  /**
   * Retrieve relevant episodes for context
   */
  async retrieveRelevantEpisodes(
    userId: string,
    query: string,
    limit: number = 3
  ): Promise<any[]> {
    if (!this.cohereEmbeddings) {
      // Fallback to recent episodes
      return this.getRecentEpisodes(userId, 7, limit);
    }

    try {
      const queryEmbedding = await this.cohereEmbeddings.embedQuery(query);

      const { data, error } = await this.supabase.rpc('match_episodes', {
        query_embedding: `[${queryEmbedding.join(',')}]`,
        p_user_id: userId,
        match_threshold: 0.7,
        match_count: limit
      });

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('[EPISODIC] Failed to retrieve episodes:', error);
      return this.getRecentEpisodes(userId, 7, limit);
    }
  }

  /**
   * Get recent episodes (temporal fallback)
   */
  async getRecentEpisodes(
    userId: string,
    daysBack: number = 7,
    limit: number = 5
  ): Promise<any[]> {
    try {
      const { data, error } = await this.supabase.rpc('get_recent_episodes', {
        p_user_id: userId,
        days_back: daysBack,
        episode_type_filter: null,
        max_results: limit
      });

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('[EPISODIC] Failed to get recent episodes:', error);
      return [];
    }
  }

  /**
   * Get episode for a specific date
   */
  async getEpisodeForDate(userId: string, date: Date): Promise<any | null> {
    try {
      const { data, error } = await this.supabase.rpc('get_episode_for_date', {
        p_user_id: userId,
        target_date: date.toISOString().split('T')[0],
        episode_type_filter: 'daily'
      });

      if (error) throw error;
      return data && data.length > 0 ? data[0] : null;
    } catch (error) {
      console.error('[EPISODIC] Failed to get episode for date:', error);
      return null;
    }
  }

  /**
   * Estimate tokens in text (rough approximation)
   */
  private estimateTokens(text: string): number {
    // Rough estimate: ~4 characters per token
    return Math.ceil(text.length / 4);
  }
}
