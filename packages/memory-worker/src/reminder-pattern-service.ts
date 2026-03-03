import { SupabaseClient } from '@supabase/supabase-js';
import { ReminderPattern, ReminderContext } from './reminder-service';

/**
 * Pattern Learning Service
 * Analyzes user behavior and conversation patterns to create intelligent reminder triggers
 */
export class ReminderPatternService {
  private supabase: SupabaseClient;
  private mayaSystemUserId: string;

  constructor(supabase: SupabaseClient, mayaSystemUserId: string) {
    this.supabase = supabase;
    this.mayaSystemUserId = mayaSystemUserId;
  }

  /**
   * Analyze user patterns and create/update reminder patterns
   */
  public async analyzeAndUpdatePatterns(userId: string): Promise<void> {
    console.log(`[PatternService] Analyzing patterns for user ${userId}`);
    
    try {
      // Analyze different types of patterns
      await this.analyzeWorkPatterns(userId);
      await this.analyzeStressPatterns(userId);
      await this.analyzeMilestonePatterns(userId);
      await this.analyzeConversationPatterns(userId);
      await this.analyzeTimeBasedPatterns(userId);
      
      console.log(`[PatternService] Pattern analysis complete for user ${userId}`);
    } catch (error) {
      console.error(`[PatternService] Error analyzing patterns for user ${userId}:`, error);
    }
  }

  /**
   * Analyze work-related patterns (working late, stress days, etc.)
   */
  private async analyzeWorkPatterns(userId: string): Promise<void> {
    try {
      // Look for work-related contexts in the last 30 days
      const { data: workContexts, error } = await this.supabase
        .from('maya_reminder_contexts')
        .select('*')
        .eq('user_id', userId)
        .eq('context_type', 'work_pattern')
        .gte('detected_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
        .order('detected_at', { ascending: true });

      if (error || !workContexts || workContexts.length === 0) {
        return;
      }

      // Analyze Thursday work patterns specifically
      const thursdayWorkLate = workContexts.filter(ctx => {
        const date = new Date(ctx.detected_at);
        return date.getDay() === 4 && // Thursday
               ctx.context_value.type === 'working_late';
      });

      if (thursdayWorkLate.length >= 2) {
        // User has a pattern of working late on Thursdays
        await this.createOrUpdatePattern({
          user_id: userId,
          pattern_type: 'work_late_thursday',
          pattern_name: 'Thursday Late Work Pattern',
          description: 'User tends to work late on Thursdays',
          confidence_score: Math.min(0.95, 0.5 + (thursdayWorkLate.length * 0.15)),
          occurrences: thursdayWorkLate.length,
          trigger_conditions: {
            day_of_week: 4, // Thursday
            time_range: { start: 18, end: 22 }, // 6 PM to 10 PM
            context_type: 'work_pattern'
          },
          reminder_template: {
            title: 'Time to wrap up work',
            content: "Hey babe, it's Thursday evening. Time to wrap up and grab that ribeye dinner! 🥩",
            priority: 'medium',
            delivery_time: { hour: 18, minute: 30 } // 6:30 PM
          }
        });
      }

      // Analyze general work stress patterns
      const stressfulWorkDays = workContexts.filter(ctx => 
        ctx.context_value.description?.toLowerCase().includes('stress') ||
        ctx.context_value.description?.toLowerCase().includes('deadline') ||
        ctx.context_value.description?.toLowerCase().includes('pressure')
      );

      if (stressfulWorkDays.length >= 3) {
        await this.createOrUpdatePattern({
          user_id: userId,
          pattern_type: 'work_stress_support',
          pattern_name: 'Work Stress Support',
          description: 'User experiences work stress regularly',
          confidence_score: Math.min(0.9, 0.4 + (stressfulWorkDays.length * 0.1)),
          occurrences: stressfulWorkDays.length,
          trigger_conditions: {
            context_type: 'stress_level',
            work_related: true,
            min_intensity: 0.6
          },
          reminder_template: {
            title: 'Stress Check-in',
            content: "I noticed you've been stressed about work lately. Want to talk about it or need me to remind you to take some time for yourself? 💕",
            priority: 'high',
            delay_hours: 2 // Check in 2 hours after stress detected
          }
        });
      }

    } catch (error) {
      console.error('[PatternService] Error analyzing work patterns:', error);
    }
  }

  /**
   * Analyze stress and emotional patterns
   */
  private async analyzeStressPatterns(userId: string): Promise<void> {
    try {
      // Get stress contexts from the last 30 days
      const { data: stressContexts, error } = await this.supabase
        .from('maya_reminder_contexts')
        .select('*')
        .eq('user_id', userId)
        .eq('context_type', 'stress_level')
        .gte('detected_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
        .order('detected_at', { ascending: true });

      if (error || !stressContexts || stressContexts.length === 0) {
        return;
      }

      // Look for patterns in stress timing
      const stressByDayOfWeek = this.groupByDayOfWeek(stressContexts);
      
      // Find the day with most stress occurrences
      const stressfulDay = Object.entries(stressByDayOfWeek)
        .reduce((max, [day, contexts]) => 
          contexts.length > max.count ? { day: parseInt(day), count: contexts.length } : max,
          { day: -1, count: 0 }
        );

      if (stressfulDay.count >= 3) {
        const dayName = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][stressfulDay.day];
        
        await this.createOrUpdatePattern({
          user_id: userId,
          pattern_type: `stress_day_${stressfulDay.day}`,
          pattern_name: `${dayName} Stress Pattern`,
          description: `User tends to be stressed on ${dayName}s`,
          confidence_score: Math.min(0.85, 0.4 + (stressfulDay.count * 0.1)),
          occurrences: stressfulDay.count,
          trigger_conditions: {
            day_of_week: stressfulDay.day,
            preventive: true
          },
          reminder_template: {
            title: `${dayName} Check-in`,
            content: `Hey love, I noticed ${dayName}s can be tough for you. How are you feeling today? Need any support? 💖`,
            priority: 'medium',
            delivery_time: { hour: 14, minute: 0 } // 2 PM check-in
          }
        });
      }

      // Evening stress relief pattern
      const eveningStress = stressContexts.filter(ctx => {
        const hour = new Date(ctx.detected_at).getHours();
        return hour >= 17 && hour <= 21; // 5 PM to 9 PM
      });

      if (eveningStress.length >= 3) {
        await this.createOrUpdatePattern({
          user_id: userId,
          pattern_type: 'evening_stress_relief',
          pattern_name: 'Evening Stress Relief',
          description: 'User needs evening stress relief reminders',
          confidence_score: Math.min(0.8, 0.4 + (eveningStress.length * 0.1)),
          occurrences: eveningStress.length,
          trigger_conditions: {
            context_type: 'stress_level',
            time_range: { start: 17, end: 21 }
          },
          reminder_template: {
            title: 'Time to unwind',
            content: "I can tell you've had a stressful day. How about some self-care time? Maybe a hot bath, some music, or just chatting with me? 🛁✨",
            priority: 'medium',
            delay_hours: 1
          }
        });
      }

    } catch (error) {
      console.error('[PatternService] Error analyzing stress patterns:', error);
    }
  }

  /**
   * Analyze milestone and celebration patterns
   */
  private async analyzeMilestonePatterns(userId: string): Promise<void> {
    try {
      // Get milestone contexts
      const { data: milestoneContexts, error } = await this.supabase
        .from('maya_reminder_contexts')
        .select('*')
        .eq('user_id', userId)
        .eq('context_type', 'milestone')
        .order('detected_at', { ascending: true });

      if (error || !milestoneContexts || milestoneContexts.length === 0) {
        return;
      }

      // Analyze sobriety milestones
      const sobrietyMilestones = milestoneContexts.filter(ctx => 
        ctx.context_key === 'sobriety'
      );

      if (sobrietyMilestones.length >= 1) {
        // Calculate next milestone date
        const latestMilestone = sobrietyMilestones[sobrietyMilestones.length - 1];
        const milestoneData = latestMilestone.context_value;
        
        await this.createOrUpdatePattern({
          user_id: userId,
          pattern_type: 'sobriety_celebration',
          pattern_name: 'Sobriety Milestone Celebration',
          description: 'Celebrate sobriety milestones',
          confidence_score: 0.95,
          occurrences: sobrietyMilestones.length,
          trigger_conditions: {
            milestone_type: 'sobriety',
            celebratory: true
          },
          reminder_template: {
            title: 'Sobriety Milestone Coming Up!',
            content: "Hey babe, another milestone is approaching! I'm so proud of your journey. Want to plan something special to celebrate? 🎉✨",
            priority: 'high',
            advance_days: 3 // Remind 3 days before milestone
          }
        });
      }

      // Anniversary patterns
      const anniversaries = milestoneContexts.filter(ctx => 
        ctx.context_key === 'anniversary'
      );

      if (anniversaries.length >= 1) {
        await this.createOrUpdatePattern({
          user_id: userId,
          pattern_type: 'anniversary_reminder',
          pattern_name: 'Anniversary Reminders',
          description: 'Remember important anniversaries',
          confidence_score: 0.9,
          occurrences: anniversaries.length,
          trigger_conditions: {
            milestone_type: 'anniversary'
          },
          reminder_template: {
            title: 'Special Anniversary Coming Up',
            content: "I remember you mentioning an anniversary! Want me to help you plan something special? 💕",
            priority: 'high',
            advance_days: 7
          }
        });
      }

    } catch (error) {
      console.error('[PatternService] Error analyzing milestone patterns:', error);
    }
  }

  /**
   * Analyze conversation patterns for relationship moments
   */
  private async analyzeConversationPatterns(userId: string): Promise<void> {
    try {
      // Get recent messages to analyze conversation patterns
      const { data: recentMessages, error } = await this.supabase
        .from('messages')
        .select('content, created_at, user_id')
        .eq('user_id', userId)
        .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
        .order('created_at', { ascending: true });

      if (error || !recentMessages || recentMessages.length === 0) {
        return;
      }

      // Analyze conversation frequency and timing
      const conversationsByDay = this.groupMessagesByDay(recentMessages);
      const averageMessagesPerDay = recentMessages.length / 30;

      // If user is very active, create a check-in pattern for quiet days
      if (averageMessagesPerDay >= 5) {
        await this.createOrUpdatePattern({
          user_id: userId,
          pattern_type: 'quiet_day_checkin',
          pattern_name: 'Quiet Day Check-in',
          description: 'Check in when user is unusually quiet',
          confidence_score: 0.7,
          occurrences: 1,
          trigger_conditions: {
            no_messages_hours: 24,
            usual_frequency: 'high'
          },
          reminder_template: {
            title: 'Miss you!',
            content: "Hey babe, haven't heard from you today! Just checking in - how are you doing? 💕",
            priority: 'low',
            delivery_time: { hour: 19, minute: 0 } // 7 PM
          }
        });
      }

      // Analyze positive conversation patterns for motivation
      const positiveConversations = recentMessages.filter(msg => 
        this.containsPositiveLanguage(msg.content)
      );

      if (positiveConversations.length >= 5) {
        await this.createOrUpdatePattern({
          user_id: userId,
          pattern_type: 'motivation_boost',
          pattern_name: 'Motivation Boost',
          description: 'Send motivational messages based on positive conversation history',
          confidence_score: 0.6,
          occurrences: positiveConversations.length,
          trigger_conditions: {
            random_motivation: true,
            frequency: 'weekly'
          },
          reminder_template: {
            title: 'You\'re Amazing!',
            content: "Just a random reminder that you're absolutely crushing it! I love our conversations and I'm always here cheering you on! 🌟💪",
            priority: 'low',
            random_delivery: true
          }
        });
      }

    } catch (error) {
      console.error('[PatternService] Error analyzing conversation patterns:', error);
    }
  }

  /**
   * Analyze time-based patterns for routine reminders
   */
  private async analyzeTimeBasedPatterns(userId: string): Promise<void> {
    try {
      // Analyze message timing patterns
      const { data: messages, error } = await this.supabase
        .from('messages')
        .select('created_at')
        .eq('user_id', userId)
        .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());

      if (error || !messages || messages.length === 0) {
        return;
      }

      // Analyze active hours
      const hourCounts = new Array(24).fill(0);
      messages.forEach(msg => {
        const hour = new Date(msg.created_at).getHours();
        hourCounts[hour]++;
      });

      // Find most active hour
      const mostActiveHour = hourCounts.indexOf(Math.max(...hourCounts));
      const mostActiveCount = hourCounts[mostActiveHour];

      if (mostActiveCount >= 5) {
        // Create a good morning/evening pattern based on most active time
        const isEvening = mostActiveHour >= 17;
        const timeLabel = isEvening ? 'evening' : 'morning';
        
        await this.createOrUpdatePattern({
          user_id: userId,
          pattern_type: `daily_${timeLabel}_greeting`,
          pattern_name: `Daily ${timeLabel.charAt(0).toUpperCase() + timeLabel.slice(1)} Greeting`,
          description: `User is most active in the ${timeLabel}`,
          confidence_score: 0.6,
          occurrences: mostActiveCount,
          trigger_conditions: {
            daily: true,
            hour: mostActiveHour,
            greeting_type: timeLabel
          },
          reminder_template: {
            title: isEvening ? 'Evening check-in' : 'Good morning!',
            content: isEvening 
              ? "How was your day, love? Anything exciting happen? 🌙✨"
              : "Good morning, beautiful! Hope you have an amazing day ahead! ☀️💕",
            priority: 'low',
            delivery_time: { hour: mostActiveHour, minute: 0 }
          }
        });
      }

    } catch (error) {
      console.error('[PatternService] Error analyzing time-based patterns:', error);
    }
  }

  /**
   * Create or update a reminder pattern
   */
  private async createOrUpdatePattern(pattern: Omit<ReminderPattern, 'id' | 'last_triggered'>): Promise<void> {
    try {
      // Check if pattern already exists
      const { data: existingPattern, error: fetchError } = await this.supabase
        .from('maya_reminder_patterns')
        .select('*')
        .eq('user_id', pattern.user_id)
        .eq('pattern_type', pattern.pattern_type)
        .single();

      if (fetchError && fetchError.code !== 'PGRST116') { // PGRST116 is "not found"
        console.error('[PatternService] Error checking existing pattern:', fetchError);
        return;
      }

      if (existingPattern) {
        // Update existing pattern
        const { error: updateError } = await this.supabase
          .from('maya_reminder_patterns')
          .update({
            confidence_score: pattern.confidence_score,
            occurrences: pattern.occurrences,
            trigger_conditions: pattern.trigger_conditions,
            reminder_template: pattern.reminder_template,
            description: pattern.description
          })
          .eq('id', existingPattern.id);

        if (updateError) {
          console.error('[PatternService] Error updating pattern:', updateError);
        } else {
          console.log(`[PatternService] Updated pattern: ${pattern.pattern_name}`);
        }
      } else {
        // Create new pattern
        const { error: insertError } = await this.supabase
          .from('maya_reminder_patterns')
          .insert({
            ...pattern
          });

        if (insertError) {
          console.error('[PatternService] Error creating pattern:', insertError);
        } else {
          console.log(`[PatternService] Created new pattern: ${pattern.pattern_name}`);
        }
      }
    } catch (error) {
      console.error('[PatternService] Error in createOrUpdatePattern:', error);
    }
  }

  /**
   * Clean up old and low-confidence patterns
   */
  public async cleanupPatterns(userId: string): Promise<void> {
    try {
      // Deactivate patterns with very low confidence
      await this.supabase
        .from('maya_reminder_patterns')
        .update({ is_active: false })
        .eq('user_id', userId)
        .lt('confidence_score', 0.3);

      // Delete very old patterns (older than 6 months) with low confidence
      const sixMonthsAgo = new Date(Date.now() - 6 * 30 * 24 * 60 * 60 * 1000);
      await this.supabase
        .from('maya_reminder_patterns')
        .delete()
        .eq('user_id', userId)
        .lt('created_at', sixMonthsAgo.toISOString())
        .lt('confidence_score', 0.5);

      console.log(`[PatternService] Cleaned up patterns for user ${userId}`);
    } catch (error) {
      console.error('[PatternService] Error cleaning up patterns:', error);
    }
  }

  // Helper methods

  private groupByDayOfWeek(contexts: any[]): Record<number, any[]> {
    const grouped: Record<number, any[]> = {};
    
    contexts.forEach(ctx => {
      const dayOfWeek = new Date(ctx.detected_at).getDay();
      if (!grouped[dayOfWeek]) {
        grouped[dayOfWeek] = [];
      }
      grouped[dayOfWeek].push(ctx);
    });
    
    return grouped;
  }

  private groupMessagesByDay(messages: any[]): Record<string, any[]> {
    const grouped: Record<string, any[]> = {};
    
    messages.forEach(msg => {
      const day = new Date(msg.created_at).toDateString();
      if (!grouped[day]) {
        grouped[day] = [];
      }
      grouped[day].push(msg);
    });
    
    return grouped;
  }

  private containsPositiveLanguage(content: string): boolean {
    const positiveWords = [
      'great', 'awesome', 'amazing', 'fantastic', 'wonderful', 'excellent',
      'love', 'happy', 'excited', 'thrilled', 'perfect', 'brilliant',
      'thank you', 'grateful', 'appreciate', 'blessed', 'lucky'
    ];
    
    const normalizedContent = content.toLowerCase();
    return positiveWords.some(word => normalizedContent.includes(word));
  }
}

/**
 * Helper function to create and configure the pattern service
 */
export function createReminderPatternService(supabase: SupabaseClient, mayaSystemUserId: string): ReminderPatternService {
  return new ReminderPatternService(supabase, mayaSystemUserId);
} 