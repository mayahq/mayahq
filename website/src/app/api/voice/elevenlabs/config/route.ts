import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

/**
 * Returns ElevenLabs configuration for client-side TTS
 * Voice ID and API key for WebSocket streaming
 */
export async function POST() {
  try {
    const apiKey = process.env.ELEVEN_LABS_API_KEY
    const voiceId = process.env.ELEVEN_LABS_VOICE_ID

    if (!apiKey) {
      console.error('[ElevenLabs Config] ELEVEN_LABS_API_KEY not configured')
      return NextResponse.json(
        { error: 'ElevenLabs API key not configured' },
        { status: 500 }
      )
    }

    if (!voiceId) {
      console.error('[ElevenLabs Config] ELEVEN_LABS_VOICE_ID not configured')
      return NextResponse.json(
        { error: 'ElevenLabs voice ID not configured' },
        { status: 500 }
      )
    }

    console.log('[ElevenLabs Config] Returning config for voice:', voiceId)

    return NextResponse.json({
      voiceId,
      apiKey, // Client needs this for WebSocket auth
      model: 'eleven_v3', // v3 for audio tags support
      settings: {
        stability: 0.5,
        similarity_boost: 0.8,
        style: 0.5, // Higher = more expressive
        use_speaker_boost: true
      }
    })

  } catch (error) {
    console.error('[ElevenLabs Config] Error:', error)
    return NextResponse.json(
      { error: 'Failed to get configuration' },
      { status: 500 }
    )
  }
}
