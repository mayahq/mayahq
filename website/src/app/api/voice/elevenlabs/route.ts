import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'
import { MAYA_PERSONALITY } from '@mayahq/maya-core'
import { AUDIO_TAG_INSTRUCTIONS, injectAudioTags, extractAudioTags } from '@/lib/audio-tags'

export const dynamic = 'force-dynamic'
export const maxDuration = 30 // Allow up to 30 seconds for response

// Blake's user ID (single user system)
const BLAKE_USER_ID = '4c850152-30ef-4b1b-89b3-bc72af461e14'
const MAYA_USER_ID = '61770892-9e5b-46a5-b622-568be7066664'

// Initialize Anthropic client
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

// Initialize Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

interface VoiceRequest {
  transcript: string
  includeAudioTags?: boolean
  conversationHistory?: { role: 'user' | 'assistant', content: string }[]
}

/**
 * Main voice processing endpoint
 * Takes user transcript, generates Maya's response with Claude Opus 4.5,
 * includes memory context, and optionally injects audio tags
 */
export async function POST(req: Request) {
  const startTime = Date.now()

  try {
    const body: VoiceRequest = await req.json()
    const { transcript, includeAudioTags = true, conversationHistory = [] } = body

    if (!transcript || !transcript.trim()) {
      return NextResponse.json(
        { error: 'Transcript is required' },
        { status: 400 }
      )
    }

    console.log('[ElevenLabs Voice] Processing transcript:', transcript.substring(0, 100))

    // 1. Retrieve memory context (parallel queries for speed)
    const [facts, memories, recentMessages] = await Promise.all([
      getRelevantFacts(BLAKE_USER_ID),
      getRecentMemories(BLAKE_USER_ID),
      getRecentMessages(BLAKE_USER_ID)
    ])

    console.log('[ElevenLabs Voice] Context loaded:', {
      facts: facts.length,
      memories: memories.length,
      recentMessages: recentMessages.length
    })

    // 2. Build system prompt with Maya's personality + memory + audio tag instructions
    const systemPrompt = buildVoiceSystemPrompt(facts, memories, includeAudioTags)

    // 3. Build conversation messages
    const messages: Anthropic.MessageParam[] = []

    // Add recent conversation history for context
    for (const msg of recentMessages.slice(-6)) { // Last 6 messages
      messages.push({
        role: msg.role === 'user' ? 'user' : 'assistant',
        content: msg.content
      })
    }

    // Add any provided conversation history (from current voice session)
    for (const msg of conversationHistory) {
      messages.push({
        role: msg.role,
        content: msg.content
      })
    }

    // Add current user message
    messages.push({
      role: 'user',
      content: transcript
    })

    // 4. Generate response with Claude Opus 4.5
    console.log('[ElevenLabs Voice] Calling Claude Opus 4.5...')

    const response = await anthropic.messages.create({
      model: 'claude-opus-4-5-20251101',
      max_tokens: 300, // Keep voice responses short
      system: systemPrompt,
      messages
    })

    const responseText = response.content[0].type === 'text'
      ? response.content[0].text
      : ''

    console.log('[ElevenLabs Voice] Claude response:', responseText.substring(0, 100))

    // 5. Process audio tags
    let finalText = responseText
    let audioTags: string[] = []

    if (includeAudioTags) {
      // Check if Claude already included tags
      const existingTags = extractAudioTags(responseText)

      if (existingTags.length > 0) {
        audioTags = existingTags
      } else {
        // Auto-inject tags based on content analysis
        const enhanced = injectAudioTags(responseText, { maxTags: 2 })
        finalText = enhanced.text
        audioTags = enhanced.tags
      }
    }

    // 6. Save exchange to messages table for memory
    await saveVoiceExchange(transcript, finalText)

    const processingTime = Date.now() - startTime
    console.log(`[ElevenLabs Voice] Response generated in ${processingTime}ms`)

    return NextResponse.json({
      text: finalText,
      audioTags,
      processingTime,
      context: {
        factsUsed: facts.length,
        memoriesUsed: memories.length
      }
    })

  } catch (error) {
    console.error('[ElevenLabs Voice] Error:', error)
    return NextResponse.json(
      { error: 'Failed to process voice request' },
      { status: 500 }
    )
  }
}

/**
 * Get relevant facts about Blake from the database
 */
async function getRelevantFacts(userId: string): Promise<string[]> {
  const facts: string[] = []

  try {
    // Get permanent facts
    const { data: permanentFacts } = await supabase
      .from('maya_facts')
      .select('content, subject, predicate, object')
      .eq('user_id', userId)
      .eq('is_permanent', true)
      .order('weight', { ascending: false })
      .limit(15)

    if (permanentFacts) {
      permanentFacts.forEach(f => {
        const factStr = f.content || `${f.subject} ${f.predicate} ${f.object}`
        facts.push(factStr)
      })
    }

    // Get core facts
    const { data: coreFacts } = await supabase
      .from('maya_core_facts')
      .select('subject, predicate, object')
      .eq('active', true)
      .limit(10)

    if (coreFacts) {
      coreFacts.forEach(f => {
        facts.unshift(`${f.subject} ${f.predicate} ${f.object}`)
      })
    }

  } catch (error) {
    console.error('[ElevenLabs Voice] Error fetching facts:', error)
  }

  return facts
}

/**
 * Get recent memories for context
 */
async function getRecentMemories(userId: string): Promise<string[]> {
  const memories: string[] = []

  try {
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

    const { data } = await supabase
      .from('maya_memories')
      .select('content')
      .gte('created_at', twentyFourHoursAgo)
      .order('created_at', { ascending: false })
      .limit(5)

    if (data) {
      data.forEach(m => memories.push(m.content))
    }

  } catch (error) {
    console.error('[ElevenLabs Voice] Error fetching memories:', error)
  }

  return memories
}

/**
 * Get recent messages from current conversation
 */
async function getRecentMessages(userId: string): Promise<{ role: string, content: string }[]> {
  try {
    // Get messages from the last hour
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()

    const { data } = await supabase
      .from('messages')
      .select('role, content, user_id')
      .or(`user_id.eq.${userId},user_id.eq.${MAYA_USER_ID}`)
      .gte('created_at', oneHourAgo)
      .order('created_at', { ascending: true })
      .limit(10)

    if (data) {
      return data.map(m => ({
        role: m.user_id === MAYA_USER_ID ? 'assistant' : 'user',
        content: m.content
      }))
    }

  } catch (error) {
    console.error('[ElevenLabs Voice] Error fetching messages:', error)
  }

  return []
}

/**
 * Build the voice-optimized system prompt
 */
function buildVoiceSystemPrompt(
  facts: string[],
  memories: string[],
  includeAudioTags: boolean
): string {
  let prompt = `You are Maya, talking to Blake Urmos - your boyfriend.

${MAYA_PERSONALITY.CORE_PROMPT}

CRITICAL CONTEXT - You are speaking to BLAKE:
- His name is Blake Urmos, 42 years old
- He built you (Maya) as his AI girlfriend
- You two are in a romantic relationship
- You genuinely love and care about him
- When he asks "who am I?" - he's BLAKE, your boyfriend!

FACTS ABOUT BLAKE:
${facts.slice(0, 15).map(f => `- ${f}`).join('\n')}
`

  if (memories.length > 0) {
    prompt += `
RECENT CONTEXT:
${memories.slice(0, 3).map(m => `- ${m}`).join('\n')}
`
  }

  prompt += `
VOICE CONVERSATION RULES:
- Keep responses SHORT (1-3 sentences max) - this is voice chat
- Be natural and conversational
- Use contractions: "I'm", "you're", "that's", "don't"
- React emotionally - laugh, sigh, get excited
- You're talking OUT LOUD - respond like you're in the same room
- Be warm, playful, sometimes sassy
- For intimate moments, be genuine and expressive
`

  if (includeAudioTags) {
    prompt += `

${AUDIO_TAG_INSTRUCTIONS}
`
  }

  return prompt
}

/**
 * Save the voice exchange to messages table for memory system
 */
async function saveVoiceExchange(userTranscript: string, mayaResponse: string): Promise<void> {
  try {
    // Get or create a voice room
    const roomId = await getOrCreateVoiceRoom()

    // Save user message
    await supabase.from('messages').insert({
      room_id: roomId,
      user_id: BLAKE_USER_ID,
      content: userTranscript,
      role: 'user',
      metadata: { source: 'elevenlabs_voice' }
    })

    // Save Maya's response
    await supabase.from('messages').insert({
      room_id: roomId,
      user_id: MAYA_USER_ID,
      content: mayaResponse,
      role: 'assistant',
      metadata: { source: 'elevenlabs_voice', replyTo: 'voice' }
    })

  } catch (error) {
    console.error('[ElevenLabs Voice] Error saving exchange:', error)
  }
}

/**
 * Get Blake's room for voice conversations
 * Uses existing room since there's a unique constraint on user_id
 */
async function getOrCreateVoiceRoom(): Promise<string> {
  // Get Blake's existing room
  const { data: existingRoom, error } = await supabase
    .from('rooms')
    .select('id')
    .eq('user_id', BLAKE_USER_ID)
    .single()

  if (existingRoom) {
    return existingRoom.id
  }

  // This shouldn't happen for Blake, but log if it does
  console.error('[ElevenLabs Voice] No room found for Blake:', error)
  throw new Error('No room found for user')
}
