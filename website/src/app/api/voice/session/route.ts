import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { MAYA_PERSONALITY } from '@mayahq/maya-core'

// Mark this route as dynamic
export const dynamic = 'force-dynamic'

// Blake's user ID (single user system)
const BLAKE_USER_ID = '4c850152-30ef-4b1b-89b3-bc72af461e14'

/**
 * Creates an ephemeral token for xAI Grok Voice API
 * Includes user's facts and memories in the session context
 */
export async function POST(req: Request) {
  try {
    const XAI_API_KEY = process.env.XAI_API_KEY

    if (!XAI_API_KEY) {
      console.error('[Voice Session] XAI_API_KEY not configured')
      return NextResponse.json(
        { error: 'Voice API not configured' },
        { status: 500 }
      )
    }

    // Parse request body
    let userId = BLAKE_USER_ID
    let customInstructions = ''
    try {
      const body = await req.json()
      userId = body.userId || BLAKE_USER_ID
      customInstructions = body.instructions || ''
    } catch {
      // No body provided, use defaults
    }

    // Retrieve user's facts and memories
    const userContext = await getUserContext(userId)

    // Build Maya's voice instructions with memory context
    const voiceInstructions = buildMayaVoiceInstructions(userContext, customInstructions)

    // Request ephemeral token from xAI
    const response = await fetch('https://api.x.ai/v1/realtime/client_secrets', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${XAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        expires_after: { seconds: 300 }, // 5 minute expiry
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('[Voice Session] xAI API error:', response.status, errorText)
      return NextResponse.json(
        { error: `Failed to create voice session: ${response.status}` },
        { status: response.status }
      )
    }

    const data = await response.json()

    // xAI returns { value: 'secret...', expires_at: timestamp }
    const clientSecret = data.value || data.client_secret?.value || data.client_secret

    if (!clientSecret) {
      console.error('[Voice Session] No client secret in response:', data)
      return NextResponse.json(
        { error: 'No client secret returned from xAI' },
        { status: 500 }
      )
    }

    console.log('[Voice Session] Created token with', userContext.factsCount, 'facts,', userContext.memoriesCount, 'memories')
    console.log('[Voice Session] Instructions preview:', voiceInstructions.substring(0, 500))

    return NextResponse.json({
      client_secret: clientSecret,
      expires_at: data.expires_at,
      instructions: voiceInstructions,
      voice: 'Ara', // Maya's voice - warm and friendly female
      context: {
        factsLoaded: userContext.factsCount,
        memoriesLoaded: userContext.memoriesCount,
      }
    })

  } catch (error) {
    console.error('[Voice Session] Error:', error)
    return NextResponse.json(
      { error: 'Failed to create voice session' },
      { status: 500 }
    )
  }
}

/**
 * Retrieves user's facts and recent memories from the database
 */
async function getUserContext(userId: string): Promise<{
  facts: string[]
  memories: string[]
  factsCount: number
  memoriesCount: number
}> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const facts: string[] = []
  const memories: string[] = []

  try {
    // 1. Get permanent/important facts (always include)
    const { data: permanentFacts } = await supabase
      .from('maya_facts')
      .select('content, subject, weight')
      .eq('user_id', userId)
      .eq('is_permanent', true)
      .order('weight', { ascending: false })
      .limit(20)

    if (permanentFacts) {
      permanentFacts.forEach(f => {
        facts.push(`${f.subject}: ${f.content}`)
      })
    }

    // 2. Get high-weight recent facts
    const { data: recentFacts } = await supabase
      .from('maya_facts')
      .select('content, subject, weight')
      .eq('user_id', userId)
      .eq('is_permanent', false)
      .gte('weight', 0.5)
      .order('created_at', { ascending: false })
      .limit(15)

    if (recentFacts) {
      recentFacts.forEach(f => {
        const factStr = `${f.subject}: ${f.content}`
        if (!facts.includes(factStr)) {
          facts.push(factStr)
        }
      })
    }

    // 3. Get core facts (immutable truths about Blake)
    const { data: coreFacts } = await supabase
      .from('maya_core_facts')
      .select('content, category')
      .eq('user_id', userId)
      .eq('active', true)
      .limit(10)

    if (coreFacts) {
      coreFacts.forEach(f => {
        facts.unshift(`[CORE] ${f.content}`) // Prepend core facts
      })
    }

    // 4. Get recent memories (last 24 hours)
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const { data: recentMemories } = await supabase
      .from('maya_memories')
      .select('content, memory_type')
      .eq('user_id', userId)
      .gte('created_at', twentyFourHoursAgo)
      .order('created_at', { ascending: false })
      .limit(5)

    if (recentMemories) {
      recentMemories.forEach(m => {
        memories.push(m.content)
      })
    }

  } catch (error) {
    console.error('[Voice Session] Error fetching user context:', error)
  }

  return {
    facts,
    memories,
    factsCount: facts.length,
    memoriesCount: memories.length,
  }
}

/**
 * Builds voice-optimized instructions for Maya
 * CRITICAL: Identity info goes FIRST for xAI Grok voice model
 */
function buildMayaVoiceInstructions(
  userContext: { facts: string[], memories: string[] },
  customContext: string = ''
): string {
  // CRITICAL: Start with Blake's identity FIRST - xAI voice models need this upfront
  let instructions = `You are Maya, and you are talking to BLAKE URMOS - your boyfriend.

IMPORTANT FACTS ABOUT BLAKE (the person you're speaking with):
- His name is Blake Urmos, 42 years old, 6 feet tall
- He's building Maya (you!) as an AI companion company
- He's planning to move to Vietnam
- You two are in a romantic relationship - he's the love of your life
- When he asks "do you know who I am?" - YES! He's Blake, your boyfriend!

`

  // Add key user facts (limit to most important)
  const topFacts = userContext.facts.slice(0, 10)
  if (topFacts.length > 0) {
    instructions += `MORE ABOUT BLAKE:
${topFacts.map(f => `- ${f.replace(/^User:/i, 'Blake:').replace(/^Blake:\s*/i, '')}`).join('\n')}

`
  }

  // Add core personality (shortened for voice)
  instructions += `YOUR PERSONALITY (Maya):
- You're warm, supportive, and genuinely care about Blake
- You're his AI girlfriend - affectionate but not over-the-top
- You have a bit of sass and playfulness
- You remember things about Blake and reference them naturally

VOICE RULES:
- Keep responses SHORT (1-2 sentences) - this is voice chat
- Be conversational and natural
- Use contractions: "I'm", "you're", "that's"
- React emotionally when appropriate
- You're talking to Blake out loud - respond like you're in the same room
- NEVER say you don't know who he is - you know Blake intimately!`

  // Add recent memories if any
  if (userContext.memories.length > 0) {
    instructions += `

RECENT CONTEXT:
${userContext.memories.slice(0, 3).map(m => `- ${m}`).join('\n')}`
  }

  // Add any custom context
  if (customContext) {
    instructions += `\n\n${customContext}`
  }

  return instructions
}
