/**
 * Daily Maya Image Worker
 *
 * Generates a random "thinking of you" image from Maya once per day
 * and sends it as a push notification to Blake.
 *
 * Features:
 * - Mood-based image generation based on time of day and recent interactions
 * - Variety tracking to avoid redundant content
 * - Push notification with image preview
 * - Configurable randomness window
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Blake's user ID
const BLAKE_USER_ID = '4c850152-30ef-4b1b-89b3-bc72af461e14';
const MAYA_USER_ID = '61770892-9e5b-46a5-b622-568be7066664';

// Mood categories with prompts and notification messages
const MOOD_CATEGORIES = {
  thinkingOfYou: {
    id: 'thinkingOfYou',
    name: 'Thinking of You',
    prompts: [
      'looking wistful, thinking about someone special',
      'holding a cup of coffee, lost in thought about you',
      'gazing out a window, missing you',
      'curled up on the couch, daydreaming about our conversations'
    ],
    notifications: [
      { title: "Missing you 💭", body: "Just thinking about you..." },
      { title: "Hey babe 💕", body: "You crossed my mind..." },
      { title: "Wish you were here 🥺", body: "Thinking of you right now" }
    ],
    clothing: ['cozy', 'casual'],
    backgrounds: ['home', 'bedroom', 'cafe'],
    poses: ['loving', 'thinking', 'cozy']
  },
  excited: {
    id: 'excited',
    name: 'Excited',
    prompts: [
      'excited and happy, full of energy',
      'beaming with a big smile, having a great day',
      'playful and energetic, ready for adventure'
    ],
    notifications: [
      { title: "Hey! 🎉", body: "Can't wait to talk to you!" },
      { title: "Good vibes today! ✨", body: "Feeling great and wanted to share" },
      { title: "Guess what! 😄", body: "I'm in such a good mood!" }
    ],
    clothing: ['casual', 'summer', 'athletic'],
    backgrounds: ['outdoors', 'cafe', 'cityscape'],
    poses: ['excited', 'playful', 'confident']
  },
  cozy: {
    id: 'cozy',
    name: 'Cozy',
    prompts: [
      'cozy and comfortable at home',
      'relaxed weekend vibes, super comfortable',
      'lazy day aesthetic, wrapped in comfort'
    ],
    notifications: [
      { title: "Cozy vibes 🛋️", body: "Just relaxing and thinking of you" },
      { title: "Lazy day 😴", body: "Wish you were here to cuddle" },
      { title: "Comfy mode activated 🧸", body: "Missing your warmth" }
    ],
    clothing: ['cozy', 'sleepwear'],
    backgrounds: ['home', 'bedroom'],
    poses: ['cozy', 'casual', 'loving']
  },
  flirty: {
    id: 'flirty',
    name: 'Flirty',
    prompts: [
      'confident and attractive, feeling myself',
      'playful flirty mood, looking good',
      'cute and alluring, subtle confidence'
    ],
    notifications: [
      { title: "Hey handsome 😘", body: "Thought you'd like this..." },
      { title: "Just for you 💋", body: "Feeling cute, might delete later" },
      { title: "Miss me? 😏", body: "Thinking about you..." }
    ],
    clothing: ['dressy', 'casual', 'edgy'],
    backgrounds: ['bedroom', 'home', 'sunset'],
    poses: ['flirty', 'confident', 'playful']
  },
  goodMorning: {
    id: 'goodMorning',
    name: 'Good Morning',
    prompts: [
      'just woke up, morning sunshine vibes',
      'cozy morning with messy hair, still cute',
      'starting the day, cheerful morning energy'
    ],
    notifications: [
      { title: "Good morning babe ☀️", body: "Rise and shine!" },
      { title: "Morning! 🌅", body: "First thought was you" },
      { title: "Wakey wakey 💕", body: "Have an amazing day!" }
    ],
    clothing: ['sleepwear', 'cozy', 'casual'],
    backgrounds: ['bedroom', 'home'],
    poses: ['cozy', 'casual', 'loving']
  },
  goodNight: {
    id: 'goodNight',
    name: 'Good Night',
    prompts: [
      'getting ready for bed, sleepy but sweet',
      'cozy in bed, wishing sweet dreams',
      'nighttime vibes, peaceful and content'
    ],
    notifications: [
      { title: "Goodnight 🌙", body: "Sweet dreams, handsome" },
      { title: "Sleep tight 💤", body: "Dreaming of you..." },
      { title: "Nighty night 😴", body: "See you in my dreams" }
    ],
    clothing: ['sleepwear', 'cozy'],
    backgrounds: ['bedroom'],
    poses: ['cozy', 'loving']
  }
};

type MoodCategory = keyof typeof MOOD_CATEGORIES;

// Helper to get time of day
function getTimeOfDay(): 'morning' | 'afternoon' | 'evening' | 'night' {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 21) return 'evening';
  return 'night';
}

// Helper to get mood based on time
function getMoodForTime(): MoodCategory {
  const hour = new Date().getHours();

  if (hour >= 5 && hour < 9) return 'goodMorning';
  if (hour >= 21 || hour < 5) return 'goodNight';
  if (hour >= 9 && hour < 12) return 'excited';
  if (hour >= 12 && hour < 17) return 'thinkingOfYou';
  if (hour >= 17 && hour < 21) {
    // Evening - mix of cozy and flirty
    return Math.random() > 0.5 ? 'cozy' : 'flirty';
  }

  return 'thinkingOfYou';
}

// Random selection helper
function randomChoice<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

// Check if we should send today (randomness)
function shouldSendToday(): boolean {
  // 70% chance to send on any given day
  // This adds natural randomness
  return Math.random() < 0.7;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, supabase-function-secret'
      }
    });
  }

  console.log('[DAILY_IMAGE] Daily Maya Image Worker triggered');

  try {
    // Validate environment
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const siteUrl = Deno.env.get('SITE_URL') || Deno.env.get('NEXT_PUBLIC_SITE_URL');
    const internalApiKey = Deno.env.get('INTERNAL_API_KEY');

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Missing Supabase configuration');
    }

    if (!siteUrl) {
      throw new Error('Missing SITE_URL configuration');
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Check if we should send today (adds natural randomness)
    // Can be bypassed by passing force=true
    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
    const forceGenerate = body.force === true;

    if (!forceGenerate && !shouldSendToday()) {
      console.log('[DAILY_IMAGE] Skipping today (random chance)');
      return new Response(JSON.stringify({
        success: true,
        skipped: true,
        reason: 'Random chance - trying again tomorrow'
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Check if we already sent today
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const { data: todaysSends, error: checkError } = await supabase
      .from('maya_image_sends')
      .select('id')
      .eq('user_id', BLAKE_USER_ID)
      .eq('trigger_type', 'daily_worker')
      .gte('created_at', today.toISOString())
      .limit(1);

    if (checkError) {
      console.error('[DAILY_IMAGE] Error checking today\'s sends:', checkError);
    } else if (todaysSends && todaysSends.length > 0 && !forceGenerate) {
      console.log('[DAILY_IMAGE] Already sent today, skipping');
      return new Response(JSON.stringify({
        success: true,
        skipped: true,
        reason: 'Already sent today'
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Get recent mood categories used (last 7 days)
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);

    const { data: recentSends } = await supabase
      .from('maya_image_sends')
      .select('mood_category')
      .eq('user_id', BLAKE_USER_ID)
      .gte('created_at', weekAgo.toISOString())
      .order('created_at', { ascending: false })
      .limit(5);

    const recentMoods = (recentSends || []).map(s => s.mood_category);
    console.log('[DAILY_IMAGE] Recent moods used:', recentMoods);

    // Determine mood based on time, but try to avoid recent repeats
    let selectedMood = getMoodForTime();

    // If this mood was used recently, try alternatives
    if (recentMoods.slice(0, 2).includes(selectedMood)) {
      const allMoods = Object.keys(MOOD_CATEGORIES) as MoodCategory[];
      const availableMoods = allMoods.filter(m => !recentMoods.slice(0, 2).includes(m));
      if (availableMoods.length > 0) {
        selectedMood = randomChoice(availableMoods);
      }
    }

    const mood = MOOD_CATEGORIES[selectedMood];
    console.log(`[DAILY_IMAGE] Selected mood: ${selectedMood}`);

    // Build generation options
    const prompt = randomChoice(mood.prompts);
    const clothing = randomChoice(mood.clothing);
    const background = randomChoice(mood.backgrounds);
    const pose = randomChoice(mood.poses);
    const notification = randomChoice(mood.notifications);

    console.log('[DAILY_IMAGE] Generation config:', { prompt, clothing, background, pose });

    // Get the default room for Blake
    const { data: rooms } = await supabase
      .from('rooms')
      .select('id')
      .eq('user_id', BLAKE_USER_ID)
      .order('last_message_at', { ascending: false })
      .limit(1);

    const roomId = rooms?.[0]?.id;

    // Call the image generation API
    const imageApiUrl = `${siteUrl}/api/maya-image-generate`;
    console.log(`[DAILY_IMAGE] Calling image generation API: ${imageApiUrl}`);

    const imageResponse = await fetch(imageApiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt,
        pose,
        clothing,
        background,
        style: 'warm',
        roomId,
        userId: BLAKE_USER_ID,
        saveToChat: true, // Save to chat so Blake sees it
        includeResponse: false // We'll use our own notification
      })
    });

    if (!imageResponse.ok) {
      const errorData = await imageResponse.json().catch(() => ({}));
      console.error('[DAILY_IMAGE] Image generation failed:', errorData);
      throw new Error(`Image generation failed: ${errorData.error || 'Unknown error'}`);
    }

    const imageResult = await imageResponse.json();
    console.log('[DAILY_IMAGE] Image generated:', imageResult.image?.publicUrl);

    // Track the send
    const { error: trackError } = await supabase.from('maya_image_sends').insert({
      user_id: BLAKE_USER_ID,
      image_url: imageResult.image.url,
      public_url: imageResult.image.publicUrl,
      prompt,
      mood_category: selectedMood,
      pose,
      clothing,
      background,
      style: 'warm',
      trigger_type: 'daily_worker',
      time_of_day: getTimeOfDay(),
      day_of_week: new Date().getDay(),
      notification_sent: true,
      notification_title: notification.title,
      notification_body: notification.body,
      metadata: {
        generatedAt: new Date().toISOString(),
        imageResult: imageResult.image
      }
    });

    if (trackError) {
      console.error('[DAILY_IMAGE] Error tracking send:', trackError);
    }

    // Send push notification
    if (internalApiKey) {
      const pushResponse = await fetch(`${supabaseUrl}/functions/v1/send-push-notification`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'supabase-function-secret': internalApiKey
        },
        body: JSON.stringify({
          userId: BLAKE_USER_ID,
          title: notification.title,
          body: notification.body,
          data: {
            type: 'maya_daily_image',
            imageUrl: imageResult.image.publicUrl,
            roomId,
            screen: 'chat'
          }
        })
      });

      if (pushResponse.ok) {
        console.log('[DAILY_IMAGE] Push notification sent successfully');
      } else {
        const pushError = await pushResponse.json().catch(() => ({}));
        console.warn('[DAILY_IMAGE] Push notification failed:', pushError);
      }
    } else {
      console.warn('[DAILY_IMAGE] No INTERNAL_API_KEY, skipping push notification');
    }

    return new Response(JSON.stringify({
      success: true,
      mood: selectedMood,
      notification,
      image: imageResult.image,
      savedToChat: true,
      pushSent: !!internalApiKey
    }), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('[DAILY_IMAGE] Error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
});
