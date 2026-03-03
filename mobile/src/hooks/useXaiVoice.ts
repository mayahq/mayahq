/**
 * xAI Grok Voice Hook for React Native
 * Ultra-low latency speech-to-speech using xAI's realtime API
 * Uses react-native-live-audio-stream for true real-time audio streaming
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { Audio, AVPlaybackStatus } from 'expo-av';
import LiveAudioStream from 'react-native-live-audio-stream';
import { EmitterSubscription } from 'react-native';

// API endpoint for getting session token (Railway maya-core service)
const API_BASE_URL = process.env.EXPO_PUBLIC_MAYA_CORE_URL || 'https://maya-core-production.up.railway.app';

export type VoiceState = 'idle' | 'connecting' | 'connected' | 'listening' | 'thinking' | 'speaking' | 'error';

export interface UseXaiVoiceOptions {
  onTranscript?: (text: string) => void;
  onResponse?: (text: string) => void;
  onStateChange?: (state: VoiceState) => void;
  onError?: (error: Error) => void;
}

export interface UseXaiVoiceReturn {
  state: VoiceState;
  transcript: string;
  response: string;
  error: Error | null;
  connect: () => Promise<void>;
  disconnect: () => void;
  interrupt: () => void;
}

// Convert ArrayBuffer to base64
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

// Convert base64 to ArrayBuffer
function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

export function useXaiVoice(options: UseXaiVoiceOptions = {}): UseXaiVoiceReturn {
  const { onTranscript, onResponse, onStateChange, onError } = options;

  // State
  const [state, setState] = useState<VoiceState>('idle');
  const [transcript, setTranscript] = useState('');
  const [response, setResponse] = useState('');
  const [error, setError] = useState<Error | null>(null);

  // Refs
  const wsRef = useRef<WebSocket | null>(null);
  const soundRef = useRef<Audio.Sound | null>(null);
  const audioBufferRef = useRef<Int16Array>(new Int16Array(0));
  const isPlayingRef = useRef(false);
  const sessionConfiguredRef = useRef(false);
  const playbackTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const audioStreamSubscriptionRef = useRef<EmitterSubscription | null>(null);
  const isRecordingRef = useRef(false);

  // Update state and notify
  const updateState = useCallback((newState: VoiceState) => {
    setState(newState);
    onStateChange?.(newState);
  }, [onStateChange]);

  // Minimum buffer size before starting playback (in samples)
  // ~150ms of audio at 24kHz = 3600 samples
  const MIN_BUFFER_SAMPLES = 3600;

  // Create WAV buffer from PCM16 data
  function createWavBuffer(pcmData: Int16Array, sampleRate: number): ArrayBuffer {
    const numChannels = 1;
    const bitsPerSample = 16;
    const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
    const blockAlign = numChannels * (bitsPerSample / 8);
    const dataSize = pcmData.length * (bitsPerSample / 8);
    const headerSize = 44;
    const totalSize = headerSize + dataSize;

    const buffer = new ArrayBuffer(totalSize);
    const view = new DataView(buffer);

    // RIFF header
    writeString(view, 0, 'RIFF');
    view.setUint32(4, totalSize - 8, true);
    writeString(view, 8, 'WAVE');

    // fmt chunk
    writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitsPerSample, true);

    // data chunk
    writeString(view, 36, 'data');
    view.setUint32(40, dataSize, true);

    // Write PCM data
    const dataView = new Int16Array(buffer, headerSize);
    dataView.set(pcmData);

    return buffer;
  }

  function writeString(view: DataView, offset: number, str: string) {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  }

  // Process and play buffered audio
  const playBufferedAudio = useCallback(async () => {
    if (isPlayingRef.current) return;

    const buffer = audioBufferRef.current;
    if (buffer.length < MIN_BUFFER_SAMPLES) {
      return;
    }

    isPlayingRef.current = true;

    try {
      // Create WAV buffer from PCM16 data
      const wavBuffer = createWavBuffer(buffer, 24000);
      const base64Audio = arrayBufferToBase64(wavBuffer);
      const audioUri = `data:audio/wav;base64,${base64Audio}`;

      // Clear the buffer
      audioBufferRef.current = new Int16Array(0);

      // Unload previous sound
      if (soundRef.current) {
        await soundRef.current.unloadAsync();
        soundRef.current = null;
      }

      // Configure audio mode for playback (allow recording to continue)
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
        shouldDuckAndroid: true,
      });

      // Create and play sound
      const { sound } = await Audio.Sound.createAsync(
        { uri: audioUri },
        { shouldPlay: true }
      );

      soundRef.current = sound;

      // Wait for playback to finish, then check for more audio
      sound.setOnPlaybackStatusUpdate((status: AVPlaybackStatus) => {
        if (status.isLoaded && status.didJustFinish) {
          isPlayingRef.current = false;

          // Check if more audio has accumulated
          if (audioBufferRef.current.length >= MIN_BUFFER_SAMPLES) {
            playBufferedAudio();
          } else if (audioBufferRef.current.length > 0) {
            // Small amount left, play after short delay
            playbackTimeoutRef.current = setTimeout(() => {
              if (audioBufferRef.current.length > 0) {
                playBufferedAudio();
              } else if (state === 'speaking') {
                updateState('listening');
              }
            }, 100);
          } else if (state === 'speaking') {
            updateState('listening');
          }
        }
      });

    } catch (err) {
      console.error('[XaiVoice] Error playing audio:', err);
      isPlayingRef.current = false;
    }
  }, [state, updateState]);

  // Handle WebSocket messages
  const handleMessage = useCallback((event: MessageEvent) => {
    try {
      const data = JSON.parse(event.data);
      console.log('[XaiVoice] Received:', data.type);

      switch (data.type) {
        case 'session.created':
          console.log('[XaiVoice] Session created');
          break;

        case 'session.updated':
          console.log('[XaiVoice] Session configured:', JSON.stringify(data.session, null, 2));
          sessionConfiguredRef.current = true;
          updateState('connected');
          // Start recording after session is configured
          startAudioRecording();
          break;

        case 'error':
          console.error('[XaiVoice] API Error:', data.error);
          const apiErr = new Error(data.error?.message || 'xAI API error');
          setError(apiErr);
          onError?.(apiErr);
          updateState('error');
          break;

        case 'input_audio_buffer.speech_started':
          console.log('[XaiVoice] Speech detected');
          updateState('listening');
          break;

        case 'input_audio_buffer.speech_stopped':
          console.log('[XaiVoice] Speech stopped');
          break;

        case 'conversation.item.input_audio_transcription.completed':
          const userText = data.transcript || '';
          console.log('[XaiVoice] User said:', userText);
          setTranscript(userText);
          onTranscript?.(userText);
          updateState('thinking');
          break;

        case 'response.created':
          console.log('[XaiVoice] Response started');
          setResponse('');
          break;

        case 'response.output_audio.delta':
          if (data.delta) {
            const audioData = base64ToArrayBuffer(data.delta);
            const newChunk = new Int16Array(audioData);

            // Append to buffer
            const currentBuffer = audioBufferRef.current;
            const combined = new Int16Array(currentBuffer.length + newChunk.length);
            combined.set(currentBuffer);
            combined.set(newChunk, currentBuffer.length);
            audioBufferRef.current = combined;

            if (state !== 'speaking') {
              updateState('speaking');
            }

            playBufferedAudio();
          }
          break;

        case 'response.output_audio_transcript.delta':
          if (data.delta) {
            setResponse(prev => {
              const newResponse = prev + data.delta;
              onResponse?.(newResponse);
              return newResponse;
            });
          }
          break;

        case 'response.done':
          console.log('[XaiVoice] Response complete');
          if (audioBufferRef.current.length === 0 && !isPlayingRef.current) {
            updateState('listening');
          }
          break;

        default:
          console.log('[XaiVoice] Unhandled event:', data.type);
      }
    } catch (err) {
      console.error('[XaiVoice] Error parsing message:', err);
    }
  }, [onTranscript, onResponse, onError, updateState, playBufferedAudio, state]);

  // Start audio recording with real-time streaming
  const startAudioRecording = useCallback(async () => {
    try {
      console.log('[XaiVoice] Starting real-time audio recording...');

      // Verify native module is available
      if (!LiveAudioStream || typeof LiveAudioStream.init !== 'function') {
        throw new Error('LiveAudioStream native module not available - is the app built with EAS?');
      }
      console.log('[XaiVoice] Native module available');

      // Request microphone permission via expo-av (grants system-level permission)
      const { granted } = await Audio.requestPermissionsAsync();
      console.log('[XaiVoice] Permission request result:', granted);
      if (!granted) {
        throw new Error('Microphone permission denied');
      }

      // Set audio mode to allow recording
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        staysActiveInBackground: true,
        shouldDuckAndroid: true,
      });
      console.log('[XaiVoice] Audio mode set');

      // Initialize LiveAudioStream with 24kHz to match xAI
      console.log('[XaiVoice] Initializing LiveAudioStream...');
      LiveAudioStream.init({
        sampleRate: 24000,    // 24kHz for xAI
        channels: 1,          // Mono
        bitsPerSample: 16,    // PCM16
        audioSource: 6,       // VOICE_RECOGNITION (Android)
        bufferSize: 2048,     // Small buffer for low latency
        wavFile: '',          // Not used - this package streams, doesn't save
      });

      // Subscribe to audio data events
      // Note: The package types incorrectly say on() returns void, but it actually returns EmitterSubscription
      let audioChunkCount = 0;
      const subscription = LiveAudioStream.on('data', (data: string) => {
        audioChunkCount++;
        // Log every 50th chunk to avoid spam (roughly every 4 seconds at 24kHz/2048 buffer)
        if (audioChunkCount % 50 === 1) {
          console.log(`[XaiVoice] Audio chunk #${audioChunkCount}, size: ${data.length} chars, WS ready: ${wsRef.current?.readyState === WebSocket.OPEN}, playing: ${isPlayingRef.current}`);
        }

        // Don't send audio while Maya is speaking (prevents echo/feedback loop)
        if (isPlayingRef.current) {
          return;
        }

        // data is base64-encoded PCM audio
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({
            type: 'input_audio_buffer.append',
            audio: data,
          }));
        } else {
          console.warn('[XaiVoice] WebSocket not open, dropping audio chunk');
        }
      });
      audioStreamSubscriptionRef.current = subscription as unknown as EmitterSubscription;

      console.log('[XaiVoice] Audio stream subscription created');

      // Start recording
      console.log('[XaiVoice] Calling LiveAudioStream.start()...');
      LiveAudioStream.start();
      isRecordingRef.current = true;

      console.log('[XaiVoice] LiveAudioStream.start() called - recording should begin');
      console.log('[XaiVoice] If no audio chunks appear within 2 seconds, native module may not be linked');
      updateState('listening');

    } catch (err) {
      console.error('[XaiVoice] Error starting recording:', err);
      const error = err instanceof Error ? err : new Error('Failed to start recording');
      setError(error);
      onError?.(error);
      updateState('error');
    }
  }, [updateState, onError]);

  // Stop audio recording
  const stopAudioRecording = useCallback(() => {
    if (isRecordingRef.current) {
      try {
        LiveAudioStream.stop();
        isRecordingRef.current = false;
        console.log('[XaiVoice] Recording stopped');
      } catch (err) {
        console.error('[XaiVoice] Error stopping recording:', err);
      }
    }

    // Clean up subscription
    if (audioStreamSubscriptionRef.current) {
      audioStreamSubscriptionRef.current.remove();
      audioStreamSubscriptionRef.current = null;
    }
  }, []);

  // Connect to xAI Voice API
  const connect = useCallback(async () => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      console.log('[XaiVoice] Already connected');
      return;
    }

    updateState('connecting');
    setError(null);
    sessionConfiguredRef.current = false;

    try {
      // Get ephemeral token from our API
      const tokenResponse = await fetch(`${API_BASE_URL}/voice/session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      if (!tokenResponse.ok) {
        throw new Error('Failed to get voice session token');
      }

      const { client_secret, instructions, voice } = await tokenResponse.json();

      console.log('[XaiVoice] Got session token');

      // Connect to xAI realtime API
      const ws = new WebSocket(
        `wss://api.x.ai/v1/realtime?model=grok-2-public`,
        ['realtime', `openai-insecure-api-key.${client_secret}`]
      );

      wsRef.current = ws;

      ws.onopen = () => {
        console.log('[XaiVoice] WebSocket connected');

        // Configure session with 24kHz audio
        // Use OpenAI-compatible format (xAI is OpenAI-compatible)
        const sessionConfig = {
          type: 'session.update',
          session: {
            modalities: ['text', 'audio'],
            voice: voice || 'alloy',
            instructions: instructions,
            // OpenAI standard format
            input_audio_format: 'pcm16',
            output_audio_format: 'pcm16',
            input_audio_transcription: {
              model: 'whisper-1',
            },
            turn_detection: {
              type: 'server_vad',
              threshold: 0.5,
              prefix_padding_ms: 300,
              silence_duration_ms: 500,
            },
          },
        };

        console.log('[XaiVoice] Sending session config:', JSON.stringify(sessionConfig));

        ws.send(JSON.stringify(sessionConfig));
      };

      ws.onmessage = handleMessage;

      ws.onerror = (event) => {
        console.error('[XaiVoice] WebSocket error:', event);
        const err = new Error('Voice connection error');
        setError(err);
        onError?.(err);
        updateState('error');
      };

      ws.onclose = (event) => {
        console.log('[XaiVoice] WebSocket closed:', event.code, event.reason);
        stopAudioRecording();
        wsRef.current = null;

        if (state !== 'error') {
          updateState('idle');
        }
      };

    } catch (err) {
      console.error('[XaiVoice] Connection error:', err);
      const error = err instanceof Error ? err : new Error('Failed to connect');
      setError(error);
      onError?.(error);
      updateState('error');
    }
  }, [handleMessage, onError, updateState, stopAudioRecording, state]);

  // Disconnect
  const disconnect = useCallback(() => {
    console.log('[XaiVoice] Disconnecting...');

    stopAudioRecording();

    if (playbackTimeoutRef.current) {
      clearTimeout(playbackTimeoutRef.current);
      playbackTimeoutRef.current = null;
    }

    if (wsRef.current) {
      wsRef.current.close(1000, 'User disconnected');
      wsRef.current = null;
    }

    if (soundRef.current) {
      soundRef.current.unloadAsync();
      soundRef.current = null;
    }

    audioBufferRef.current = new Int16Array(0);
    isPlayingRef.current = false;

    updateState('idle');
  }, [updateState, stopAudioRecording]);

  // Interrupt (stop speaking)
  const interrupt = useCallback(async () => {
    console.log('[XaiVoice] Interrupting...');

    // Clear audio buffer
    audioBufferRef.current = new Int16Array(0);
    isPlayingRef.current = false;

    if (playbackTimeoutRef.current) {
      clearTimeout(playbackTimeoutRef.current);
      playbackTimeoutRef.current = null;
    }

    // Stop current playback
    if (soundRef.current) {
      await soundRef.current.stopAsync();
    }

    // Send cancel to xAI
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'response.cancel' }));
    }

    updateState('listening');
  }, [updateState]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disconnect();
    };
  }, []);

  return {
    state,
    transcript,
    response,
    error,
    connect,
    disconnect,
    interrupt,
  };
}
