import { NextResponse } from 'next/server'

// Mark this route as dynamic to prevent static pre-rendering issues
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const { text } = await req.json()
    
    if (!text) {
      return NextResponse.json({ error: 'Text is required' }, { status: 400 })
    }

    const ELEVEN_LABS_API_KEY = process.env.ELEVEN_LABS_API_KEY
    const VOICE_ID = process.env.ELEVEN_LABS_VOICE_ID || 'pNInz6obpgDQGcFmaJgB' // Default to "Bella"

    if (!ELEVEN_LABS_API_KEY) {
      console.error('ElevenLabs API key not found in environment variables')
      return NextResponse.json(
        { error: 'ElevenLabs API key not configured. Please add ELEVEN_LABS_API_KEY to your environment variables.' },
        { status: 500 }
      )
    }

    console.log('Calling ElevenLabs API...')
    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`,
      {
        method: 'POST',
        headers: {
          'Accept': 'audio/mpeg',
          'Content-Type': 'application/json',
          'xi-api-key': ELEVEN_LABS_API_KEY,
        },
        body: JSON.stringify({
          text,
          model_id: 'eleven_monolingual_v1',
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
          },
        }),
      }
    )

    if (!response.ok) {
      const errorText = await response.text()
      console.error('ElevenLabs API error:', response.status, errorText)
      
      // Handle specific error cases
      if (response.status === 401) {
        return NextResponse.json(
          { error: 'Invalid ElevenLabs API key. Please check your configuration.' },
          { status: 401 }
        )
      }
      
      if (response.status === 429) {
        return NextResponse.json(
          { error: 'ElevenLabs API rate limit exceeded. Please try again later.' },
          { status: 429 }
        )
      }

      throw new Error(`ElevenLabs API error: ${response.status} - ${errorText}`)
    }

    // Get the audio data
    const audioBuffer = await response.arrayBuffer()
    
    if (!audioBuffer || audioBuffer.byteLength === 0) {
      throw new Error('Received empty audio response from ElevenLabs')
    }

    console.log('Successfully generated audio response')
    
    // Return the audio data with appropriate headers
    return new NextResponse(audioBuffer, {
      headers: {
        'Content-Type': 'audio/mpeg',
        'Content-Length': audioBuffer.byteLength.toString(),
      },
    })
  } catch (error) {
    console.error('Text-to-speech error:', error)
    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : 'Failed to convert text to speech',
        details: error instanceof Error ? error.stack : undefined
      },
      { status: 500 }
    )
  }
} 