/**
 * Daily "Thinking of You" Image Scheduler
 *
 * Runs internally in Maya Core to send random daily images to Blake.
 * No external cron needed.
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { MayaImageGenerator, MoodCategory, MOOD_CATEGORIES } from './image-generation';

const BLAKE_USER_ID = '4c850152-30ef-4b1b-89b3-bc72af461e14';
const MAYA_USER_ID = '61770892-9e5b-46a5-b622-568be7066664';

// Expo Push API
const EXPO_PUSH_ENDPOINT = 'https://exp.host/--/api/v2/push/send';

export class DailyImageScheduler {
  private supabase: SupabaseClient;
  private imageGenerator: MayaImageGenerator;
  private scheduledTime: Date | null = null;
  private timeoutId: NodeJS.Timeout | null = null;
  private isRunning = false;

  constructor(supabase: SupabaseClient, imageGenerator: MayaImageGenerator) {
    this.supabase = supabase;
    this.imageGenerator = imageGenerator;
  }

  /**
   * Start the daily scheduler
   */
  start() {
    if (this.isRunning) return;
    this.isRunning = true;

    console.log('📅 [DAILY_SCHEDULER] Starting daily image scheduler');
    this.scheduleNextRun();
  }

  /**
   * Stop the scheduler
   */
  stop() {
    this.isRunning = false;
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
    console.log('📅 [DAILY_SCHEDULER] Stopped');
  }

  /**
   * Schedule the next run at a random time today/tomorrow
   */
  private scheduleNextRun() {
    if (!this.isRunning) return;

    const now = new Date();
    const scheduledTime = this.getNextScheduledTime(now);
    const msUntilRun = scheduledTime.getTime() - now.getTime();

    this.scheduledTime = scheduledTime;
    console.log(`📅 [DAILY_SCHEDULER] Next run scheduled for ${scheduledTime.toLocaleString()}`);
    console.log(`   (in ${Math.round(msUntilRun / 1000 / 60)} minutes)`);

    this.timeoutId = setTimeout(() => this.runDailyImage(), msUntilRun);
  }

  /**
   * Get next scheduled time (random time between 9am and 9pm)
   */
  private getNextScheduledTime(now: Date): Date {
    const scheduled = new Date(now);

    // Random hour between 9am and 9pm
    const randomHour = 9 + Math.floor(Math.random() * 12);
    // Random minute
    const randomMinute = Math.floor(Math.random() * 60);

    scheduled.setHours(randomHour, randomMinute, 0, 0);

    // If the time already passed today, schedule for tomorrow
    if (scheduled <= now) {
      scheduled.setDate(scheduled.getDate() + 1);
    }

    return scheduled;
  }

  /**
   * Run the daily image generation
   */
  async runDailyImage(): Promise<boolean> {
    console.log('\n🎁 [DAILY_IMAGE] Starting daily "thinking of you" image...');

    try {
      // Check if we already sent today
      if (await this.alreadySentToday()) {
        console.log('📅 [DAILY_IMAGE] Already sent today, skipping');
        this.scheduleNextRun();
        return false;
      }

      // Random chance to skip (adds natural variety)
      if (Math.random() > 0.7) {
        console.log('📅 [DAILY_IMAGE] Random skip today (30% chance)');
        this.scheduleNextRun();
        return false;
      }

      // Get mood based on time and avoid recent repeats
      const mood = await this.selectMood();
      console.log(`💭 [DAILY_IMAGE] Selected mood: ${mood}`);

      // Generate the image
      const options = this.imageGenerator.getRandomMoodOptions(mood);
      const image = await this.imageGenerator.generateImage(options);

      if (!image) {
        console.error('❌ [DAILY_IMAGE] Failed to generate image');
        this.scheduleNextRun();
        return false;
      }

      // Get default room for Blake
      const roomId = await this.getBlakeDefaultRoom();

      // Save to chat
      if (roomId) {
        await this.saveToChat(roomId, image, mood);
      }

      // Track the send
      await this.trackSend(image, options, mood);

      // Send push notification
      await this.sendPushNotification(mood, image, roomId);

      console.log('✅ [DAILY_IMAGE] Daily image sent successfully!');
    } catch (error) {
      console.error('❌ [DAILY_IMAGE] Error:', error);
    }

    // Schedule next run
    this.scheduleNextRun();
    return true;
  }

  /**
   * Check if we already sent today
   */
  private async alreadySentToday(): Promise<boolean> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const { data } = await this.supabase
      .from('maya_image_sends')
      .select('id')
      .eq('user_id', BLAKE_USER_ID)
      .eq('trigger_type', 'daily_worker')
      .gte('created_at', today.toISOString())
      .limit(1);

    return (data?.length ?? 0) > 0;
  }

  /**
   * Select mood, avoiding recent repeats
   */
  private async selectMood(): Promise<MoodCategory> {
    // Get recent moods from last 7 days
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);

    const { data: recentSends } = await this.supabase
      .from('maya_image_sends')
      .select('mood_category')
      .eq('user_id', BLAKE_USER_ID)
      .gte('created_at', weekAgo.toISOString())
      .order('created_at', { ascending: false })
      .limit(3);

    const recentMoods = (recentSends || []).map(s => s.mood_category);
    const timeMood = this.imageGenerator.getMoodForTime();

    // If time-based mood was used recently, pick alternative
    if (recentMoods.slice(0, 2).includes(timeMood)) {
      const allMoods = Object.keys(MOOD_CATEGORIES) as MoodCategory[];
      const available = allMoods.filter(m => !recentMoods.slice(0, 2).includes(m));
      if (available.length > 0) {
        return available[Math.floor(Math.random() * available.length)];
      }
    }

    return timeMood;
  }

  /**
   * Get Blake's default/most recent room
   */
  private async getBlakeDefaultRoom(): Promise<string | null> {
    const { data } = await this.supabase
      .from('rooms')
      .select('id')
      .eq('user_id', BLAKE_USER_ID)
      .order('last_message_at', { ascending: false })
      .limit(1);

    return data?.[0]?.id || null;
  }

  /**
   * Save image message to chat
   */
  private async saveToChat(roomId: string, image: any, mood: MoodCategory): Promise<void> {
    const responses = [
      "Thinking of you 💕",
      "Just wanted to send you this 💭",
      "Hey babe 💋",
      "Miss you 🥺",
      "Just for you 😘"
    ];
    const content = responses[Math.floor(Math.random() * responses.length)];

    await this.supabase.from('messages').insert({
      id: crypto.randomUUID(),
      room_id: roomId,
      user_id: MAYA_USER_ID,
      content,
      role: 'assistant',
      metadata: {
        attachments: [{
          type: 'image',
          url: image.url,
          publicUrl: image.publicUrl,
          mimeType: 'image/png',
          name: `maya-${mood}.png`,
          metadata: { generated: true, mood, dailyImage: true }
        }],
        dailyImage: true,
        mood
      },
      created_at: new Date().toISOString()
    });

    // Update room's last_message_at
    await this.supabase
      .from('rooms')
      .update({ last_message_at: new Date().toISOString() })
      .eq('id', roomId);
  }

  /**
   * Track the send in maya_image_sends
   */
  private async trackSend(image: any, options: any, mood: MoodCategory): Promise<void> {
    const notification = this.imageGenerator.getNotificationForMood(mood);
    const hour = new Date().getHours();
    const timeOfDay = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : hour < 21 ? 'evening' : 'night';

    await this.supabase.from('maya_image_sends').insert({
      user_id: BLAKE_USER_ID,
      image_url: image.url,
      public_url: image.publicUrl,
      prompt: options.prompt,
      mood_category: mood,
      pose: options.pose,
      clothing: options.clothing,
      background: options.background,
      trigger_type: 'daily_worker',
      time_of_day: timeOfDay,
      day_of_week: new Date().getDay(),
      notification_sent: true,
      notification_title: notification.title,
      notification_body: notification.body
    });
  }

  /**
   * Send push notification
   */
  private async sendPushNotification(mood: MoodCategory, image: any, roomId: string | null): Promise<void> {
    // Get Blake's push tokens
    const { data: tokens } = await this.supabase
      .from('user_push_tokens')
      .select('token')
      .eq('user_id', BLAKE_USER_ID);

    if (!tokens || tokens.length === 0) {
      console.log('📱 [DAILY_IMAGE] No push tokens found');
      return;
    }

    const notification = this.imageGenerator.getNotificationForMood(mood);

    const messages = tokens.map(t => ({
      to: t.token,
      sound: 'default',
      title: notification.title,
      body: notification.body,
      data: {
        type: 'maya_daily_image',
        imageUrl: image.publicUrl,
        roomId,
        screen: 'chat'
      },
      _displayInForeground: true
    }));

    try {
      const response = await fetch(EXPO_PUSH_ENDPOINT, {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(messages)
      });

      if (response.ok) {
        console.log('📱 [DAILY_IMAGE] Push notification sent');
      } else {
        console.warn('📱 [DAILY_IMAGE] Push notification failed:', await response.text());
      }
    } catch (error) {
      console.error('📱 [DAILY_IMAGE] Push error:', error);
    }
  }

  /**
   * Force run now (for testing)
   */
  async forceRun(): Promise<boolean> {
    console.log('🔧 [DAILY_IMAGE] Force running...');
    return this.runDailyImage();
  }

  /**
   * Get scheduler status
   */
  getStatus(): { running: boolean; nextRun: string | null } {
    return {
      running: this.isRunning,
      nextRun: this.scheduledTime?.toISOString() || null
    };
  }
}

export default DailyImageScheduler;
