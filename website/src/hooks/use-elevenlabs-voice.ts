'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { stripAudioTags } from '@/lib/audio-tags'

export type ElevenLabsVoiceState = 'idle' | 'connecting' | 'listening' | 'processing' | 'speaking' | 'error'

export interface UseElevenLabsVoiceOptions {
  onTranscript?: (text: string, isFinal: boolean) => void
  onResponse?: (text: string) => void
  onStateChange?: (state: ElevenLabsVoiceState) => void
  onError?: (error: Error) => void
  voiceId?: string
}

export interface UseElevenLabsVoiceReturn {
  state: ElevenLabsVoiceState
  isConnected: boolean
  isListening: boolean
  isSpeaking: boolean
  transcript: string
  response: string
  error: Error | null
  connect: () => Promise<void>
  disconnect: () => void
  startListening: () => void
  stopListening: () => void
  interrupt: () => void
  sendText: (text: string) => void
}

// ElevenLabs WebSocket endpoint for streaming TTS
const ELEVENLABS_WS_URL = 'wss://api.elevenlabs.io/v1/text-to-speech'

/**
 * React hook for ElevenLabs voice with Claude Opus 4.5
 * Provides expressive audio tags [whisper], [laugh], [sigh], etc.
 * Uses browser's Web Speech API for STT, Claude for generation, ElevenLabs v3 for TTS
 */
export function useElevenLabsVoice(options: UseElevenLabsVoiceOptions = {}): UseElevenLabsVoiceReturn {
  const {
    onTranscript,
    onResponse,
    onStateChange,
    onError,
    voiceId,
  } = options

  // State
  const [state, setState] = useState<ElevenLabsVoiceState>('idle')
  const [transcript, setTranscript] = useState('')
  const [response, setResponse] = useState('')
  const [error, setError] = useState<Error | null>(null)

  // Refs
  const recognitionRef = useRef<SpeechRecognition | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const ttsWebSocketRef = useRef<WebSocket | null>(null)
  const audioQueueRef = useRef<ArrayBuffer[]>([])
  const isPlayingRef = useRef(false)
  const currentVoiceIdRef = useRef<string>('')
  const apiKeyRef = useRef<string>('')
  const isConnectedRef = useRef(false)
  const nextPlayTimeRef = useRef<number>(0)  // For scheduled playback
  const activeSourcesRef = useRef<AudioBufferSourceNode[]>([])  // Track active sources for interrupt
  const isProcessingQueueRef = useRef(false)  // Prevent concurrent queue processing

  // Update state and notify
  const updateState = useCallback((newState: ElevenLabsVoiceState) => {
    setState(newState)
    onStateChange?.(newState)
  }, [onStateChange])

  // Process audio queue sequentially to maintain order
  const processAudioQueue = useCallback(async () => {
    // Prevent concurrent processing
    if (isProcessingQueueRef.current) return
    isProcessingQueueRef.current = true

    try {
      if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
        audioContextRef.current = new AudioContext({ sampleRate: 44100 })
        nextPlayTimeRef.current = 0
      }

      // Resume audio context if suspended
      if (audioContextRef.current.state === 'suspended') {
        await audioContextRef.current.resume()
      }

      const ctx = audioContextRef.current

      while (audioQueueRef.current.length > 0) {
        const audioData = audioQueueRef.current.shift()
        if (!audioData) continue

        try {
          // Decode the audio data (this is async but we wait for it)
          const audioBuffer = await ctx.decodeAudioData(audioData.slice(0))

          const source = ctx.createBufferSource()
          source.buffer = audioBuffer
          source.connect(ctx.destination)

          // Schedule playback - either now or after current audio
          const currentTime = ctx.currentTime
          const startTime = Math.max(currentTime + 0.01, nextPlayTimeRef.current)

          // Update next play time for the next chunk
          nextPlayTimeRef.current = startTime + audioBuffer.duration

          // Track this source for potential interrupt
          activeSourcesRef.current.push(source)
          source.onended = () => {
            activeSourcesRef.current = activeSourcesRef.current.filter(s => s !== source)
            // Check if all audio finished and no more coming
            if (activeSourcesRef.current.length === 0 && audioQueueRef.current.length === 0 && !ttsWebSocketRef.current) {
              isPlayingRef.current = false
              if (isConnectedRef.current) {
                updateState('listening')
                if (recognitionRef.current) {
                  try { recognitionRef.current.start() } catch (e) { /* already started */ }
                }
              }
            }
          }

          source.start(startTime)

          if (!isPlayingRef.current) {
            isPlayingRef.current = true
            updateState('speaking')
          }

        } catch (err) {
          console.error('[ElevenLabsVoice] Error decoding audio chunk:', err)
        }
      }

    } finally {
      isProcessingQueueRef.current = false
    }
  }, [updateState])

  // Connect to ElevenLabs TTS WebSocket
  const connectTTSWebSocket = useCallback((text: string): Promise<void> => {
    return new Promise((resolve, reject) => {
      if (!apiKeyRef.current || !currentVoiceIdRef.current) {
        reject(new Error('ElevenLabs not configured'))
        return
      }

      // Close existing connection
      if (ttsWebSocketRef.current) {
        ttsWebSocketRef.current.close()
      }

      // Use eleven_turbo_v2_5 for fast streaming (v3 alpha doesn't support WebSocket yet)
      const wsUrl = `${ELEVENLABS_WS_URL}/${currentVoiceIdRef.current}/stream-input?model_id=eleven_turbo_v2_5&output_format=mp3_44100_128`

      console.log('[ElevenLabsVoice] Connecting to TTS WebSocket:', wsUrl)
      const ws = new WebSocket(wsUrl)

      ws.onopen = () => {
        console.log('[ElevenLabsVoice] TTS WebSocket connected')

        // Send initial configuration with BOS (Beginning of Stream)
        // API key must be in first message for browser WebSocket connections
        ws.send(JSON.stringify({
          text: ' ',
          xi_api_key: apiKeyRef.current,
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.8,
            style: 0.5,  // More expressive for audio tags
            use_speaker_boost: true
          },
          generation_config: {
            chunk_length_schedule: [120, 160, 250, 290]  // Optimized for low latency
          }
        }))

        // Send text with tags stripped (turbo model reads them literally)
        const cleanText = stripAudioTags(text)
        ws.send(JSON.stringify({
          text: cleanText,
          try_trigger_generation: true
        }))

        // Send EOS (End of Stream)
        ws.send(JSON.stringify({
          text: ''
        }))
      }

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)

          if (data.audio) {
            // Decode base64 audio and add to queue
            const binaryString = atob(data.audio)
            const bytes = new Uint8Array(binaryString.length)
            for (let i = 0; i < binaryString.length; i++) {
              bytes[i] = binaryString.charCodeAt(i)
            }
            // Add to queue and trigger processing
            audioQueueRef.current.push(bytes.buffer)
            processAudioQueue()
          }

          if (data.error) {
            console.error('[ElevenLabsVoice] TTS error:', data.error)
            reject(new Error(data.error))
          }

          if (data.isFinal) {
            console.log('[ElevenLabsVoice] TTS stream complete')
            resolve()
          }
        } catch (err) {
          console.error('[ElevenLabsVoice] Error parsing TTS response:', err)
        }
      }

      ws.onerror = (event) => {
        console.error('[ElevenLabsVoice] TTS WebSocket error:', event)
        reject(new Error('TTS WebSocket error'))
      }

      ws.onclose = () => {
        console.log('[ElevenLabsVoice] TTS WebSocket closed')
        ttsWebSocketRef.current = null
      }

      ttsWebSocketRef.current = ws
    })
  }, [processAudioQueue])

  // Process user speech and generate response
  const processUserInput = useCallback(async (userText: string) => {
    if (!userText.trim()) return

    console.log('[ElevenLabsVoice] Processing:', userText)
    updateState('processing')
    setTranscript(userText)
    onTranscript?.(userText, true)

    try {
      // Call our backend to get Claude's response with memory context
      const response = await fetch('/api/voice/elevenlabs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transcript: userText,
          includeAudioTags: true
        })
      })

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`)
      }

      const { text: responseText, audioTags } = await response.json()

      console.log('[ElevenLabsVoice] Maya response:', responseText)
      console.log('[ElevenLabsVoice] Audio tags used:', audioTags)

      setResponse(responseText)
      onResponse?.(responseText)

      // Stream TTS with ElevenLabs
      await connectTTSWebSocket(responseText)

    } catch (err) {
      console.error('[ElevenLabsVoice] Error processing input:', err)
      const error = err instanceof Error ? err : new Error('Failed to process')
      setError(error)
      onError?.(error)
      updateState('error')
    }
  }, [updateState, onTranscript, onResponse, onError, connectTTSWebSocket])

  // Setup Web Speech API for STT
  const setupSpeechRecognition = useCallback(() => {
    // Check for browser support
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition

    if (!SpeechRecognition) {
      throw new Error('Speech recognition not supported in this browser')
    }

    const recognition = new SpeechRecognition()
    recognition.continuous = true
    recognition.interimResults = true
    recognition.lang = 'en-US'

    let finalTranscript = ''

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interimTranscript = ''

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i]
        if (result.isFinal) {
          finalTranscript += result[0].transcript
        } else {
          interimTranscript += result[0].transcript
        }
      }

      // Show interim results
      if (interimTranscript) {
        setTranscript(interimTranscript)
        onTranscript?.(interimTranscript, false)
      }

      // Process final result
      if (finalTranscript) {
        const text = finalTranscript.trim()
        finalTranscript = ''

        // Stop recognition while processing
        recognition.stop()
        processUserInput(text)
      }
    }

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      console.error('[ElevenLabsVoice] Recognition error:', event.error)

      if (event.error === 'not-allowed') {
        const err = new Error('Microphone access denied')
        setError(err)
        onError?.(err)
        updateState('error')
      } else if (event.error !== 'aborted' && event.error !== 'no-speech') {
        // Restart on recoverable errors
        setTimeout(() => {
          if (isConnectedRef.current && state === 'listening') {
            try {
              recognition.start()
            } catch (e) {
              // Already started
            }
          }
        }, 100)
      }
    }

    recognition.onend = () => {
      console.log('[ElevenLabsVoice] Recognition ended')
      // Auto-restart if still connected and not speaking
      if (isConnectedRef.current && state === 'listening') {
        setTimeout(() => {
          try {
            recognition.start()
          } catch (e) {
            // Already started
          }
        }, 100)
      }
    }

    recognitionRef.current = recognition
    return recognition
  }, [onTranscript, onError, updateState, state, processUserInput])

  // Connect (initialize everything)
  const connect = useCallback(async () => {
    if (isConnectedRef.current) {
      console.log('[ElevenLabsVoice] Already connected')
      return
    }

    updateState('connecting')
    setError(null)

    try {
      // Get ElevenLabs config from our API
      const configResponse = await fetch('/api/voice/elevenlabs/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      })

      if (!configResponse.ok) {
        throw new Error('Failed to get ElevenLabs configuration')
      }

      const { voiceId: configVoiceId, apiKey } = await configResponse.json()
      currentVoiceIdRef.current = voiceId || configVoiceId
      apiKeyRef.current = apiKey

      // Setup audio context
      audioContextRef.current = new AudioContext({ sampleRate: 44100 })

      // Setup speech recognition
      setupSpeechRecognition()

      isConnectedRef.current = true
      updateState('listening')

      // Start listening
      if (recognitionRef.current) {
        recognitionRef.current.start()
      }

      console.log('[ElevenLabsVoice] Connected with voice:', currentVoiceIdRef.current)

    } catch (err) {
      console.error('[ElevenLabsVoice] Connection error:', err)
      const error = err instanceof Error ? err : new Error('Failed to connect')
      setError(error)
      onError?.(error)
      updateState('error')
    }
  }, [voiceId, setupSpeechRecognition, updateState, onError])

  // Disconnect
  const disconnect = useCallback(() => {
    console.log('[ElevenLabsVoice] Disconnecting...')
    isConnectedRef.current = false

    if (recognitionRef.current) {
      recognitionRef.current.stop()
      recognitionRef.current = null
    }

    if (ttsWebSocketRef.current) {
      ttsWebSocketRef.current.close()
      ttsWebSocketRef.current = null
    }

    if (audioContextRef.current) {
      audioContextRef.current.close()
      audioContextRef.current = null
    }

    audioQueueRef.current = []
    isPlayingRef.current = false

    updateState('idle')
  }, [updateState])

  // Start listening
  const startListening = useCallback(() => {
    if (recognitionRef.current && isConnectedRef.current) {
      try {
        recognitionRef.current.start()
        updateState('listening')
      } catch (e) {
        // Already started
      }
    }
  }, [updateState])

  // Stop listening
  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop()
    }
  }, [])

  // Interrupt (stop speaking and go back to listening)
  const interrupt = useCallback(() => {
    console.log('[ElevenLabsVoice] Interrupting...')

    // Stop all active audio sources
    activeSourcesRef.current.forEach(source => {
      try { source.stop() } catch (e) { /* already stopped */ }
    })
    activeSourcesRef.current = []

    // Clear audio queue and reset scheduling
    audioQueueRef.current = []
    isPlayingRef.current = false
    isProcessingQueueRef.current = false
    nextPlayTimeRef.current = 0

    // Close TTS WebSocket
    if (ttsWebSocketRef.current) {
      ttsWebSocketRef.current.close()
      ttsWebSocketRef.current = null
    }

    // Resume listening
    if (isConnectedRef.current) {
      updateState('listening')
      startListening()
    }
  }, [updateState, startListening])

  // Send text input (for typing fallback)
  const sendText = useCallback((text: string) => {
    if (isConnectedRef.current) {
      processUserInput(text)
    }
  }, [processUserInput])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disconnect()
    }
  }, [disconnect])

  return {
    state,
    isConnected: isConnectedRef.current,
    isListening: state === 'listening',
    isSpeaking: state === 'speaking',
    transcript,
    response,
    error,
    connect,
    disconnect,
    startListening,
    stopListening,
    interrupt,
    sendText,
  }
}
