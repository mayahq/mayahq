import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'
export const maxDuration = 120 // ElevenLabs v3 TTS can take 30-60s for long roleplay text

const ELEVEN_LABS_API_KEY = process.env.ELEVEN_LABS_API_KEY!
const ELEVEN_LABS_VOICE_ID = process.env.ELEVEN_LABS_VOICE_ID || 'WAhoMTNdLdMoq1j3wf3I'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  try {
    const { messageId, text } = await req.json()

    if (!messageId || !text) {
      return NextResponse.json(
        { error: 'messageId and text are required' },
        { status: 400 }
      )
    }

    if (!ELEVEN_LABS_API_KEY) {
      return NextResponse.json(
        { error: 'ElevenLabs API key not configured' },
        { status: 500 }
      )
    }

    console.log(`[Roleplay TTS] Generating audio for message ${messageId} (${text.length} chars)`)

    // Call ElevenLabs v3 TTS — voice tags like [whispers], [moans] are interpreted natively
    const ttsResponse = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${ELEVEN_LABS_VOICE_ID}`,
      {
        method: 'POST',
        headers: {
          'Accept': 'audio/mpeg',
          'Content-Type': 'application/json',
          'xi-api-key': ELEVEN_LABS_API_KEY,
        },
        body: JSON.stringify({
          text,
          model_id: 'eleven_v3',
          apply_text_normalization: 'auto',
          voice_settings: {
            stability: 0.3,         // Creative mode — more expressive, better audio tag response
            similarity_boost: 0.75, // Standard default for voice fidelity
          },
        }),
      }
    )

    if (!ttsResponse.ok) {
      const errorText = await ttsResponse.text()
      console.error(`[Roleplay TTS] ElevenLabs error: ${ttsResponse.status} - ${errorText}`)
      return NextResponse.json(
        { error: `ElevenLabs API error: ${ttsResponse.status}` },
        { status: 502 }
      )
    }

    const audioBuffer = await ttsResponse.arrayBuffer()

    if (!audioBuffer || audioBuffer.byteLength === 0) {
      return NextResponse.json(
        { error: 'Received empty audio from ElevenLabs' },
        { status: 502 }
      )
    }

    console.log(`[Roleplay TTS] Generated ${audioBuffer.byteLength} bytes of audio`)

    // Upload to Supabase Storage
    const storagePath = `roleplay/${messageId}.mp3`
    const { error: uploadError } = await supabase.storage
      .from('audio-files')
      .upload(storagePath, audioBuffer, {
        contentType: 'audio/mpeg',
        cacheControl: '86400',
        upsert: true,
      })

    if (uploadError) {
      console.error('[Roleplay TTS] Storage upload error:', uploadError)
      return NextResponse.json(
        { error: 'Failed to upload audio file' },
        { status: 500 }
      )
    }

    // Get public URL
    const { data: { publicUrl } } = supabase.storage
      .from('audio-files')
      .getPublicUrl(storagePath)

    console.log(`[Roleplay TTS] Uploaded to: ${publicUrl}`)

    // Update message metadata with audio URL
    const { data: existingMessage } = await supabase
      .from('messages')
      .select('metadata')
      .eq('id', messageId)
      .single()

    const existingMeta = (existingMessage?.metadata as Record<string, unknown>) || {}

    const { error: updateError } = await supabase
      .from('messages')
      .update({
        metadata: {
          ...existingMeta,
          audioUrl: publicUrl,
          ttsGenerated: true,
          ttsGeneratedAt: new Date().toISOString(),
        },
      })
      .eq('id', messageId)

    if (updateError) {
      console.error('[Roleplay TTS] Message metadata update error:', updateError)
      // Non-fatal — audio was still generated and stored
    }

    return NextResponse.json({ audioUrl: publicUrl })
  } catch (error) {
    console.error('[Roleplay TTS] Error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
