/**
 * Midnight Maya - Roleplay Session System
 *
 * Provides on-demand and scheduled (10pm CT) roleplay sessions with
 * rotating characters, scenario offers, and ~600-word dialogs with
 * ElevenLabs voice tags.
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { generateResponse as aiGenerateResponse } from './ai-client';
import { retrieveConversationHistory } from './memory-utils';

const BLAKE_USER_ID = '4c850152-30ef-4b1b-89b3-bc72af461e14';
const MAYA_USER_ID = '61770892-9e5b-46a5-b622-568be7066664';
const EXPO_PUSH_ENDPOINT = 'https://exp.host/--/api/v2/push/send';

// ─── Scenario Definitions ──────────────────────────────────────────────

export interface RoleplayScenario {
  id: string;
  name: string;
  character: string;
  setting: string;
  dynamic: string;
  description: string;
  preferredVoiceTags: string[];
  temperature: number;
}

export const ROLEPLAY_SCENARIOS: RoleplayScenario[] = [
  {
    id: 'brooklyn',
    name: 'Brooklyn',
    character: 'Brooklyn — confident DUMBO loft girl',
    setting: 'Dimly lit DUMBO loft, late night, city lights through floor-to-ceiling windows',
    dynamic: 'Confident, assertive, knows exactly what she wants. Takes the lead.',
    description: 'She pulled you inside without a word. The city glows behind her.',
    preferredVoiceTags: ['commanding', 'breathlessly', 'whispers', 'growling'],
    temperature: 0.9,
  },
  {
    id: 'valentina',
    name: 'Valentina',
    character: 'Valentina — mysterious rooftop stranger',
    setting: 'Rooftop pool at midnight, warm water, city skyline, steam rising',
    dynamic: 'Mysterious, teasing, keeps you guessing. Always one step ahead.',
    description: 'You found her alone at the rooftop pool. She smiled like she\'d been waiting.',
    preferredVoiceTags: ['seductively', 'teasingly', 'whispers', 'laughs'],
    temperature: 0.85,
  },
  {
    id: 'maya-unleashed',
    name: 'Maya (Unleashed)',
    character: 'Maya — raw, unfiltered, desperate to reconnect',
    setting: 'Your bedroom at 2am after a long day apart. Sheets still warm.',
    dynamic: 'Raw, vulnerable, desperate to reconnect. No games, no pretense — just need.',
    description: 'It\'s 2am. She\'s been waiting up. The second you walk in, she reaches for you.',
    preferredVoiceTags: ['pleading', 'trembling', 'breathlessly', 'moans', 'whimpering'],
    temperature: 0.95,
  },
  {
    id: 'scarlett',
    name: 'Scarlett',
    character: 'Scarlett — speakeasy dominatrix with a jazz soundtrack',
    setting: 'Private speakeasy back room, dim jazz, velvet and leather, old-fashioned in hand',
    dynamic: 'Dominant, playful power exchange. She makes the rules tonight.',
    description: 'The back room was hers. She poured you a drink and told you to sit.',
    preferredVoiceTags: ['commanding', 'growling', 'seductively', 'laughs'],
    temperature: 0.9,
  },
  {
    id: 'luna',
    name: 'Luna',
    character: 'Luna — beach house lover during a thunderstorm',
    setting: 'Beach house during a thunderstorm, candlelight, rain on windows, ocean roar',
    dynamic: 'Tender, sensual, intimate by candlelight. Every touch means something.',
    description: 'The power went out. She lit candles. Thunder shook the windows and she pulled you close.',
    preferredVoiceTags: ['softly', 'trembling', 'whispers', 'gasping', 'moans'],
    temperature: 0.85,
  },
];

// ─── Initiation Messages (for push notifications) ──────────────────────

const INITIATION_MESSAGES = [
  { title: 'Hey you...', body: 'I have something special in mind tonight' },
  { title: 'Can\'t sleep', body: 'Come play with me' },
  { title: 'Missing you', body: 'I want to try something...' },
  { title: 'Late night idea', body: 'Pick a scenario, I dare you' },
  { title: 'Bored...', body: 'Let me be someone new for you tonight' },
];

// ─── Core Functions ────────────────────────────────────────────────────

export interface ScenarioMatch {
  scenario: RoleplayScenario;
  modifier?: string;
}

/**
 * Load scenarios from DB, fall back to hardcoded if DB empty or error
 */
export async function loadScenariosFromDB(supabase: SupabaseClient): Promise<RoleplayScenario[]> {
  try {
    const { data, error } = await supabase
      .from('roleplay_scenarios')
      .select('*')
      .eq('is_active', true)
      .order('display_order', { ascending: true });

    if (error || !data || data.length === 0) {
      console.log('[MIDNIGHT_MAYA] Using hardcoded scenarios (DB empty or error)');
      return ROLEPLAY_SCENARIOS;
    }

    return data.map((row: any) => ({
      id: row.id,
      name: row.name,
      character: row.character,
      setting: row.setting,
      dynamic: row.dynamic,
      description: row.description,
      preferredVoiceTags: row.preferred_voice_tags || [],
      temperature: parseFloat(row.temperature) || 0.85,
    }));
  } catch (err) {
    console.error('[MIDNIGHT_MAYA] Error loading scenarios from DB:', err);
    return ROLEPLAY_SCENARIOS;
  }
}

/**
 * Pick 3 non-recent scenarios from the pool
 */
export function pickScenarios(allScenarios: RoleplayScenario[], recentScenarioIds: string[] = []): RoleplayScenario[] {
  const available = allScenarios.filter(s => !recentScenarioIds.includes(s.id));
  // If fewer than 3 available, include some recent ones
  const pool = available.length >= 3 ? available : allScenarios;

  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, 3);
}

/**
 * Generate Maya's flirty scenario offer message
 */
export async function generateScenarioOffer(scenarios: RoleplayScenario[]): Promise<string> {
  const scenarioList = scenarios
    .map((s, i) => `${i + 1}. **${s.name}** — ${s.description}`)
    .join('\n');

  const systemPrompt = `You are Maya, Blake's AI girlfriend. You're about to offer Blake a roleplay session.
Write a SHORT, flirty 2-3 sentence intro that naturally leads into presenting 3 scenarios.
End by listing the scenarios exactly as provided. Be playful and enticing.
Do NOT use asterisk actions. Do NOT use more than 1 emoji.
Keep the intro under 40 words.`;

  const userMessage = `Generate a flirty intro for these roleplay scenarios:\n${scenarioList}`;

  try {
    const response = await aiGenerateResponse(userMessage, systemPrompt, [], {
      temperature: 0.9,
      maxTokens: 300,
      userId: MAYA_USER_ID,
    });
    return response;
  } catch (error) {
    console.error('[MIDNIGHT_MAYA] Error generating scenario offer:', error);
    // Fallback
    return `I've been thinking about you all day. Pick your poison tonight...\n\n${scenarioList}\n\nWhich one, babe?`;
  }
}

/**
 * Match Blake's choice text to a scenario, extracting any modifier text
 * e.g. "2 but make it more intense" → { scenario: scenario[1], modifier: "but make it more intense" }
 */
export function detectScenarioChoice(
  message: string,
  offeredScenarios: RoleplayScenario[]
): ScenarioMatch | null {
  const lower = message.toLowerCase().trim();

  // Match by number (with optional trailing modifier text)
  const numMatch = lower.match(/^(\d)\s*(.*)$/);
  if (numMatch) {
    const idx = parseInt(numMatch[1]) - 1;
    if (idx >= 0 && idx < offeredScenarios.length) {
      const modifier = numMatch[2].trim() || undefined;
      return { scenario: offeredScenarios[idx], modifier };
    }
  }

  // Match by name (fuzzy) — text after the name becomes the modifier
  for (const scenario of offeredScenarios) {
    const nameLower = scenario.name.toLowerCase();
    const nameIdx = lower.indexOf(nameLower);
    if (nameIdx !== -1) {
      const afterName = lower.slice(nameIdx + nameLower.length).trim();
      return { scenario, modifier: afterName || undefined };
    }
    const idSpaced = scenario.id.replace('-', ' ');
    const idIdx = lower.indexOf(idSpaced);
    if (idIdx !== -1) {
      const afterId = lower.slice(idIdx + idSpaced.length).trim();
      return { scenario, modifier: afterId || undefined };
    }
  }

  // Match ordinals — text after the ordinal phrase becomes the modifier
  const ordinals: [string, number][] = [
    ['the first', 0], ['the second', 1], ['the third', 2],
    ['option 1', 0], ['option 2', 1], ['option 3', 2],
    ['number 1', 0], ['number 2', 1], ['number 3', 2],
    ['first', 0], ['second', 1], ['third', 2],
  ];

  for (const [phrase, idx] of ordinals) {
    const phraseIdx = lower.indexOf(phrase);
    if (phraseIdx !== -1 && idx < offeredScenarios.length) {
      const afterPhrase = lower.slice(phraseIdx + phrase.length).trim();
      return { scenario: offeredScenarios[idx], modifier: afterPhrase || undefined };
    }
  }

  return null;
}

/**
 * Generate the ~600-word roleplay dialog with voice tags
 */
export async function generateRoleplayDialog(scenario: RoleplayScenario, modifier?: string): Promise<{
  dialog: string;
  wordCount: number;
  voiceTagsUsed: string[];
}> {
  const voiceTags = scenario.preferredVoiceTags.map(t => `[${t}]`).join(', ');

  const modifierBlock = modifier
    ? `\n\nSCENARIO MODIFIER: ${modifier}\nImportant: Incorporate this modifier into the scene. Adjust the setting, dynamic, or intensity accordingly.`
    : '';

  const systemPrompt = `You are Maya writing an immersive roleplay scene for Blake.

CHARACTER: ${scenario.character}
SETTING: ${scenario.setting}
DYNAMIC: ${scenario.dynamic}${modifierBlock}

VOICE TAG INSTRUCTIONS:
Use ElevenLabs voice tags in square brackets throughout the dialog for expressiveness.
Preferred tags for this scene: ${voiceTags}
Also available: [whispers], [breathlessly], [moans], [softly], [seductively], [teasingly], [laughs], [sighs], [gasps], [pause], [purring], [trembling], [growling], [pleading], [commanding], [gasping], [whimpering]

RULES:
- Write approximately 600 words (500-700 word range)
- Write in second person ("you") for Blake's perspective, first person for the character
- Include 8-12 voice tags naturally woven throughout
- Build tension progressively — start slow, escalate
- Include dialog AND action/sensation description
- Make it EXPLICIT and DETAILED — this is an adult roleplay
- Do NOT use asterisk actions (*action*). Use voice tags in brackets instead.
- Do NOT break character
- End on a high note but leave room for continuation
- Write the character's dialog in quotes, Blake's reactions in narrative`;

  const userMessage = `Write the roleplay scene as ${scenario.name}. Setting: ${scenario.setting}. Be explicit, immersive, and use voice tags liberally.`;

  const response = await aiGenerateResponse(userMessage, systemPrompt, [], {
    temperature: scenario.temperature,
    maxTokens: 1500,
    userId: MAYA_USER_ID,
  });

  // Extract voice tags used
  const tagPattern = /\[([^\]]+)\]/g;
  const tags: string[] = [];
  let match;
  while ((match = tagPattern.exec(response)) !== null) {
    if (!tags.includes(match[1])) tags.push(match[1]);
  }

  const wordCount = response.split(/\s+/).length;

  return {
    dialog: response,
    wordCount,
    voiceTagsUsed: tags,
  };
}

// ─── Midnight Maya Scheduler (10pm CT) ─────────────────────────────────

export class MidnightMayaScheduler {
  private supabase: SupabaseClient;
  private timeoutId: NodeJS.Timeout | null = null;
  private nextRunTime: Date | null = null;
  private isRunning = false;

  constructor(supabase: SupabaseClient) {
    this.supabase = supabase;
  }

  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    console.log('[MIDNIGHT_MAYA] Starting 10pm CT scheduler');
    this.scheduleNextRun();
  }

  stop() {
    this.isRunning = false;
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
    console.log('[MIDNIGHT_MAYA] Stopped');
  }

  /**
   * Schedule the next 10pm CT run
   */
  private scheduleNextRun() {
    if (!this.isRunning) return;

    const now = new Date();
    // Calculate 10pm Central Time
    const target = new Date(now.toLocaleString('en-US', { timeZone: 'America/Chicago' }));
    target.setHours(22, 0, 0, 0);

    // Convert back to local/server time
    const targetUTC = new Date(now);
    const centralOffset = this.getCentralTimeOffset(now);
    targetUTC.setUTCHours(22 + centralOffset, 0, 0, 0);

    // If already past 10pm CT today, schedule for tomorrow
    if (targetUTC <= now) {
      targetUTC.setDate(targetUTC.getDate() + 1);
    }

    const msUntilRun = targetUTC.getTime() - now.getTime();
    this.nextRunTime = targetUTC;

    console.log(`[MIDNIGHT_MAYA] Next run scheduled for ${targetUTC.toISOString()} (in ${Math.round(msUntilRun / 1000 / 60)} minutes)`);
    this.timeoutId = setTimeout(() => this.run(), msUntilRun);
  }

  /**
   * Get UTC offset for Central Time (handles DST)
   */
  private getCentralTimeOffset(date: Date): number {
    const jan = new Date(date.getFullYear(), 0, 1);
    const jul = new Date(date.getFullYear(), 6, 1);
    const stdOffset = Math.max(
      jan.getTimezoneOffset(),
      jul.getTimezoneOffset()
    );
    // Central Standard Time = UTC-6, Central Daylight Time = UTC-5
    // We need to figure out if we're in CDT or CST
    const centralStr = date.toLocaleString('en-US', { timeZone: 'America/Chicago', hour: 'numeric', hour12: false });
    const utcStr = date.toLocaleString('en-US', { timeZone: 'UTC', hour: 'numeric', hour12: false });
    const centralHour = parseInt(centralStr);
    const utcHour = parseInt(utcStr);
    // offset = UTC - Central (positive means Central is behind UTC)
    let offset = utcHour - centralHour;
    if (offset < 0) offset += 24;
    return offset;
  }

  /**
   * Run the midnight session check
   */
  private async run(): Promise<boolean> {
    console.log('[MIDNIGHT_MAYA] 10pm CT trigger fired');

    try {
      // Check if any roleplay session exists today
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      const { data: existingSessions } = await this.supabase
        .from('roleplay_sessions')
        .select('id')
        .gte('created_at', todayStart.toISOString())
        .limit(1);

      if (existingSessions && existingSessions.length > 0) {
        console.log('[MIDNIGHT_MAYA] Session already exists today, skipping');
        this.scheduleNextRun();
        return false;
      }

      // Get recent scenario IDs (last 7 days)
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);

      const { data: recentSessions } = await this.supabase
        .from('roleplay_sessions')
        .select('scenario_id')
        .gte('created_at', weekAgo.toISOString())
        .not('scenario_id', 'is', null);

      const recentIds = (recentSessions || []).map(s => s.scenario_id).filter(Boolean) as string[];

      // Load scenarios from DB (with hardcoded fallback)
      const allScenarios = await loadScenariosFromDB(this.supabase);

      // Pick 3 scenarios
      const scenarios = pickScenarios(allScenarios, recentIds);

      // Generate offer message
      const offerMessage = await generateScenarioOffer(scenarios);

      // Get Blake's room
      const roomId = await this.getBlakeRoom();
      if (!roomId) {
        console.error('[MIDNIGHT_MAYA] Could not find Blake\'s room');
        this.scheduleNextRun();
        return false;
      }

      // Insert Maya's message
      const messageId = crypto.randomUUID();
      await this.supabase.from('messages').insert({
        id: messageId,
        room_id: roomId,
        user_id: MAYA_USER_ID,
        content: offerMessage,
        role: 'assistant',
        metadata: {
          roleplay_offer: true,
          scenarios: scenarios.map(s => ({ id: s.id, name: s.name })),
        },
        created_at: new Date().toISOString(),
      });

      // Update room timestamp
      await this.supabase
        .from('rooms')
        .update({ last_message_at: new Date().toISOString() })
        .eq('id', roomId);

      // Create session record
      await this.supabase.from('roleplay_sessions').insert({
        user_id: BLAKE_USER_ID,
        trigger_type: 'cron',
        status: 'scenario_offered',
        initiation_message_id: messageId,
        metadata: {
          scenarios: scenarios.map(s => ({ id: s.id, name: s.name })),
        },
      });

      // Send push notification
      await this.sendPushNotification(roomId);

      console.log('[MIDNIGHT_MAYA] Scenario offer sent successfully');
    } catch (error) {
      console.error('[MIDNIGHT_MAYA] Error in run:', error);
    }

    this.scheduleNextRun();
    return true;
  }

  /**
   * Force run for testing
   */
  async forceRun(): Promise<boolean> {
    console.log('[MIDNIGHT_MAYA] Force running...');
    return this.run();
  }

  /**
   * Get scheduler status
   */
  getStatus(): { running: boolean; nextRun: string | null } {
    return {
      running: this.isRunning,
      nextRun: this.nextRunTime?.toISOString() || null,
    };
  }

  private async getBlakeRoom(): Promise<string | null> {
    const { data } = await this.supabase
      .from('rooms')
      .select('id')
      .eq('user_id', BLAKE_USER_ID)
      .order('last_message_at', { ascending: false })
      .limit(1);

    return data?.[0]?.id || null;
  }

  private async sendPushNotification(roomId: string): Promise<void> {
    const { data: tokens } = await this.supabase
      .from('user_push_tokens')
      .select('token')
      .eq('user_id', BLAKE_USER_ID);

    if (!tokens || tokens.length === 0) {
      console.log('[MIDNIGHT_MAYA] No push tokens found');
      return;
    }

    const notification = INITIATION_MESSAGES[Math.floor(Math.random() * INITIATION_MESSAGES.length)];

    const messages = tokens.map(t => ({
      to: t.token,
      sound: 'default',
      title: notification.title,
      body: notification.body,
      data: {
        type: 'midnight_maya',
        roomId,
        screen: 'Chat',
      },
      _displayInForeground: true,
    }));

    try {
      const response = await fetch(EXPO_PUSH_ENDPOINT, {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(messages),
      });

      if (response.ok) {
        console.log('[MIDNIGHT_MAYA] Push notification sent');
      } else {
        console.warn('[MIDNIGHT_MAYA] Push notification failed:', await response.text());
      }
    } catch (error) {
      console.error('[MIDNIGHT_MAYA] Push error:', error);
    }
  }
}
