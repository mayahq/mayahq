import { NextResponse } from 'next/server'
import { stripAudioTags } from '@/lib/audio-tags'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

/**
 * TTS API endpoint for mobile
 * Takes text and returns audio as base64
 * Uses ElevenLabs REST API (not WebSocket)
 */
export async function POST(req: Request) {
  try {
    const { text } = await req.json()

    if (!text || !text.trim()) {
      return NextResponse.json(
        { error: 'Text is required' },
        { status: 400 }
      )
    }

    const apiKey = process.env.ELEVEN_LABS_API_KEY
    const voiceId = process.env.ELEVEN_LABS_VOICE_ID

    if (!apiKey || !voiceId) {
      return NextResponse.json(
        { error: 'ElevenLabs not configured' },
        { status: 500 }
      )
    }

    // Strip audio tags for TTS (turbo model reads them literally)
    const cleanText = stripAudioTags(text)

    console.log('[TTS] Generating audio for:', cleanText.substring(0, 50))

    // Call ElevenLabs REST API
    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
      {
        method: 'POST',
        headers: {
          'Accept': 'audio/mpeg',
          'Content-Type': 'application/json',
          'xi-api-key': apiKey,
        },
        body: JSON.stringify({
          text: cleanText,
          model_id: 'eleven_turbo_v2_5', // Fast model for low latency
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.8,
            style: 0.5,
            use_speaker_boost: true,
          },
        }),
      }
    )

    if (!response.ok) {
      const errorText = await response.text()
      console.error('[TTS] ElevenLabs error:', response.status, errorText)
      return NextResponse.json(
        { error: 'TTS generation failed' },
        { status: response.status }
      )
    }

    // Get audio as ArrayBuffer and convert to base64
    const audioBuffer = await response.arrayBuffer()
    const base64Audio = Buffer.from(audioBuffer).toString('base64')

    console.log('[TTS] Audio generated, size:', audioBuffer.byteLength)

    return NextResponse.json({
      audio: base64Audio,
      contentType: 'audio/mpeg',
    })

  } catch (error) {
    console.error('[TTS] Error:', error)
    return NextResponse.json(
      { error: 'TTS failed' },
      { status: 500 }
    )
  }
}
