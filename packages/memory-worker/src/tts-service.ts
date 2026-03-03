import { createClient } from '@supabase/supabase-js';
import { v4 as uuidv4 } from 'uuid';

// Create Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// TTS Configuration
const ELEVEN_LABS_API_KEY = process.env.ELEVEN_LABS_API_KEY;
const ELEVEN_LABS_VOICE_ID = process.env.ELEVEN_LABS_VOICE_ID || 'pNInz6obpgDQGcFmaJgB'; // Default to "Bella"
const ELEVEN_LABS_MODEL = process.env.ELEVEN_LABS_MODEL || 'eleven_monolingual_v1';

// Log TTS configuration on module load
console.log('[TTS] TTS Service Configuration:');
console.log('[TTS] - API Key configured:', !!ELEVEN_LABS_API_KEY);
console.log('[TTS] - Voice ID:', ELEVEN_LABS_VOICE_ID);
console.log('[TTS] - Model:', ELEVEN_LABS_MODEL);
if (ELEVEN_LABS_API_KEY) {
  console.log('[TTS] - API Key length:', ELEVEN_LABS_API_KEY.length);
  console.log('[TTS] - API Key preview:', ELEVEN_LABS_API_KEY.substring(0, 10) + '...');
}

// Voice settings
const DEFAULT_VOICE_SETTINGS = {
  stability: 0.5,
  similarity_boost: 0.75,
};

export interface TTSOptions {
  text: string;
  voiceId?: string;
  modelId?: string;
  voiceSettings?: {
    stability?: number;
    similarity_boost?: number;
  };
}

export interface TTSResult {
  success: boolean;
  audioUrl?: string;
  audioBuffer?: ArrayBuffer;
  error?: string;
  duration?: number;
}

/**
 * Generate speech from text using ElevenLabs API
 */
export async function generateSpeech(options: TTSOptions): Promise<TTSResult> {
  const startTime = Date.now();
  
  try {
    if (!ELEVEN_LABS_API_KEY) {
      console.error('ElevenLabs API key not configured');
      return {
        success: false,
        error: 'ElevenLabs API key not configured',
      };
    }

    const { text, voiceId = ELEVEN_LABS_VOICE_ID, modelId = ELEVEN_LABS_MODEL, voiceSettings = DEFAULT_VOICE_SETTINGS } = options;

    if (!text || text.trim().length === 0) {
      return {
        success: false,
        error: 'Text is required for TTS',
      };
    }

    console.log(`[TTS] Generating speech for text (${text.length} chars) with voice ${voiceId}`);

    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
      {
        method: 'POST',
        headers: {
          'Accept': 'audio/mpeg',
          'Content-Type': 'application/json',
          'xi-api-key': ELEVEN_LABS_API_KEY,
        },
        body: JSON.stringify({
          text,
          model_id: modelId,
          voice_settings: voiceSettings,
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[TTS] ElevenLabs API error: ${response.status} - ${errorText}`);
      
      if (response.status === 401) {
        return {
          success: false,
          error: 'Invalid ElevenLabs API key',
        };
      }
      
      if (response.status === 429) {
        return {
          success: false,
          error: 'ElevenLabs API rate limit exceeded',
        };
      }

      return {
        success: false,
        error: `ElevenLabs API error: ${response.status}`,
      };
    }

    const audioBuffer = await response.arrayBuffer();
    
    if (!audioBuffer || audioBuffer.byteLength === 0) {
      console.error('[TTS] Received empty audio response');
      return {
        success: false,
        error: 'Received empty audio response from ElevenLabs',
      };
    }

    const duration = Date.now() - startTime;
    console.log(`[TTS] Successfully generated audio (${audioBuffer.byteLength} bytes) in ${duration}ms`);
    
    return {
      success: true,
      audioBuffer,
      duration,
    };
  } catch (error) {
    console.error('[TTS] Error generating speech:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to generate speech',
    };
  }
}

/**
 * Generate speech and upload to Supabase Storage
 */
export async function generateAndStoreSpeech(text: string, messageId: string, userId: string): Promise<TTSResult> {
  try {
    // Generate the speech
    const result = await generateSpeech({ text });
    
    if (!result.success || !result.audioBuffer) {
      return result;
    }

    // Create a unique filename
    const filename = `tts/${userId}/${messageId}-${Date.now()}.mp3`;
    
    // Upload to Supabase Storage
    const { data: uploadData, error: uploadError } = await supabase
      .storage
      .from('audio-files')
      .upload(filename, result.audioBuffer, {
        contentType: 'audio/mpeg',
        cacheControl: '3600',
        upsert: false,
      });

    if (uploadError) {
      console.error('[TTS] Error uploading audio to storage:', uploadError);
      return {
        success: false,
        error: 'Failed to upload audio file',
      };
    }

    // Get the public URL
    const { data: { publicUrl } } = supabase
      .storage
      .from('audio-files')
      .getPublicUrl(filename);

    console.log(`[TTS] Audio uploaded successfully: ${publicUrl}`);

    return {
      success: true,
      audioUrl: publicUrl,
      duration: result.duration,
    };
  } catch (error) {
    console.error('[TTS] Error in generateAndStoreSpeech:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to generate and store speech',
    };
  }
}

/**
 * Process TTS for a message if voice mode is enabled
 */
export async function processTTSForMessage(messageId: string, content: string, userId: string, metadata?: any): Promise<void> {
  try {
    // Check if voice mode is enabled for this message
    if (!metadata?.voiceMode) {
      console.log(`[TTS] Voice mode not enabled for message ${messageId}, skipping TTS`);
      return;
    }

    console.log(`[TTS] Processing TTS for message ${messageId} in voice mode`);

    // Generate and store the speech
    const result = await generateAndStoreSpeech(content, messageId, userId);

    if (result.success && result.audioUrl) {
      // Update the message metadata with the audio URL
      const { error: updateError } = await supabase
        .from('messages')
        .update({
          metadata: {
            ...metadata,
            audioUrl: result.audioUrl,
            ttsGenerated: true,
            ttsGeneratedAt: new Date().toISOString(),
          },
        })
        .eq('id', messageId);

      if (updateError) {
        console.error(`[TTS] Error updating message ${messageId} with audio URL:`, updateError);
      } else {
        console.log(`[TTS] Successfully updated message ${messageId} with audio URL`);
      }
    } else {
      console.error(`[TTS] Failed to generate TTS for message ${messageId}:`, result.error);
    }
  } catch (error) {
    console.error(`[TTS] Error processing TTS for message ${messageId}:`, error);
  }
} 