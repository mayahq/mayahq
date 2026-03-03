'use client'

import { useState, useRef, useCallback, useEffect } from 'react'

export type VoiceState = 'idle' | 'connecting' | 'connected' | 'listening' | 'thinking' | 'speaking' | 'error'

export interface UseXaiVoiceOptions {
  onTranscript?: (text: string, isFinal: boolean) => void
  onResponse?: (text: string) => void
  onStateChange?: (state: VoiceState) => void
  onError?: (error: Error) => void
  autoReconnect?: boolean
}

export interface UseXaiVoiceReturn {
  state: VoiceState
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

// Audio worklet for processing microphone input
const AUDIO_WORKLET_CODE = `
class AudioProcessor extends AudioWorkletProcessor {
  constructor() {
    super()
    this.bufferSize = 2400 // 100ms at 24kHz
    this.buffer = new Float32Array(this.bufferSize)
    this.bufferIndex = 0
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0]
    if (!input || !input[0]) return true

    const inputData = input[0]

    for (let i = 0; i < inputData.length; i++) {
      this.buffer[this.bufferIndex++] = inputData[i]

      if (this.bufferIndex >= this.bufferSize) {
        // Convert to PCM16 and send
        const pcm16 = new Int16Array(this.bufferSize)
        for (let j = 0; j < this.bufferSize; j++) {
          const s = Math.max(-1, Math.min(1, this.buffer[j]))
          pcm16[j] = s < 0 ? s * 0x8000 : s * 0x7FFF
        }

        this.port.postMessage({ type: 'audio', data: pcm16.buffer }, [pcm16.buffer])
        this.buffer = new Float32Array(this.bufferSize)
        this.bufferIndex = 0
      }
    }

    return true
  }
}

registerProcessor('audio-processor', AudioProcessor)
`

/**
 * React hook for xAI Grok Voice API
 * Provides ultra-low latency (<1s) voice conversations
 */
export function useXaiVoice(options: UseXaiVoiceOptions = {}): UseXaiVoiceReturn {
  const {
    onTranscript,
    onResponse,
    onStateChange,
    onError,
    autoReconnect = false,
  } = options

  // State
  const [state, setState] = useState<VoiceState>('idle')
  const [transcript, setTranscript] = useState('')
  const [response, setResponse] = useState('')
  const [error, setError] = useState<Error | null>(null)

  // Refs for WebSocket and audio
  const wsRef = useRef<WebSocket | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const mediaStreamRef = useRef<MediaStream | null>(null)
  const workletNodeRef = useRef<AudioWorkletNode | null>(null)
  const playbackContextRef = useRef<AudioContext | null>(null)
  const audioQueueRef = useRef<ArrayBuffer[]>([])
  const isPlayingRef = useRef(false)
  const sessionConfiguredRef = useRef(false)
  const lastTranscriptRef = useRef<string>('')
  const lastResponseRef = useRef<string>('')

  // Update state and notify
  const updateState = useCallback((newState: VoiceState) => {
    setState(newState)
    onStateChange?.(newState)
  }, [onStateChange])

  // Convert ArrayBuffer to base64
  const arrayBufferToBase64 = useCallback((buffer: ArrayBuffer): string => {
    const bytes = new Uint8Array(buffer)
    let binary = ''
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i])
    }
    return btoa(binary)
  }, [])

  // Convert base64 to ArrayBuffer
  const base64ToArrayBuffer = useCallback((base64: string): ArrayBuffer => {
    const binary = atob(base64)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i)
    }
    return bytes.buffer
  }, [])

  // Play audio from queue
  const playNextAudio = useCallback(async () => {
    if (isPlayingRef.current || audioQueueRef.current.length === 0) return

    isPlayingRef.current = true

    while (audioQueueRef.current.length > 0) {
      const audioData = audioQueueRef.current.shift()
      if (!audioData) continue

      try {
        if (!playbackContextRef.current) {
          playbackContextRef.current = new AudioContext({ sampleRate: 24000 })
        }

        // Create audio buffer from PCM16 data
        const pcm16 = new Int16Array(audioData)
        const float32 = new Float32Array(pcm16.length)
        for (let i = 0; i < pcm16.length; i++) {
          float32[i] = pcm16[i] / 32768
        }

        const audioBuffer = playbackContextRef.current.createBuffer(1, float32.length, 24000)
        audioBuffer.getChannelData(0).set(float32)

        const source = playbackContextRef.current.createBufferSource()
        source.buffer = audioBuffer
        source.connect(playbackContextRef.current.destination)

        await new Promise<void>((resolve) => {
          source.onended = () => resolve()
          source.start()
        })
      } catch (err) {
        console.error('[XaiVoice] Error playing audio:', err)
      }
    }

    isPlayingRef.current = false

    // If we finished speaking and were in speaking state, go back to listening
    if (state === 'speaking') {
      updateState('listening')
    }
  }, [state, updateState])

  // Handle WebSocket messages
  const handleMessage = useCallback((event: MessageEvent) => {
    try {
      const data = JSON.parse(event.data)
      console.log('[XaiVoice] Received:', data.type)

      switch (data.type) {
        case 'session.created':
          console.log('[XaiVoice] Session created:', data)
          break

        case 'session.updated':
          console.log('[XaiVoice] Session configured successfully')
          console.log('[XaiVoice] Session details:', JSON.stringify(data.session || data).substring(0, 300))
          sessionConfiguredRef.current = true

          // Prime Maya with context by adding an initial assistant message
          // This helps the model "remember" who it's talking to
          if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({
              type: 'conversation.item.create',
              item: {
                type: 'message',
                role: 'assistant',
                content: [{
                  type: 'text',
                  text: "Hey Blake! I'm here and ready to chat. What's on your mind?"
                }]
              }
            }))
            console.log('[XaiVoice] Sent initial context message')
          }

          updateState('connected')
          break

        case 'error':
          console.error('[XaiVoice] API Error:', data.error)
          const apiErr = new Error(data.error?.message || 'xAI API error')
          setError(apiErr)
          onError?.(apiErr)
          updateState('error')
          break

        case 'input_audio_buffer.speech_started':
          console.log('[XaiVoice] Speech detected')
          updateState('listening')
          break

        case 'input_audio_buffer.speech_stopped':
          console.log('[XaiVoice] Speech stopped')
          break

        case 'conversation.item.input_audio_transcription.completed':
          const userText = data.transcript || ''
          console.log('[XaiVoice] User said:', userText)
          setTranscript(userText)
          lastTranscriptRef.current = userText // Track for saving
          onTranscript?.(userText, true)
          updateState('thinking')
          break

        case 'response.created':
          console.log('[XaiVoice] Response started')
          setResponse('')
          break

        case 'response.output_audio.delta':
          // Audio chunk received
          if (data.delta) {
            const audioData = base64ToArrayBuffer(data.delta)
            audioQueueRef.current.push(audioData)

            if (state !== 'speaking') {
              updateState('speaking')
            }

            playNextAudio()
          }
          break

        case 'response.output_audio_transcript.delta':
          // Text transcript of response
          if (data.delta) {
            setResponse(prev => {
              const newResponse = prev + data.delta
              lastResponseRef.current = newResponse // Track for saving
              onResponse?.(newResponse)
              return newResponse
            })
          }
          break

        case 'response.done':
          console.log('[XaiVoice] Response complete')

          // Save the voice exchange to memory
          if (lastTranscriptRef.current || lastResponseRef.current) {
            fetch('/api/voice/save-exchange', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                userTranscript: lastTranscriptRef.current,
                mayaResponse: lastResponseRef.current
              })
            }).catch(err => console.error('[XaiVoice] Failed to save exchange:', err))

            // Reset for next exchange
            lastTranscriptRef.current = ''
            lastResponseRef.current = ''
          }

          // Wait for audio queue to empty before changing state
          if (audioQueueRef.current.length === 0 && !isPlayingRef.current) {
            updateState('listening')
          }
          break

        case 'error':
          console.error('[XaiVoice] Error:', data.error)
          const err = new Error(data.error?.message || 'Voice API error')
          setError(err)
          onError?.(err)
          updateState('error')
          break

        default:
          console.log('[XaiVoice] Unhandled event:', data.type)
      }
    } catch (err) {
      console.error('[XaiVoice] Error parsing message:', err)
    }
  }, [base64ToArrayBuffer, onTranscript, onResponse, onError, updateState, playNextAudio, state])

  // Setup audio input
  const setupAudioInput = useCallback(async () => {
    try {
      // Get microphone access
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 24000,
        }
      })
      mediaStreamRef.current = stream

      // Create audio context at 24kHz
      audioContextRef.current = new AudioContext({ sampleRate: 24000 })

      // Create worklet for audio processing
      const workletBlob = new Blob([AUDIO_WORKLET_CODE], { type: 'application/javascript' })
      const workletUrl = URL.createObjectURL(workletBlob)
      await audioContextRef.current.audioWorklet.addModule(workletUrl)
      URL.revokeObjectURL(workletUrl)

      // Connect microphone to worklet
      const source = audioContextRef.current.createMediaStreamSource(stream)
      const workletNode = new AudioWorkletNode(audioContextRef.current, 'audio-processor')
      workletNodeRef.current = workletNode

      // Handle audio data from worklet
      workletNode.port.onmessage = (event) => {
        if (event.data.type === 'audio' && wsRef.current?.readyState === WebSocket.OPEN) {
          const base64Audio = arrayBufferToBase64(event.data.data)
          wsRef.current.send(JSON.stringify({
            type: 'input_audio_buffer.append',
            audio: base64Audio
          }))
        }
      }

      source.connect(workletNode)
      // Don't connect to destination - we don't want to hear ourselves

      console.log('[XaiVoice] Audio input ready')
      return true
    } catch (err) {
      console.error('[XaiVoice] Failed to setup audio:', err)
      throw err
    }
  }, [arrayBufferToBase64])

  // Connect to xAI Voice API
  const connect = useCallback(async () => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      console.log('[XaiVoice] Already connected')
      return
    }

    updateState('connecting')
    setError(null)
    sessionConfiguredRef.current = false

    try {
      // Get ephemeral token from our API
      const tokenResponse = await fetch('/api/voice/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      })

      if (!tokenResponse.ok) {
        throw new Error('Failed to get voice session token')
      }

      const { client_secret, instructions, voice } = await tokenResponse.json()

      // Setup audio input first
      await setupAudioInput()

      // Connect to xAI realtime API
      // Try OpenAI-compatible subprotocol format
      console.log('[XaiVoice] Connecting to xAI WebSocket...')
      console.log('[XaiVoice] Token prefix:', client_secret.substring(0, 30) + '...')

      const ws = new WebSocket(
        `wss://api.x.ai/v1/realtime?model=grok-2-public`,
        ['realtime', `openai-insecure-api-key.${client_secret}`]
      )

      wsRef.current = ws

      ws.onopen = () => {
        console.log('[XaiVoice] WebSocket connected!')
        console.log('[XaiVoice] Instructions length:', instructions?.length || 0)
        console.log('[XaiVoice] Instructions preview:', instructions?.substring(0, 200) + '...')

        // Configure session with system instructions
        const sessionConfig = {
          type: 'session.update',
          session: {
            modalities: ['text', 'audio'],
            voice: voice || 'alloy',
            instructions: instructions,
            input_audio_format: 'pcm16',
            output_audio_format: 'pcm16',
            input_audio_transcription: {
              model: 'whisper-1'
            },
            turn_detection: {
              type: 'server_vad',
              threshold: 0.5,
              prefix_padding_ms: 300,
              silence_duration_ms: 500
            }
          }
        }

        console.log('[XaiVoice] Sending session config:', JSON.stringify(sessionConfig).substring(0, 500))
        ws.send(JSON.stringify(sessionConfig))
      }

      ws.onmessage = handleMessage

      ws.onerror = (event) => {
        console.error('[XaiVoice] WebSocket error:', event)
        console.error('[XaiVoice] WebSocket readyState:', ws.readyState)
        const err = new Error('Voice connection error - check browser console for details')
        setError(err)
        onError?.(err)
        updateState('error')
      }

      ws.onclose = (event) => {
        console.log('[XaiVoice] WebSocket closed:', event.code, event.reason)

        // Cleanup audio
        if (mediaStreamRef.current) {
          mediaStreamRef.current.getTracks().forEach(track => track.stop())
          mediaStreamRef.current = null
        }
        if (audioContextRef.current) {
          audioContextRef.current.close()
          audioContextRef.current = null
        }

        wsRef.current = null

        if (state !== 'error') {
          updateState('idle')
        }

        // Auto-reconnect if enabled and not intentionally closed
        if (autoReconnect && event.code !== 1000) {
          console.log('[XaiVoice] Auto-reconnecting in 2s...')
          setTimeout(connect, 2000)
        }
      }

    } catch (err) {
      console.error('[XaiVoice] Connection error:', err)
      const error = err instanceof Error ? err : new Error('Failed to connect')
      setError(error)
      onError?.(error)
      updateState('error')
    }
  }, [setupAudioInput, handleMessage, onError, updateState, autoReconnect, state])

  // Disconnect
  const disconnect = useCallback(() => {
    console.log('[XaiVoice] Disconnecting...')

    if (wsRef.current) {
      wsRef.current.close(1000, 'User disconnected')
      wsRef.current = null
    }

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop())
      mediaStreamRef.current = null
    }

    if (audioContextRef.current) {
      audioContextRef.current.close()
      audioContextRef.current = null
    }

    if (playbackContextRef.current) {
      playbackContextRef.current.close()
      playbackContextRef.current = null
    }

    audioQueueRef.current = []
    isPlayingRef.current = false
    sessionConfiguredRef.current = false

    updateState('idle')
  }, [updateState])

  // Start listening (resume audio input after interrupt)
  const startListening = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'input_audio_buffer.clear'
      }))
      updateState('listening')
    }
  }, [updateState])

  // Stop listening (pause audio input)
  const stopListening = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'input_audio_buffer.commit'
      }))
    }
  }, [])

  // Interrupt Maya (stop current response)
  const interrupt = useCallback(() => {
    console.log('[XaiVoice] Interrupting...')

    // Clear audio queue
    audioQueueRef.current = []
    isPlayingRef.current = false

    // Cancel current response
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'response.cancel'
      }))
    }

    updateState('listening')
  }, [updateState])

  // Send text input (for typing fallback)
  const sendText = useCallback((text: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN && sessionConfiguredRef.current) {
      // Add user message
      wsRef.current.send(JSON.stringify({
        type: 'conversation.item.create',
        item: {
          type: 'message',
          role: 'user',
          content: [{ type: 'input_text', text }]
        }
      }))

      // Request response
      wsRef.current.send(JSON.stringify({
        type: 'response.create'
      }))

      setTranscript(text)
      updateState('thinking')
    }
  }, [updateState])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disconnect()
    }
  }, [disconnect])

  return {
    state,
    isConnected: state !== 'idle' && state !== 'connecting' && state !== 'error',
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
