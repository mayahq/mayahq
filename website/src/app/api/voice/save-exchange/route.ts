import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Mark this route as dynamic
export const dynamic = 'force-dynamic'

// Blake's user ID (single user system)
const BLAKE_USER_ID = '4c850152-30ef-4b1b-89b3-bc72af461e14'
const MAYA_USER_ID = '61770892-9e5b-46a5-b622-568be7066664'

// Voice room ID - dedicated room for voice conversations
const VOICE_ROOM_ID = 'voice-conversations'

/**
 * Saves a voice exchange (user transcript + Maya response) to the database
 * This enables memory persistence for voice conversations
 */
export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { userTranscript, mayaResponse } = body

    if (!userTranscript && !mayaResponse) {
      return NextResponse.json(
        { error: 'No content to save' },
        { status: 400 }
      )
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )

    const messages = []
    const now = new Date()

    // Save user's transcript as a message
    if (userTranscript && userTranscript.trim()) {
      messages.push({
        room_id: VOICE_ROOM_ID,
        user_id: BLAKE_USER_ID,
        content: userTranscript.trim(),
        role: 'user',
        created_at: now.toISOString(),
        metadata: { source: 'voice', type: 'transcript' }
      })
    }

    // Save Maya's response as a message (slightly after user message)
    if (mayaResponse && mayaResponse.trim()) {
      const responseTime = new Date(now.getTime() + 100) // 100ms after
      messages.push({
        room_id: VOICE_ROOM_ID,
        user_id: MAYA_USER_ID,
        content: mayaResponse.trim(),
        role: 'assistant',
        created_at: responseTime.toISOString(),
        metadata: { source: 'voice', type: 'response' }
      })
    }

    if (messages.length > 0) {
      const { error } = await supabase
        .from('messages')
        .insert(messages)

      if (error) {
        console.error('[Voice Save] Error saving messages:', error)
        return NextResponse.json(
          { error: 'Failed to save messages' },
          { status: 500 }
        )
      }

      console.log('[Voice Save] Saved', messages.length, 'messages from voice conversation')

      // Also create a memory entry for significant exchanges
      if (userTranscript && mayaResponse) {
        const memoryContent = `Voice conversation - Blake said: "${userTranscript}" and Maya responded: "${mayaResponse}"`

        await supabase
          .from('maya_memories')
          .insert({
            user_id: BLAKE_USER_ID,
            content: memoryContent,
            memory_type: 'conversation',
            source: 'voice',
            created_at: now.toISOString()
          })
          .catch(err => {
            // Non-critical, just log
            console.error('[Voice Save] Error saving memory:', err)
          })
      }
    }

    return NextResponse.json({
      success: true,
      savedCount: messages.length
    })

  } catch (error) {
    console.error('[Voice Save] Error:', error)
    return NextResponse.json(
      { error: 'Failed to save voice exchange' },
      { status: 500 }
    )
  }
}
