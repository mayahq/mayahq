'use client'

/**
 * Voice Chat Test Component
 * Tests the new streaming maya-core endpoint for low-latency voice chat
 */

import { useState, useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Mic, MicOff, Volume2, VolumeX, Loader2 } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { WebPlayer } from '@cartesia/cartesia-js'

interface StreamEvent {
  type: 'start' | 'context_start' | 'context_ready' | 'llm_start' | 'chunk' | 'complete' | 'error'
  data: any
}

export default function VoiceChatTest() {
  const { user } = useAuth()
  const [isListening, setIsListening] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [wakeWordMode, setWakeWordMode] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [response, setResponse] = useState('')
  const [streamEvents, setStreamEvents] = useState<StreamEvent[]>([])
  const [stats, setStats] = useState<any>(null)
  
  const recognitionRef = useRef<any>(null)
  const eventSourceRef = useRef<EventSource | null>(null)
  const ttsTriggeredRef = useRef<boolean>(false)
  const accumulatedResponseRef = useRef<string>('')
  
  // Native WebSocket streaming refs
  const webPlayerRef = useRef<WebPlayer | null>(null)
  const nativeWebSocketRef = useRef<WebSocket | null>(null)
  const contextIdRef = useRef<string | null>(null)

  // Auto-trigger TTS when response is complete
  useEffect(() => {
    // Only trigger if we have a response, processing just finished, and we're not already speaking, and TTS hasn't been triggered yet
    if (response && response.trim() && !isProcessing && !isSpeaking && !ttsTriggeredRef.current) {
      const timer = setTimeout(() => {
        console.log('useEffect TTS trigger for response:', response.substring(0, 50) + '...')
        ttsTriggeredRef.current = true
        speakText(response)
      }, 300) // Small delay to ensure all state updates are complete
      
      return () => clearTimeout(timer)
    }
  }, [response, isProcessing, isSpeaking])

  // Initialize Speech Recognition
  useEffect(() => {
    if (typeof window !== 'undefined' && 'webkitSpeechRecognition' in window) {
      const SpeechRecognition = (window as any).webkitSpeechRecognition
      recognitionRef.current = new SpeechRecognition()
      recognitionRef.current.continuous = true
      recognitionRef.current.interimResults = true
      recognitionRef.current.lang = 'en-US'
      
      recognitionRef.current.onresult = (event: any) => {
        let interimTranscript = ''
        let finalTranscript = ''
        
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript
          if (event.results[i].isFinal) {
            finalTranscript += transcript
          } else {
            interimTranscript += transcript
          }
        }
        
        const fullTranscript = (finalTranscript || interimTranscript).toLowerCase()
        
        // Wake word detection
        if (wakeWordMode && (fullTranscript.includes('hey maya') || fullTranscript.includes('hey mya'))) {
          console.log('Wake word detected:', fullTranscript)
          setWakeWordMode(false)
          setIsListening(true)
          // Continue listening for the actual command
          return
        }
        
        if (finalTranscript && !wakeWordMode) {
          setTranscript(finalTranscript)
          handleVoiceInput(finalTranscript)
        }
      }
      
      recognitionRef.current.onerror = (event: any) => {
        console.error('Speech recognition error:', event.error)
        setIsListening(false)
      }
      
      recognitionRef.current.onend = () => {
        setIsListening(false)
      }
    }
  }, [])


  const startListening = () => {
    if (recognitionRef.current) {
      setTranscript('')
      setResponse('')
      setStreamEvents([])
      recognitionRef.current.start()
      setIsListening(true)
      setWakeWordMode(false)
    }
  }

  const stopListening = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop()
      setIsListening(false)
      setWakeWordMode(false)
    }
  }

  const startWakeWordMode = () => {
    if (recognitionRef.current) {
      setTranscript('')
      setResponse('')
      setStreamEvents([])
      setWakeWordMode(true)
      setIsListening(false)
      recognitionRef.current.start()
    }
  }

  const handleVoiceInput = async (text: string) => {
    if (!user) return
    
    setIsProcessing(true)
    setResponse('')
    setStreamEvents([])
    ttsTriggeredRef.current = false // Reset TTS flag for new conversation
    accumulatedResponseRef.current = '' // Reset accumulated text
    
    
    try {
      // Use local maya-core for testing
      const MAYA_CORE_URL = process.env.NEXT_PUBLIC_MAYA_CORE_URL || 'http://localhost:3333'
      
      // Create EventSource for streaming
      const url = new URL(`${MAYA_CORE_URL}/process/stream`)
      
      const requestBody = {
        message: text,
        userId: user.id,
        roomId: 'b5906d59-847b-4635-8db7-611a38bde6d0', // Use same room as main chat
        options: { maxTokens: 1024 }
      }
      
      // Send POST request and then connect to stream
      const response = await fetch(`${MAYA_CORE_URL}/process/stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'text/event-stream'
        },
        body: JSON.stringify(requestBody)
      })
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }
      
      const reader = response.body?.getReader()
      if (!reader) throw new Error('No response body')
      
      const decoder = new TextDecoder()
      let buffer = ''
      
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''
        
        for (const line of lines) {
          if (line.startsWith('event: ')) {
            const eventType = line.substring(7).trim()
            continue
          }
          
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.substring(6))
              const event: StreamEvent = { type: data.type || 'unknown', data }
              setStreamEvents(prev => [...prev, event])
              
              console.log('Stream event:', event.type, data)
              
              if (data.text) {
                // Accumulate text in both state and ref for immediate access
                accumulatedResponseRef.current += data.text
                setResponse(prev => prev + data.text)
              }
              
              if (data.stats) {
                setStats(data.stats)
              }
              
              // Use working TTS endpoint for now (WebSocket issues)
              if ((event.type === 'complete' || data.response) && !ttsTriggeredRef.current) {
                const finalText = accumulatedResponseRef.current || response
                if (finalText && finalText.trim()) {
                  console.log('⚡ Starting TTS with complete response')
                  ttsTriggeredRef.current = true
                  speakText(finalText)
                }
              }
            } catch (e) {
              console.error('Error parsing stream data:', e)
            }
          }
        }
      }
      
    } catch (error) {
      console.error('Voice processing error:', error)
      setStreamEvents(prev => [...prev, { type: 'error', data: { error: error.message } }])
    } finally {
      setIsProcessing(false)
      
      // Final fallback: If we have a response but TTS hasn't triggered, start it
      setTimeout(() => {
        const finalText = accumulatedResponseRef.current || response
        if (finalText && finalText.trim() && !isSpeaking && !ttsTriggeredRef.current) {
          console.log('Final fallback TTS trigger with accumulated response:', finalText.substring(0, 50) + '...')
          ttsTriggeredRef.current = true
          speakText(finalText)
        }
      }, 300)
    }
  }

  const speakText = async (text: string) => {
    if (!text || !text.trim()) {
      console.log('No text provided for TTS')
      return
    }

    console.log('Speaking with Cartesia TTS:', text.substring(0, 50) + '...')
    setIsSpeaking(true)

    try {
      const MAYA_CORE_URL = process.env.NEXT_PUBLIC_MAYA_CORE_URL || 'http://localhost:3333'
      
      console.log('Making Cartesia TTS request to:', `${MAYA_CORE_URL}/tts`)
      
      const response = await fetch(`${MAYA_CORE_URL}/tts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          text: text.trim(),
          voice: "e83c2613-1764-4d6d-b5e1-668558fb3b1a", // Maya's cloned voice ID
          speed: 1.1 // Slightly faster speech
        })
      })

      console.log('TTS Response status:', response.status)
      console.log('TTS Response headers:', response.headers)

      if (!response.ok) {
        const errorData = await response.json()
        console.error('TTS API error response:', errorData)
        throw new Error(`TTS API error: ${response.status} - ${errorData.error || 'Unknown error'}`)
      }

      // Convert response to audio blob
      const audioBlob = await response.blob()
      console.log('Audio blob type:', audioBlob.type)
      console.log('Audio blob size:', audioBlob.size)
      
      const audioUrl = URL.createObjectURL(audioBlob)
      const audio = new Audio(audioUrl)
      
      // Debug audio element
      console.log('Audio src:', audio.src)
      console.log('Audio canPlayType mp3:', audio.canPlayType('audio/mpeg'))
      console.log('Audio canPlayType wav:', audio.canPlayType('audio/wav'))

      audio.onloadstart = () => {
        console.log('Cartesia TTS started')
        setIsSpeaking(true)
        
        // STOP LISTENING while Maya is speaking to prevent echo feedback
        if (recognitionRef.current && isListening) {
          console.log('🔇 Stopping listening to prevent echo feedback')
          recognitionRef.current.stop()
        }
      }

      audio.onended = () => {
        console.log('Cartesia TTS ended')
        setIsSpeaking(false)
        URL.revokeObjectURL(audioUrl) // Clean up

        // Auto-resume listening after Maya finishes speaking with longer delay for echo prevention
        console.log('TTS finished. isListening:', isListening, 'isProcessing:', isProcessing)
        if (isListening && !isProcessing) {
          console.log('Resuming listening after TTS with echo prevention delay...')
          setTimeout(() => {
            if (recognitionRef.current) {
              try {
                recognitionRef.current.start()
                console.log('Successfully restarted recognition after echo prevention')
              } catch (e: any) {
                console.log('Recognition restart error:', e.message)
                // Try again with a longer delay
                setTimeout(() => {
                  try {
                    recognitionRef.current.start()
                    console.log('Recognition restarted on second attempt')
                  } catch (e2: any) {
                    console.error('Failed to restart recognition:', e2.message)
                  }
                }, 1000)
              }
            }
          }, 1500) // Longer delay to prevent echo
        }
      }

      audio.onerror = (event) => {
        console.error('Audio playback error:', event)
        setIsSpeaking(false)
        URL.revokeObjectURL(audioUrl)
      }

      // Play the audio
      await audio.play()

    } catch (error: any) {
      console.error('Cartesia TTS error:', error)
      setIsSpeaking(false)
      
      // Fallback to browser TTS
      console.log('Falling back to browser TTS...')
      if ('speechSynthesis' in window) {
        const utterance = new SpeechSynthesisUtterance(text.trim())
        utterance.rate = 1.1
        utterance.onend = () => {
          setIsSpeaking(false)
          // Same auto-resume logic as above
          if (isListening && !isProcessing) {
            setTimeout(() => {
              if (recognitionRef.current) {
                try {
                  recognitionRef.current.start()
                } catch (e: any) {
                  console.log('Fallback recognition restart error:', e.message)
                }
              }
            }, 750)
          }
        }
        utterance.onerror = () => setIsSpeaking(false)
        speechSynthesis.speak(utterance)
      }
    }
  }




  // Initialize WebPlayer only
  useEffect(() => {
    if (typeof window !== 'undefined') {
      webPlayerRef.current = new WebPlayer({
        bufferDuration: 1000 // 1 second buffer
      })
      console.log('🎵 WebPlayer initialized')
    }
  }, [])

  // NATIVE WEBSOCKET STREAMING (ACTUALLY WORKS)
  const startStreamingTTS = async (initialText: string) => {
    console.log('⚡ Starting native Cartesia WebSocket streaming')
    setIsSpeaking(true)
    
    // Stop listening to prevent echo
    if (recognitionRef.current && isListening) {
      console.log('🔇 Stopping listening for streaming TTS')
      recognitionRef.current.stop()
    }

    try {
      if (!webPlayerRef.current) {
        throw new Error('WebPlayer not initialized')
      }

      const apiKey = process.env.NEXT_PUBLIC_CARTESIA_API_KEY
      if (!apiKey) {
        throw new Error('Cartesia API key not found')
      }

      // Create native WebSocket connection
      const wsUrl = `wss://api.cartesia.ai/tts/websocket`
      const ws = new WebSocket(wsUrl, [], {
        headers: {
          'X-API-Key': apiKey,
          'Cartesia-Version': '2024-06-10'
        }
      })
      nativeWebSocketRef.current = ws
      
      // Generate context ID
      const contextId = `maya-${Date.now()}`
      contextIdRef.current = contextId
      
      ws.onopen = () => {
        console.log('✅ Native WebSocket connected')
        
        // Send initial message
        const message = {
          model_id: 'sonic-english',
          transcript: initialText,
          voice: {
            mode: 'id',
            id: 'e83c2613-1764-4d6d-b5e1-668558fb3b1a'
          },
          language: 'en',
          context_id: contextId,
          output_format: {
            container: 'raw',
            encoding: 'pcm_s16le',
            sample_rate: 22050
          },
          continue: false
        }
        
        ws.send(JSON.stringify(message))
        console.log('✅ Initial text sent to Cartesia')
      }
      
      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data)
          console.log('📬 Received message type:', msg.type)
          
          if (msg.type === 'chunk') {
            console.log('🎵 Received audio chunk')
            const buffer = Uint8Array.from(atob(msg.data), c => c.charCodeAt(0))
            webPlayerRef.current?.feed(buffer)
          }
          
          if (msg.type === 'done') {
            console.log('✅ WebSocket stream completed')
            webPlayerRef.current?.end()
            ws.close()
            setIsSpeaking(false)
            
            // Resume listening after delay
            if (isListening && !isProcessing) {
              setTimeout(() => {
                if (recognitionRef.current) {
                  try {
                    recognitionRef.current.start()
                    console.log('🎤 Resumed listening after streaming')
                  } catch (e: any) {
                    console.log('Warning: Could not restart recognition:', e.message)
                  }
                }
              }, 1000)
            }
          }
          
          if (msg.type === 'error') {
            console.error('❌ Cartesia error:', msg.error)
            setIsSpeaking(false)
            ws.close()
          }
          
        } catch (error) {
          console.error('❌ Error parsing WebSocket message:', error)
        }
      }
      
      ws.onerror = (error) => {
        console.error('❌ WebSocket error:', error)
        setIsSpeaking(false)
      }
      
      ws.onclose = () => {
        console.log('🔌 WebSocket closed')
        nativeWebSocketRef.current = null
      }
      
    } catch (error: any) {
      console.error('❌ Failed to start native streaming:', error)
      setIsSpeaking(false)
    }
  }
  
  const addTextToStream = async (text: string) => {
    if (!text || !text.trim()) {
      console.log('⚠️ Skipping empty text chunk')
      return
    }
    
    if (!nativeWebSocketRef.current || nativeWebSocketRef.current.readyState !== WebSocket.OPEN) {
      console.log('⚠️ WebSocket not ready for text:', text)
      return
    }
    
    if (!contextIdRef.current) {
      console.log('⚠️ No context ID for text:', text)
      return
    }
    
    try {
      console.log('📤 Adding text to native stream:', text)
      
      const message = {
        model_id: 'sonic-english',
        transcript: text,
        voice: {
          mode: 'id',
          id: 'e83c2613-1764-4d6d-b5e1-668558fb3b1a'
        },
        language: 'en',
        context_id: contextIdRef.current,
        output_format: {
          container: 'raw',
          encoding: 'pcm_s16le',
          sample_rate: 22050
        },
        continue: true
      }
      
      nativeWebSocketRef.current.send(JSON.stringify(message))
      console.log('✅ Successfully sent chunk to Cartesia')
      
    } catch (error: any) {
      console.error('❌ Error adding text to stream:', error)
    }
  }
  
  const endStreamingTTS = async () => {
    console.log('🏁 Ending native WebSocket stream')
    
    try {
      if (nativeWebSocketRef.current && nativeWebSocketRef.current.readyState === WebSocket.OPEN && contextIdRef.current) {
        // Send empty final chunk to end context
        const message = {
          model_id: 'sonic-english',
          transcript: '',
          voice: {
            mode: 'id',
            id: 'e83c2613-1764-4d6d-b5e1-668558fb3b1a'
          },
          language: 'en',
          context_id: contextIdRef.current,
          output_format: {
            container: 'raw',
            encoding: 'pcm_s16le',
            sample_rate: 22050
          },
          continue: false
        }
        
        nativeWebSocketRef.current.send(JSON.stringify(message))
        console.log('✅ Final empty chunk sent')
      }
      
      contextIdRef.current = null
      console.log('✅ Native stream ended')
      
    } catch (error: any) {
      console.error('❌ Error ending stream:', error)
    }
  }

  const stopSpeaking = () => {
    // Stop browser TTS if active
    if ('speechSynthesis' in window) {
      speechSynthesis.cancel()
    }
    
    // Clear audio queue
    currentAudioQueue = []
    isProcessingQueue = false
    
    // Stop any playing audio elements
    const audioElements = document.querySelectorAll('audio')
    audioElements.forEach(audio => {
      audio.pause()
      audio.currentTime = 0
    })
    
    setIsSpeaking(false)
    console.log('Stopped all TTS playback')
  }

  return (
    <div className="container mx-auto p-4 max-w-4xl">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mic className="w-5 h-5" />
            Voice Chat Test - Maya Core Streaming
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          
          {/* Voice Controls */}
          <div className="flex gap-4 justify-center flex-wrap">
            <Button
              onClick={isListening ? stopListening : startListening}
              disabled={isProcessing || wakeWordMode}
              variant={isListening ? "destructive" : "default"}
              size="lg"
            >
              {isListening ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
              {isListening ? 'Stop Listening' : 'Start Listening'}
            </Button>
            
            <Button
              onClick={wakeWordMode ? stopListening : startWakeWordMode}
              disabled={isProcessing || isListening}
              variant={wakeWordMode ? "destructive" : "secondary"}
              size="lg"
            >
              {wakeWordMode ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
              {wakeWordMode ? 'Stop Wake Word' : 'Hey Maya Mode'}
            </Button>
            
            <Button
              onClick={isSpeaking ? stopSpeaking : () => {
                if (response) {
                  ttsTriggeredRef.current = true // Mark as triggered to prevent auto-trigger
                  speakText(response)
                }
              }}
              disabled={!response && !isSpeaking}
              variant={isSpeaking ? "destructive" : "outline"}
              size="lg"
            >
              {isSpeaking ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
              {isSpeaking ? 'Stop Speaking' : response ? 'Speak Response' : 'TTS Ready'}
            </Button>
          </div>

          {/* Status */}
          <div className="text-center">
            {wakeWordMode && <p className="text-orange-600">👂 Waiting for "Hey Maya"...</p>}
            {isListening && <p className="text-blue-600">🎤 Listening...</p>}
            {isProcessing && (
              <div className="flex items-center justify-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                <p className="text-purple-600">Processing with Maya Core...</p>
              </div>
            )}
            {isSpeaking && <p className="text-green-600">🔊 Maya is speaking...</p>}
          </div>

          {/* Transcript */}
          {transcript && (
            <Card className="border-blue-200 bg-blue-50 dark:bg-blue-950 dark:border-blue-800">
              <CardHeader>
                <CardTitle className="text-sm text-blue-900 dark:text-blue-100">Your Message</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-blue-800 dark:text-blue-200 font-medium">{transcript}</p>
              </CardContent>
            </Card>
          )}

          {/* Response */}
          {response && (
            <Card className="border-purple-200 bg-purple-50 dark:bg-purple-950 dark:border-purple-800">
              <CardHeader>
                <CardTitle className="text-sm text-purple-900 dark:text-purple-100">Maya's Response</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-purple-800 dark:text-purple-200 font-medium whitespace-pre-wrap">{response}</p>
              </CardContent>
            </Card>
          )}

          {/* Stats */}
          {stats && (
            <Card className="border-green-200 bg-green-50 dark:bg-green-950 dark:border-green-800">
              <CardHeader>
                <CardTitle className="text-sm text-green-900 dark:text-green-100">Performance Stats</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4 text-sm text-green-800 dark:text-green-200">
                  <div><span className="font-semibold">Context Time:</span> {stats.contextTime}ms</div>
                  <div><span className="font-semibold">Memories:</span> {stats.memoriesUsed}</div>
                  <div><span className="font-semibold">Facts:</span> {stats.factsUsed}</div>
                  <div><span className="font-semibold">Core Facts:</span> {stats.coreFactsUsed}</div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Stream Events Debug */}
          <Card className="border-gray-200 bg-white dark:bg-gray-900 dark:border-gray-700">
            <CardHeader>
              <CardTitle className="text-sm text-gray-900 dark:text-gray-100">Stream Events ({streamEvents.length})</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="max-h-40 overflow-y-auto space-y-2 text-xs">
                {streamEvents.map((event, i) => (
                  <div key={i} className={`p-3 rounded border ${
                    event.type === 'error' ? 'bg-red-50 border-red-200 dark:bg-red-950 dark:border-red-800' :
                    event.type === 'complete' ? 'bg-green-50 border-green-200 dark:bg-green-950 dark:border-green-800' :
                    event.type === 'chunk' ? 'bg-blue-50 border-blue-200 dark:bg-blue-950 dark:border-blue-800' :
                    'bg-gray-50 border-gray-200 dark:bg-gray-800 dark:border-gray-600'
                  }`}>
                    <div className={`font-semibold mb-1 ${
                      event.type === 'error' ? 'text-red-700 dark:text-red-300' :
                      event.type === 'complete' ? 'text-green-700 dark:text-green-300' :
                      event.type === 'chunk' ? 'text-blue-700 dark:text-blue-300' :
                      'text-gray-700 dark:text-gray-300'
                    }`}>
                      {event.type.toUpperCase()}
                    </div>
                    <pre className={`text-xs overflow-auto whitespace-pre-wrap ${
                      event.type === 'error' ? 'text-red-600 dark:text-red-400' :
                      event.type === 'complete' ? 'text-green-600 dark:text-green-400' :
                      event.type === 'chunk' ? 'text-blue-600 dark:text-blue-400' :
                      'text-gray-600 dark:text-gray-400'
                    }`}>
                      {JSON.stringify(event.data, null, 2)}
                    </pre>
                  </div>
                ))}
                {streamEvents.length === 0 && (
                  <div className="text-center text-gray-500 dark:text-gray-400 py-8">
                    No stream events yet. Start listening to see real-time events!
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

        </CardContent>
      </Card>
    </div>
  )
}