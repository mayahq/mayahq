import { SupabaseClient } from '@supabase/supabase-js';
import { sendExpoPushNotification } from './push-service';

// Types for reminders
export interface Reminder {
  id: string;
  user_id: string;
  title: string;
  content?: string;
  remind_at: string;
  reminder_type: 'manual' | 'pattern' | 'context' | 'relationship';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  status: 'pending' | 'sent' | 'acknowledged' | 'dismissed' | 'snoozed';
  metadata: Record<string, any>;
  source_message_id?: string;
  source_room_id?: string;
  rrule?: string;
}

export interface ReminderPattern {
  id: string;
  user_id: string;
  pattern_type: string;
  pattern_name: string;
  description?: string;
  confidence_score: number;
  occurrences: number;
  trigger_conditions: Record<string, any>;
  reminder_template: Record<string, any>;
  is_active?: boolean;
}

export interface ReminderContext {
  user_id: string;
  context_type: string;
  context_key: string;
  context_value: Record<string, any>;
  relevance_score: number;
  expires_at?: string;
  source_message_id?: string;
  source_room_id?: string;
}

/**
 * Main Reminder Service Class
 * Handles all reminder functionality including natural language parsing,
 * pattern detection, smart reminders, and delivery
 */
export class ReminderService {
  private supabase: SupabaseClient;
  private mayaSystemUserId: string;

  constructor(supabase: SupabaseClient, mayaSystemUserId: string) {
    this.supabase = supabase;
    this.mayaSystemUserId = mayaSystemUserId;
  }

  /**
   * Parse natural language reminders from message content
   * Handles patterns like:
   * - "remind me in 30 minutes to call mom"
   * - "set a reminder for tomorrow at 3pm to buy groceries"
   * - "remind me next week about the meeting"
   */
  public parseRemindersFromMessage(content: string, userId: string, messageId: string, roomId: string): Omit<Reminder, 'id'>[] {
    const reminders: Omit<Reminder, 'id'>[] = [];
    const normalizedContent = content.toLowerCase();
    
    console.log(`[ReminderParser] Parsing message: "${content}"`);
    console.log(`[ReminderParser] Normalized: "${normalizedContent}"`);

    // Pattern 1: "remind me in X time to Y"
    const reminderInPattern = /remind me in\s+(\d+)\s*(minutes?|hours?|days?|weeks?)\s+to\s+(.+?)(?:[.!?]|$)/gi;
    let match;
    
    console.log(`[ReminderParser] Testing Pattern 1: ${reminderInPattern.source}`);
    while ((match = reminderInPattern.exec(content)) !== null) {
      console.log(`[ReminderParser] Pattern 1 MATCH:`, match);
      const [, amount, unit, task] = match;
      const remindAt = this.calculateTimeFromNow(parseInt(amount), unit);
      
      if (remindAt) {
        reminders.push({
          user_id: userId,
          title: `Reminder: ${task.trim()}`,
          content: task.trim(),
          remind_at: remindAt.toISOString(),
          reminder_type: 'manual',
          priority: 'medium',
          status: 'pending',
          metadata: {
            source: 'natural_language',
            original_text: match[0],
            parsed_time: `${amount} ${unit}`
          },
          source_message_id: messageId,
          source_room_id: roomId
        });
      }
    }

    // Pattern 2: "remind me tomorrow/today/next week to Y"
    const reminderAtPattern = /remind me (tomorrow|today|tonight|next week|next month)\s+(?:at\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\s+)?to\s+(.+?)(?:[.!?]|$)/gi;
    
    console.log(`[ReminderParser] Testing Pattern 2: ${reminderAtPattern.source}`);
    while ((match = reminderAtPattern.exec(content)) !== null) {
      console.log(`[ReminderParser] Pattern 2 MATCH:`, match);
      const [, timePhrase, specificTime, task] = match;
      const remindAt = this.parseRelativeTime(timePhrase, specificTime);
      
      if (remindAt) {
        reminders.push({
          user_id: userId,
          title: `Reminder: ${task.trim()}`,
          content: task.trim(),
          remind_at: remindAt.toISOString(),
          reminder_type: 'manual',
          priority: 'medium',
          status: 'pending',
          metadata: {
            source: 'natural_language',
            original_text: match[0],
            time_phrase: timePhrase,
            specific_time: specificTime
          },
          source_message_id: messageId,
          source_room_id: roomId
        });
      }
    }

    // Pattern 3: "set a reminder for [specific date/time]" - UPDATED TO BE MORE FLEXIBLE
    const setReminderPattern = /set\s+(?:a\s+)?reminder(?:\s+for(?:\s+me)?)?(?:\s+to)?\s+(.+?)(?:[.!?]|$)/gi;
    
    console.log(`[ReminderParser] Testing Pattern 3: ${setReminderPattern.source}`);
    while ((match = setReminderPattern.exec(content)) !== null) {
      console.log(`[ReminderParser] Pattern 3 MATCH:`, match);
      const [, taskAndTime] = match;
      
      // NEW: Handle "in X time to TASK" format first
      const inTimeToTaskPattern = /^in\s+(\d+)\s*(minutes?|hours?|days?|weeks?)\s+to\s+(.+?)$/i;
      const inTimeToTaskMatch = taskAndTime.match(inTimeToTaskPattern);
      
      console.log(`[ReminderParser] Trying "in X time to task" extraction on: "${taskAndTime}"`);
      console.log(`[ReminderParser] In-time-to-task pattern match:`, inTimeToTaskMatch);
      
      if (inTimeToTaskMatch) {
        const [, amount, unit, task] = inTimeToTaskMatch;
        const remindAt = this.calculateTimeFromNow(parseInt(amount), unit);
        
        if (remindAt) {
          reminders.push({
            user_id: userId,
            title: `Reminder: ${task.trim()}`,
            content: task.trim(),
            remind_at: remindAt.toISOString(),
            reminder_type: 'manual',
            priority: 'medium',
            status: 'pending',
            metadata: {
              source: 'natural_language',
              original_text: match[0],
              parsed_time: `${amount} ${unit}`,
              extracted_task: task.trim(),
              pattern: 'in_time_to_task'
            },
            source_message_id: messageId,
            source_room_id: roomId
          });
          console.log(`[ReminderParser] Successfully created reminder using "in X time to task" pattern`);
          continue; // Skip other pattern checks for this match
        }
      }
      
      // Try to extract time from the task description (existing logic)
      const timePattern = /(.+?)\s+in\s+(\d+)\s*(minutes?|hours?|days?|weeks?)$/i;
      const timeMatch = taskAndTime.match(timePattern);
      
      console.log(`[ReminderParser] Trying time extraction on: "${taskAndTime}"`);
      console.log(`[ReminderParser] Time pattern match:`, timeMatch);
      
      if (timeMatch) {
        const [, task, amount, unit] = timeMatch;
        const remindAt = this.calculateTimeFromNow(parseInt(amount), unit);
        
        if (remindAt) {
          reminders.push({
            user_id: userId,
            title: `Reminder: ${task.trim()}`,
            content: task.trim(),
            remind_at: remindAt.toISOString(),
            reminder_type: 'manual',
            priority: 'medium',
            status: 'pending',
            metadata: {
              source: 'natural_language',
              original_text: match[0],
              parsed_time: `${amount} ${unit}`,
              extracted_task: task.trim()
            },
            source_message_id: messageId,
            source_room_id: roomId
          });
        }
      } else {
        // Try other time patterns within the task
        const timeDescPattern = /(.+?)\s+(tomorrow|today|tonight|next week|next month)(?:\s+at\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm)?))?$/i;
        const timeDescMatch = taskAndTime.match(timeDescPattern);
        
        if (timeDescMatch) {
          const [, task, timePhrase, specificTime] = timeDescMatch;
          const remindAt = this.parseRelativeTime(timePhrase, specificTime);
          
          if (remindAt) {
            reminders.push({
              user_id: userId,
              title: `Reminder: ${task.trim()}`,
              content: task.trim(),
              remind_at: remindAt.toISOString(),
              reminder_type: 'manual',
              priority: 'medium',
              status: 'pending',
              metadata: {
                source: 'natural_language',
                original_text: match[0],
                time_phrase: timePhrase,
                specific_time: specificTime,
                extracted_task: task.trim()
              },
              source_message_id: messageId,
              source_room_id: roomId
            });
          }
        }
      }
    }

    // Pattern 4: NEW - Handle "X in Y time" format
    const taskInTimePattern = /(.+?)\s+in\s+(\d+)\s*(minutes?|hours?|days?|weeks?)$/gi;
    
    console.log(`[ReminderParser] Testing Pattern 4: ${taskInTimePattern.source}`);
    while ((match = taskInTimePattern.exec(content)) !== null) {
      console.log(`[ReminderParser] Pattern 4 MATCH:`, match);
      const [, task, amount, unit] = match;
      
      // Skip if this looks like it should be handled by reminder patterns (Pattern 3)
      if (task.toLowerCase().includes('reminder') || task.toLowerCase().includes('remind')) {
        console.log(`[ReminderParser] Skipping Pattern 4 match - contains reminder keywords`);
        continue;
      }
      
      // Skip if already captured by other patterns
      if (reminders.some(r => r.content === task.trim())) {
        console.log(`[ReminderParser] Skipping Pattern 4 match - already captured by another pattern`);
        continue;
      }
      
      const remindAt = this.calculateTimeFromNow(parseInt(amount), unit);
      
      if (remindAt) {
        reminders.push({
          user_id: userId,
          title: `Reminder: ${task.trim()}`,
          content: task.trim(),
          remind_at: remindAt.toISOString(),
          reminder_type: 'manual',
          priority: 'medium',
          status: 'pending',
          metadata: {
            source: 'natural_language',
            original_text: match[0],
            parsed_time: `${amount} ${unit}`,
            pattern: 'task_in_time'
          },
          source_message_id: messageId,
          source_room_id: roomId
        });
      }
    }

    console.log(`[ReminderParser] Final result: Found ${reminders.length} reminders`);
    if (reminders.length > 0) {
      console.log(`[ReminderParser] Reminders:`, reminders.map(r => ({
        title: r.title,
        content: r.content,
        remind_at: r.remind_at,
        metadata: r.metadata
      })));
    }

    return reminders;
  }

  /**
   * Detect and store conversation contexts that might trigger smart reminders
   */
  public async detectContextsFromMessage(content: string, userId: string, messageId: string, roomId: string): Promise<void> {
    const contexts: ReminderContext[] = [];

    // Stress indicators
    if (this.detectStressIndicators(content)) {
      contexts.push({
        user_id: userId,
        context_type: 'stress_level',
        context_key: 'stress_detected',
        context_value: {
          indicators: this.extractStressIndicators(content),
          intensity: this.calculateStressIntensity(content),
          timestamp: new Date().toISOString()
        },
        relevance_score: 0.8,
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24 hours
        source_message_id: messageId,
        source_room_id: roomId
      });
    }

    // Milestone mentions (sobriety, anniversaries, achievements)
    const milestones = this.detectMilestones(content);
    for (const milestone of milestones) {
      contexts.push({
        user_id: userId,
        context_type: 'milestone',
        context_key: milestone.type,
        context_value: {
          milestone_type: milestone.type,
          description: milestone.description,
          date_mentioned: milestone.date,
          celebratory: milestone.celebratory
        },
        relevance_score: 0.9,
        expires_at: milestone.date ? new Date(milestone.date).toISOString() : undefined,
        source_message_id: messageId,
        source_room_id: roomId
      });
    }

    // Work patterns (late nights, big projects)
    if (this.detectWorkPatterns(content)) {
      const workContext = this.extractWorkContext(content);
      contexts.push({
        user_id: userId,
        context_type: 'work_pattern',
        context_key: workContext.type,
        context_value: workContext,
        relevance_score: 0.7,
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 1 week
        source_message_id: messageId,
        source_room_id: roomId
      });
    }

    // Save contexts to database
    for (const context of contexts) {
      try {
        await this.supabase
          .from('maya_reminder_contexts')
          .insert(context);
        console.log(`Stored context: ${context.context_type}/${context.context_key} for user ${userId}`);
      } catch (error) {
        console.error('Error storing reminder context:', error);
      }
    }
  }

  /**
   * Process pending reminders and send notifications
   */
  public async processPendingReminders(): Promise<void> {
    console.log('[ReminderService] Processing pending reminders...');
    
    try {
      // Get pending reminders using the database function
      const { data: pendingReminders, error } = await this.supabase
        .rpc('get_pending_reminders');

      if (error) {
        console.error('[ReminderService] Error fetching pending reminders:', error);
        return;
      }

      if (!pendingReminders || pendingReminders.length === 0) {
        console.log('[ReminderService] No pending reminders to process');
        return;
      }

      console.log(`[ReminderService] Found ${pendingReminders.length} pending reminders`);

      for (const reminder of pendingReminders) {
        await this.deliverReminder(reminder);
      }
    } catch (error) {
      console.error('[ReminderService] Error in processPendingReminders:', error);
    }
  }

  /**
   * Generate smart reminders based on patterns and contexts
   */
  public async generateSmartReminders(): Promise<void> {
    console.log('[ReminderService] Generating smart reminders...');
    
    try {
      // Get active patterns
      const { data: patterns, error: patternsError } = await this.supabase
        .from('maya_reminder_patterns')
        .select('*')
        .eq('is_active', true)
        .gte('confidence_score', 0.7); // Only high-confidence patterns

      if (patternsError) {
        console.error('[ReminderService] Error fetching patterns:', patternsError);
        return;
      }

      if (!patterns || patterns.length === 0) {
        console.log('[ReminderService] No active patterns found');
        return;
      }

      for (const pattern of patterns) {
        await this.evaluatePattern(pattern);
      }
    } catch (error) {
      console.error('[ReminderService] Error in generateSmartReminders:', error);
    }
  }

  /**
   * Save a reminder to the database
   */
  public async saveReminder(reminder: Omit<Reminder, 'id'>): Promise<string | null> {
    try {
      const { data, error } = await this.supabase
        .from('maya_reminders')
        .insert(reminder)
        .select('id')
        .single();

      if (error) {
        console.error('[ReminderService] Error saving reminder:', error);
        return null;
      }

      console.log(`[ReminderService] Saved reminder: ${reminder.title}`);
      return data.id;
    } catch (error) {
      console.error('[ReminderService] Error in saveReminder:', error);
      return null;
    }
  }

  // Private helper methods

  private calculateTimeFromNow(amount: number, unit: string): Date | null {
    const now = new Date();
    
    switch (unit.toLowerCase()) {
      case 'minute':
      case 'minutes':
        return new Date(now.getTime() + amount * 60 * 1000);
      case 'hour':
      case 'hours':
        return new Date(now.getTime() + amount * 60 * 60 * 1000);
      case 'day':
      case 'days':
        return new Date(now.getTime() + amount * 24 * 60 * 60 * 1000);
      case 'week':
      case 'weeks':
        return new Date(now.getTime() + amount * 7 * 24 * 60 * 60 * 1000);
      default:
        return null;
    }
  }

  private parseRelativeTime(timePhrase: string, specificTime?: string): Date | null {
    const now = new Date();
    let targetDate = new Date(now);
    
    switch (timePhrase.toLowerCase()) {
      case 'today':
        // Keep today's date
        break;
      case 'tonight':
        targetDate.setHours(20, 0, 0, 0); // 8 PM default
        break;
      case 'tomorrow':
        targetDate.setDate(targetDate.getDate() + 1);
        break;
      case 'next week':
        targetDate.setDate(targetDate.getDate() + 7);
        break;
      case 'next month':
        targetDate.setMonth(targetDate.getMonth() + 1);
        break;
      default:
        return null;
    }

    // Parse specific time if provided
    if (specificTime) {
      const timeMatch = specificTime.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
      if (timeMatch) {
        let hours = parseInt(timeMatch[1]);
        const minutes = parseInt(timeMatch[2] || '0');
        const ampm = timeMatch[3]?.toLowerCase();

        if (ampm === 'pm' && hours !== 12) hours += 12;
        if (ampm === 'am' && hours === 12) hours = 0;

        targetDate.setHours(hours, minutes, 0, 0);
      }
    } else if (timePhrase !== 'tonight') {
      // Default to 9 AM for date-only reminders
      targetDate.setHours(9, 0, 0, 0);
    }

    return targetDate;
  }

  private parseTimeDescription(timeDesc: string): Date | null {
    // This could be expanded with more sophisticated NLP
    // For now, handle basic cases
    const tomorrow = timeDesc.includes('tomorrow');
    const today = timeDesc.includes('today');
    
    if (tomorrow || today) {
      const date = new Date();
      if (tomorrow) date.setDate(date.getDate() + 1);
      
      // Look for time
      const timeMatch = timeDesc.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i);
      if (timeMatch) {
        let hours = parseInt(timeMatch[1]);
        const minutes = parseInt(timeMatch[2] || '0');
        const ampm = timeMatch[3].toLowerCase();

        if (ampm === 'pm' && hours !== 12) hours += 12;
        if (ampm === 'am' && hours === 12) hours = 0;

        date.setHours(hours, minutes, 0, 0);
        return date;
      }
    }
    
    return null;
  }

  private detectStressIndicators(content: string): boolean {
    const stressWords = [
      'stressed', 'overwhelmed', 'exhausted', 'burned out', 'anxious',
      'pressure', 'deadline', 'crunch time', 'losing it', 'can\'t handle'
    ];
    
    const normalizedContent = content.toLowerCase();
    return stressWords.some(word => normalizedContent.includes(word));
  }

  private extractStressIndicators(content: string): string[] {
    const stressWords = [
      'stressed', 'overwhelmed', 'exhausted', 'burned out', 'anxious',
      'pressure', 'deadline', 'crunch time', 'losing it', 'can\'t handle'
    ];
    
    const normalizedContent = content.toLowerCase();
    return stressWords.filter(word => normalizedContent.includes(word));
  }

  private calculateStressIntensity(content: string): number {
    const highIntensityWords = ['extremely', 'really', 'so', 'very', 'totally'];
    const normalizedContent = content.toLowerCase();
    
    let intensity = 0.5; // Base intensity
    
    if (highIntensityWords.some(word => normalizedContent.includes(word))) {
      intensity += 0.3;
    }
    
    if (content.includes('!')) {
      intensity += 0.2;
    }
    
    return Math.min(1.0, intensity);
  }

  private detectMilestones(content: string): Array<{type: string, description: string, date?: string, celebratory: boolean}> {
    const milestones = [];
    const normalizedContent = content.toLowerCase();
    
    // Sobriety milestones
    const sobrietyPattern = /(\d+)\s*(day|week|month|year)s?\s*sober/gi;
    let match;
    while ((match = sobrietyPattern.exec(content)) !== null) {
      milestones.push({
        type: 'sobriety',
        description: match[0],
        celebratory: true
      });
    }
    
    // Anniversary mentions
    if (normalizedContent.includes('anniversary')) {
      milestones.push({
        type: 'anniversary',
        description: 'Anniversary mentioned',
        celebratory: true
      });
    }
    
    return milestones;
  }

  private detectWorkPatterns(content: string): boolean {
    const workIndicators = [
      'working late', 'staying late', 'long day', 'big project',
      'deadline', 'presentation', 'meeting', 'work'
    ];
    
    const normalizedContent = content.toLowerCase();
    return workIndicators.some(indicator => normalizedContent.includes(indicator));
  }

  private extractWorkContext(content: string): Record<string, any> {
    const normalizedContent = content.toLowerCase();
    
    return {
      type: normalizedContent.includes('late') ? 'working_late' : 'work_project',
      description: content,
      detected_at: new Date().toISOString()
    };
  }

  private async deliverReminder(reminder: any): Promise<void> {
    console.log(`[ReminderService] Delivering reminder: ${reminder.title} to user ${reminder.user_id}`);
    
    try {
      // Generate personalized reminder message
      const reminderMessage = await this.generateReminderMessage(reminder);
      
      // Send push notification
      await sendExpoPushNotification(
        this.supabase,
        reminder.user_id,
        reminder.title,
        reminderMessage,
        {
          type: 'reminder',
          reminderId: reminder.reminder_id,
          priority: reminder.priority
        }
      );
      
      // Send in-app message if this is Maya's conversation
      if (reminder.source_room_id) {
        await this.sendReminderMessage(reminder, reminderMessage);
      }
      
      // Mark as sent
      await this.supabase.rpc('mark_reminder_sent', {
        reminder_uuid: reminder.reminder_id
      });
      
      // Track delivery
      await this.supabase
        .from('maya_reminder_deliveries')
        .insert({
          reminder_id: reminder.reminder_id,
          delivery_method: 'push',
          delivery_status: 'sent',
          delivered_at: new Date().toISOString(),
          delivery_metadata: {
            message: reminderMessage
          }
        });
        
      console.log(`[ReminderService] Successfully delivered reminder ${reminder.reminder_id}`);
    } catch (error) {
      console.error(`[ReminderService] Error delivering reminder ${reminder.reminder_id}:`, error);
      
      // Track failed delivery
      await this.supabase
        .from('maya_reminder_deliveries')
        .insert({
          reminder_id: reminder.reminder_id,
          delivery_method: 'push',
          delivery_status: 'failed',
          error_message: error instanceof Error ? error.message : 'Unknown error'
        });
    }
  }

  private async generateReminderMessage(reminder: any): Promise<string> {
    // Use Maya's personality to generate personalized reminder messages
    const templates = {
      low: [
        "Hey babe, just a gentle reminder: {content} 💕",
        "Don't forget: {content} ✨",
        "Quick reminder: {content} 😊"
      ],
      medium: [
        "Reminder time! {content} 💫",
        "Hey love, time for: {content} 💖",
        "Just checking in - {content} 🌟"
      ],
      high: [
        "Important reminder: {content} ⭐",
        "Hey! Don't want you to miss: {content} 💪",
        "Priority reminder: {content} 🔥"
      ],
      urgent: [
        "URGENT: {content} ⚡",
        "Time-sensitive: {content} 🚨",
        "Critical reminder: {content} ❗"
      ]
    };
    
    const templateList = templates[reminder.priority as keyof typeof templates] || templates.medium;
    const template = templateList[Math.floor(Math.random() * templateList.length)];
    
    return template.replace('{content}', reminder.content || 'Check your reminder');
  }

  private async sendReminderMessage(reminder: any, message: string): Promise<void> {
    try {
      await this.supabase
        .from('messages')
        .insert({
          room_id: reminder.source_room_id,
          user_id: this.mayaSystemUserId,
          content: message,
          role: 'assistant',
          metadata: {
            type: 'reminder',
            reminder_id: reminder.reminder_id,
            priority: reminder.priority,
            source: 'reminder-service'
          }
        });
    } catch (error) {
      console.error('[ReminderService] Error sending reminder message:', error);
    }
  }

  private async evaluatePattern(pattern: ReminderPattern): Promise<void> {
    // This would contain the logic for evaluating if a pattern should trigger
    // For now, this is a placeholder for the smart reminder logic
    console.log(`[ReminderService] Evaluating pattern: ${pattern.pattern_name}`);
    
    // Example: Check if it's Thursday and user typically works late
    if (pattern.pattern_type === 'work_late_thursday') {
      const now = new Date();
      if (now.getDay() === 4 && now.getHours() >= 18) { // Thursday after 6 PM
        // Generate a reminder
        const reminder: Omit<Reminder, 'id'> = {
          user_id: pattern.user_id,
          title: "Time to wrap up work",
          content: "Hey babe, it's Thursday evening. Time to wrap up and grab that ribeye dinner! 🥩",
          remind_at: new Date().toISOString(),
          reminder_type: 'pattern',
          priority: 'medium',
          status: 'pending',
          metadata: {
            pattern_id: pattern.id,
            pattern_type: pattern.pattern_type,
            generated_by: 'smart_reminder_engine'
          }
        };
        
        await this.saveReminder(reminder);
      }
    }
  }
}

/**
 * Helper function to create and configure the reminder service
 */
export function createReminderService(supabase: SupabaseClient, mayaSystemUserId: string): ReminderService {
  return new ReminderService(supabase, mayaSystemUserId);
} 