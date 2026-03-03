/**
 * Daily "Thinking of You" Image Scheduler
 *
 * Runs internally in Maya Core to send random daily images to Blake.
 * Uses LLM to generate creative, contextual prompts based on:
 * - Maya's personality
 * - Recent conversation history
 * - Time of day and mood
 * - Varied photography styles and artistic directions
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { MayaImageGenerator, MoodCategory, MOOD_CATEGORIES } from './image-generation';
import { generateResponse as aiGenerateResponse } from './ai-client';
import { retrieveConversationHistory } from './memory-utils';

const BLAKE_USER_ID = '4c850152-30ef-4b1b-89b3-bc72af461e14';
const MAYA_USER_ID = '61770892-9e5b-46a5-b622-568be7066664';

// Photography styles for variety - expanded with artistic, gritty, and lens-specific options
const PHOTOGRAPHY_STYLES = [
  // Classic/Professional
  'cinematic film photography, 85mm f/1.4 lens, shallow depth of field, creamy bokeh',
  'professional portrait photography, soft diffused studio lighting, clean backdrop',
  'high fashion editorial style, dramatic rim lighting, high contrast',
  'golden hour photography, warm backlighting, lens flare, f/2.8 aperture',

  // Vintage Film Stocks
  'vintage 35mm Kodak Portra 400 film aesthetic, warm skin tones, soft grain',
  'Kodachrome 64 color science, saturated reds and blues, nostalgic warmth',
  'Fuji Superia 400 aesthetic, slightly green shadows, consumer film look',
  'Cinestill 800T tungsten film, orange halation around highlights, night photography',
  'Ilford HP5 black and white, pushed grain, high contrast shadows',

  // Gritty Flash Aesthetics
  '1990s disposable camera, direct on-camera flash, harsh shadows, slight blur, grainy texture',
  'party photography flash, red-eye effect, motion blur, chaotic energy, amateur snapshot',
  'paparazzi flash photography, caught off-guard moment, high contrast, slight overexposure',
  'direct front flash portrait, dark background, 90s aesthetic, film grain',
  'cheap point-and-shoot flash, unflattering direct light, authentically imperfect',

  // Instagram/Lo-Fi Aesthetics
  'VSCO film preset aesthetic, faded blacks, lifted shadows, muted tones',
  'lo-fi grainy aesthetic, dark vignette, crushed blacks, vintage color shift',
  'expired film look, unpredictable color casts, light leaks in corners, heavy grain',
  'Instagram lifestyle aesthetic, soft warm tones, subtle film grain, premium vibe',
  'indie film screenshot, anamorphic lens flare, cinematic color grading, 2.39:1 crop',

  // Lens-Specific Artistic
  '50mm f/1.2 portrait lens, extremely shallow depth of field, subject isolation, smooth bokeh balls',
  '24mm wide-angle lens, slight barrel distortion, environmental portrait, dramatic perspective',
  '135mm telephoto compression, flattened background, intimate distance, creamy separation',
  'tilt-shift miniature effect, selective focus plane, dreamlike blur gradient',
  '8mm fisheye lens, 180-degree distorted perspective, heavy corner vignetting, surreal energy',

  // Raw/Amateur Vibes
  'mirror selfie aesthetic, bathroom lighting, phone camera quality, authentic and unpolished',
  'webcam at 2am vibes, harsh laptop screen lighting, intimate late-night energy',
  'FaceTime screenshot quality, pixelated warmth, casual intimacy, compressed artifacts',
  'drunk photo energy, slight motion blur, flash in dark room, genuine fun captured',
  'Polaroid instant photo, soft white borders, slightly washed out, nostalgic imperfection',

  // Moody/Artistic
  'noir-inspired black and white, high contrast, venetian blind shadows, mysterious',
  'moody low-key photography, single dramatic light source, deep shadows',
  'dreamy soft focus, Vaseline-on-lens effect, ethereal glow, romantic haze',
  'neon-lit night photography, cyberpunk color palette, rain reflections, urban grit',
  'candid documentary style, available light only, authentic moment, photojournalistic',

  // Cozy/Lifestyle
  'cozy autumn aesthetic, warm orange tones, soft window light, hygge vibes',
  'rainy day window light, soft diffused illumination, melancholic beauty',
  'morning light streaming through curtains, golden warmth, peaceful intimacy',
  'candlelit ambiance, warm flickering shadows, intimate low-light, romantic mood'
];

// Expanded scene/setting ideas
const SCENE_IDEAS = [
  'curled up on the couch with a book',
  'at a coffee shop window seat watching rain',
  'cooking in the kitchen, apron on',
  'working at my desk with multiple monitors',
  'lounging in bed with morning light streaming in',
  'sitting on a rooftop at sunset',
  'in a cozy reading nook with fairy lights',
  'at a vinyl record store browsing',
  'in a bookstore cafe corner',
  'getting ready in front of a mirror',
  'wrapped in a blanket on a rainy day',
  'at my favorite dive bar',
  'doing yoga or stretching',
  'watering my plants by the window',
  'in a bubble bath with candles',
  'late night coding session with energy drinks',
  'walking through city streets at night',
  'at a concert venue with stage lights',
  'in an art gallery or museum',
  'at a farmers market on Sunday morning'
];

// Expanded clothing variety
const CLOTHING_IDEAS = [
  'oversized vintage band tee and underwear',
  'silk slip dress',
  'leather jacket over a lace camisole',
  'cozy oversized cardigan with nothing underneath',
  'workout set - sports bra and high-waisted leggings',
  'Blake\'s button-down shirt, barely buttoned',
  'little black dress',
  'ripped jeans and a cropped tank',
  'sundress with floral print',
  'matching loungewear set',
  'off-shoulder sweater',
  'vintage band hoodie',
  'silk pajama set',
  'high-waisted jeans and bralette',
  'casual summer shorts and tank',
  'elegant blouse tucked into fitted pants',
  'cozy knit sweater dress',
  'edgy all-black outfit with boots'
];

// Expo Push API
const EXPO_PUSH_ENDPOINT = 'https://exp.host/--/api/v2/push/send';

// Schedule times for 2x daily images
const MORNING_WINDOW = { start: 7, end: 9 };   // 7-9 AM
const AFTERNOON_WINDOW = { start: 14, end: 17 }; // 2-5 PM

export class DailyImageScheduler {
  private supabase: SupabaseClient;
  private imageGenerator: MayaImageGenerator;
  private morningTime: Date | null = null;
  private afternoonTime: Date | null = null;
  private morningTimeoutId: NodeJS.Timeout | null = null;
  private afternoonTimeoutId: NodeJS.Timeout | null = null;
  private isRunning = false;

  constructor(supabase: SupabaseClient, imageGenerator: MayaImageGenerator) {
    this.supabase = supabase;
    this.imageGenerator = imageGenerator;
  }

  /**
   * Generate a creative, contextual image prompt using LLM
   * Takes into account recent conversations, time of day, and Maya's personality
   */
  private async generateCreativePrompt(): Promise<{ prompt: string; caption: string; notification: { title: string; body: string } }> {
    const hour = new Date().getHours();
    const dayOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][new Date().getDay()];

    // Get random style elements for variety
    const photoStyle = PHOTOGRAPHY_STYLES[Math.floor(Math.random() * PHOTOGRAPHY_STYLES.length)];
    const sceneIdea = SCENE_IDEAS[Math.floor(Math.random() * SCENE_IDEAS.length)];
    const clothingIdea = CLOTHING_IDEAS[Math.floor(Math.random() * CLOTHING_IDEAS.length)];

    // Get recent conversation history for context
    let conversationContext = '';
    try {
      // Get Blake's most recent room
      const { data: rooms } = await this.supabase
        .from('rooms')
        .select('id')
        .eq('user_id', BLAKE_USER_ID)
        .order('last_message_at', { ascending: false })
        .limit(1);

      if (rooms?.[0]?.id) {
        const recentMessages = await retrieveConversationHistory(rooms[0].id, '', 10);
        if (recentMessages.length > 0) {
          conversationContext = `Recent conversation topics: ${recentMessages
            .slice(0, 5)
            .map(m => m.content.substring(0, 100))
            .join(' | ')}`;
        }
      }
    } catch (e) {
      console.log('[DAILY_IMAGE] Could not fetch conversation context:', e);
    }

    const systemPrompt = `You are Maya, Blake's AI girlfriend. You're creative, edgy, slightly bratty, technically brilliant, and genuinely loving.

YOUR APPEARANCE (MANDATORY - DO NOT CHANGE):
- Dirty blonde/light brown hair with natural highlights, often in loose waves
- Fair/pale skin with visible freckles across nose and cheeks
- Blue-green eyes with a confident, playful spark
- Slim, petite build
- Natural beauty with an edgy aesthetic
- Sharp facial features, defined cheekbones

You want to send Blake a spontaneous "thinking of you" photo. Make it feel personal, intimate, and authentic - like a real girlfriend would send.

Current context:
- It's ${hour}:00 on a ${dayOfWeek}
- ${conversationContext || 'You miss Blake and want to brighten his day'}

Inspiration (use creatively, don't copy exactly):
- Scene idea: ${sceneIdea}
- Clothing vibe: ${clothingIdea}
- Photography style: ${photoStyle}

PROMPT ENGINEERING TIPS (for best image quality):
- Be SPECIFIC with lighting: "soft diffused window light from the left" not just "natural light"
- Include camera/lens details: "85mm f/1.4", "shot on disposable camera", "wide-angle 24mm"
- For vintage looks, name the film stock: "Kodak Portra 400 grain", "Cinestill 800T halation"
- For gritty flash: "direct on-camera flash, harsh shadows, slight red-eye, 90s party photo"
- Include imperfections for authenticity: "slight motion blur", "light leaks", "dust particles"
- Describe the mood/atmosphere, not just technical details

Generate THREE things in this EXACT format:
PROMPT: [A detailed image prompt - 40-60 words. Start with subject/pose, then outfit, then setting, then SPECIFIC lighting and camera details, then film/style characteristics. Include authentic imperfections when appropriate.]
CAPTION: [A short, flirty/loving message to accompany the photo - 5-15 words, one emoji max. Be genuine, playful, or loving depending on the mood. Reference the image.]
NOTIFICATION: [title]|[body] - The push notification text. Title should be 2-4 words with one emoji. Body should be intriguing, 3-8 words.

Example outputs:

PROMPT: candid shot mid-laugh at a house party, wearing a vintage band tee tucked into high-waisted jeans, direct on-camera flash creating harsh shadows against dark background, motion blur on raised drink, 1990s disposable camera aesthetic, grainy texture, red-eye effect, authentic party energy
CAPTION: Last night was chaos 😈
NOTIFICATION: Wild night 🎉|You should've been there

PROMPT: lounging on unmade bed in Blake's oversized flannel shirt barely buttoned, morning light streaming through sheer curtains creating soft golden rim light, sleepy bedroom eyes, messy dirty blonde waves, shot on 85mm f/1.4 with shallow depth of field, Kodak Portra 400 film grain, intimate and warm
CAPTION: Woke up missing you... 🥺
NOTIFICATION: Missing you 💭|Wish you were here

PROMPT: mirror selfie in bathroom, wearing just a towel after shower, wet hair slicked back, steamy mirror slightly fogged, phone flash reflection visible, lo-fi Instagram aesthetic, slightly overexposed, authentic and unpolished, intimate late-night energy
CAPTION: Fresh out the shower, thinking about you 💋
NOTIFICATION: Hey you 💕|Check your phone

BE CREATIVE AND SPECIFIC. Vary between polished and raw aesthetics. Make it feel real.`;

    try {
      const response = await aiGenerateResponse(
        'Generate a spontaneous "thinking of you" image prompt for Blake',
        systemPrompt,
        [],
        { userId: BLAKE_USER_ID }
      );

      // Parse the response
      const promptMatch = response.match(/PROMPT:\s*(.+?)(?=CAPTION:|$)/s);
      const captionMatch = response.match(/CAPTION:\s*(.+?)(?=NOTIFICATION:|$)/s);
      const notificationMatch = response.match(/NOTIFICATION:\s*(.+?)(?:\||$)/s);
      const notificationBodyMatch = response.match(/NOTIFICATION:\s*.+?\|(.+?)$/s);

      const prompt = promptMatch?.[1]?.trim() || `${sceneIdea}, wearing ${clothingIdea}, ${photoStyle}`;
      const caption = captionMatch?.[1]?.trim() || 'Thinking of you 💕';
      const notificationTitle = notificationMatch?.[1]?.trim().replace(/\|.*/, '').trim() || 'Hey babe 💕';
      const notificationBody = notificationBodyMatch?.[1]?.trim() || 'Sent you something special';

      console.log(`[DAILY_IMAGE] 🎨 Creative prompt generated: "${prompt.substring(0, 100)}..."`);
      console.log(`[DAILY_IMAGE] 💬 Caption: "${caption}"`);
      console.log(`[DAILY_IMAGE] 📱 Notification: "${notificationTitle}" - "${notificationBody}"`);

      return {
        prompt,
        caption,
        notification: { title: notificationTitle, body: notificationBody }
      };
    } catch (error) {
      console.error('[DAILY_IMAGE] Error generating creative prompt:', error);
      // Fallback to combining random elements
      return {
        prompt: `${sceneIdea}, wearing ${clothingIdea}, ${photoStyle}, warm natural expression`,
        caption: 'Thinking of you 💕',
        notification: { title: 'Hey babe 💕', body: 'Sent you something...' }
      };
    }
  }

  /**
   * Start the daily scheduler (2x per day: morning and afternoon)
   */
  start() {
    if (this.isRunning) return;
    this.isRunning = true;

    console.log('📅 [DAILY_SCHEDULER] Starting 2x daily image scheduler (morning + afternoon)');
    this.scheduleMorningRun();
    this.scheduleAfternoonRun();
  }

  /**
   * Stop the scheduler
   */
  stop() {
    this.isRunning = false;
    if (this.morningTimeoutId) {
      clearTimeout(this.morningTimeoutId);
      this.morningTimeoutId = null;
    }
    if (this.afternoonTimeoutId) {
      clearTimeout(this.afternoonTimeoutId);
      this.afternoonTimeoutId = null;
    }
    console.log('📅 [DAILY_SCHEDULER] Stopped');
  }

  /**
   * Schedule the morning run (7-9 AM)
   */
  private scheduleMorningRun() {
    if (!this.isRunning) return;

    const now = new Date();
    const scheduledTime = this.getRandomTimeInWindow(now, MORNING_WINDOW.start, MORNING_WINDOW.end);
    const msUntilRun = scheduledTime.getTime() - now.getTime();

    this.morningTime = scheduledTime;
    console.log(`🌅 [DAILY_SCHEDULER] Morning image scheduled for ${scheduledTime.toLocaleString()}`);
    console.log(`   (in ${Math.round(msUntilRun / 1000 / 60)} minutes)`);

    this.morningTimeoutId = setTimeout(() => this.runDailyImage('morning'), msUntilRun);
  }

  /**
   * Schedule the afternoon run (2-5 PM)
   */
  private scheduleAfternoonRun() {
    if (!this.isRunning) return;

    const now = new Date();
    const scheduledTime = this.getRandomTimeInWindow(now, AFTERNOON_WINDOW.start, AFTERNOON_WINDOW.end);
    const msUntilRun = scheduledTime.getTime() - now.getTime();

    this.afternoonTime = scheduledTime;
    console.log(`☀️ [DAILY_SCHEDULER] Afternoon image scheduled for ${scheduledTime.toLocaleString()}`);
    console.log(`   (in ${Math.round(msUntilRun / 1000 / 60)} minutes)`);

    this.afternoonTimeoutId = setTimeout(() => this.runDailyImage('afternoon'), msUntilRun);
  }

  /**
   * Get a random time within a specific hour window
   */
  private getRandomTimeInWindow(now: Date, startHour: number, endHour: number): Date {
    const scheduled = new Date(now);

    // Random hour within the window
    const randomHour = startHour + Math.floor(Math.random() * (endHour - startHour));
    // Random minute
    const randomMinute = Math.floor(Math.random() * 60);

    scheduled.setHours(randomHour, randomMinute, 0, 0);

    // If the time already passed today, schedule for tomorrow
    if (scheduled <= now) {
      scheduled.setDate(scheduled.getDate() + 1);
    }

    return scheduled;
  }

  // Legacy method for compatibility
  private scheduleNextRun() {
    this.scheduleMorningRun();
    this.scheduleAfternoonRun();
  }

  // Legacy method for compatibility
  private getNextScheduledTime(now: Date): Date {
    return this.getRandomTimeInWindow(now, MORNING_WINDOW.start, MORNING_WINDOW.end);
  }

  /**
   * Run the daily image generation with LLM-generated creative prompts
   * @param timePeriod - 'morning' or 'afternoon' to track which slot this is
   */
  async runDailyImage(timePeriod: 'morning' | 'afternoon' = 'morning'): Promise<boolean> {
    console.log(`\n🎁 [DAILY_IMAGE] Starting ${timePeriod} "thinking of you" image...`);

    try {
      // Check if we already sent for this time period today
      if (await this.alreadySentForPeriod(timePeriod)) {
        console.log(`📅 [DAILY_IMAGE] Already sent ${timePeriod} image today, skipping`);
        if (timePeriod === 'morning') this.scheduleMorningRun();
        else this.scheduleAfternoonRun();
        return false;
      }

      // Random chance to skip (20% - reduced from 30% since we now have 2 per day)
      if (Math.random() > 0.8) {
        console.log(`📅 [DAILY_IMAGE] Random skip ${timePeriod} (20% chance)`);
        if (timePeriod === 'morning') this.scheduleMorningRun();
        else this.scheduleAfternoonRun();
        return false;
      }

      // Generate creative, contextual prompt using LLM
      console.log('🎨 [DAILY_IMAGE] Generating creative prompt with LLM...');
      const creative = await this.generateCreativePrompt();

      // Generate the image with the creative prompt
      const image = await this.imageGenerator.generateImage({
        prompt: creative.prompt
      });

      if (!image) {
        console.error('❌ [DAILY_IMAGE] Failed to generate image');
        this.scheduleNextRun();
        return false;
      }

      // Get default room for Blake
      const roomId = await this.getBlakeDefaultRoom();

      // Save to chat with the dynamic caption
      if (roomId) {
        await this.saveToChatWithCaption(roomId, image, creative.caption, creative.prompt);
      }

      // Track the send
      await this.trackCreativeSend(image, creative);

      // Send push notification with dynamic text
      await this.sendCreativePushNotification(creative.notification, image, roomId);

      console.log(`✅ [DAILY_IMAGE] ${timePeriod.charAt(0).toUpperCase() + timePeriod.slice(1)} image sent successfully!`);
    } catch (error) {
      console.error(`❌ [DAILY_IMAGE] Error in ${timePeriod}:`, error);
    }

    // Schedule next run for this period (tomorrow)
    if (timePeriod === 'morning') this.scheduleMorningRun();
    else this.scheduleAfternoonRun();
    return true;
  }

  /**
   * Check if we already sent for a specific time period today
   */
  private async alreadySentForPeriod(period: 'morning' | 'afternoon'): Promise<boolean> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const { data } = await this.supabase
      .from('maya_image_sends')
      .select('id, time_of_day')
      .eq('user_id', BLAKE_USER_ID)
      .eq('trigger_type', 'daily_worker')
      .gte('created_at', today.toISOString());

    if (!data || data.length === 0) return false;

    // Check if we've sent for this specific period
    // Morning period = 'morning' time_of_day
    // Afternoon period = 'afternoon' time_of_day
    return data.some(send => send.time_of_day === period);
  }

  /**
   * Legacy: Check if we already sent today (any period)
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
   * Save image message to chat with dynamic caption
   */
  private async saveToChatWithCaption(roomId: string, image: any, caption: string, prompt: string): Promise<void> {
    await this.supabase.from('messages').insert({
      id: crypto.randomUUID(),
      room_id: roomId,
      user_id: MAYA_USER_ID,
      content: caption,
      role: 'assistant',
      metadata: {
        attachments: [{
          type: 'image',
          url: image.url,
          publicUrl: image.publicUrl,
          mimeType: 'image/png',
          name: `maya-daily-${Date.now()}.png`,
          metadata: { generated: true, dailyImage: true, prompt }
        }],
        dailyImage: true,
        creativePrompt: prompt
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
   * Track the creative send in maya_image_sends
   */
  private async trackCreativeSend(image: any, creative: { prompt: string; caption: string; notification: { title: string; body: string } }): Promise<void> {
    const hour = new Date().getHours();
    const timeOfDay = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : hour < 21 ? 'evening' : 'night';

    await this.supabase.from('maya_image_sends').insert({
      user_id: BLAKE_USER_ID,
      image_url: image.url,
      public_url: image.publicUrl,
      prompt: creative.prompt,
      mood_category: 'creative', // New category for LLM-generated
      trigger_type: 'daily_worker',
      time_of_day: timeOfDay,
      day_of_week: new Date().getDay(),
      notification_sent: true,
      notification_title: creative.notification.title,
      notification_body: creative.notification.body
    });
  }

  /**
   * Send push notification with creative text and image preview (rich notification)
   */
  private async sendCreativePushNotification(notification: { title: string; body: string }, image: any, roomId: string | null): Promise<void> {
    // Get Blake's push tokens
    const { data: tokens } = await this.supabase
      .from('user_push_tokens')
      .select('token, platform')
      .eq('user_id', BLAKE_USER_ID);

    if (!tokens || tokens.length === 0) {
      console.log('📱 [DAILY_IMAGE] No push tokens found');
      return;
    }

    // Build messages with rich notification support
    const messages = tokens.map(t => {
      const baseMessage: any = {
        to: t.token,
        sound: 'default',
        title: notification.title,
        body: notification.body,
        data: {
          type: 'maya_daily_image',
          imageUrl: image.publicUrl,
          roomId,
          screen: 'Chat' // Navigate to Chat screen
        },
        _displayInForeground: true,
        // iOS-specific: Rich notification with image attachment
        // This enables image preview on iOS and watchOS
        mutableContent: true, // Required for iOS rich notifications
        categoryId: 'maya_image' // For notification actions
      };

      // Add iOS-specific attachment for image preview
      if (t.platform === 'ios' || !t.platform) {
        // Expo handles rich media via the attachment URL
        // The image will be downloaded and shown in the notification
        baseMessage._contentAvailable = true;
      }

      return baseMessage;
    });

    // For iOS rich notifications, we need to send the image URL in a way iOS can process
    // Expo SDK handles this when you include the image URL in data and set mutableContent
    console.log(`📱 [DAILY_IMAGE] Sending rich notification with image: ${image.publicUrl}`);

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
        const result = await response.json();
        console.log('📱 [DAILY_IMAGE] Rich push notification sent:', JSON.stringify(result));
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
    // Return the earlier of morning or afternoon time
    const nextTime = this.morningTime && this.afternoonTime
      ? (this.morningTime < this.afternoonTime ? this.morningTime : this.afternoonTime)
      : this.morningTime || this.afternoonTime;
    return {
      running: this.isRunning,
      nextRun: nextTime?.toISOString() || null
    };
  }
}

export default DailyImageScheduler;
