'use client'

import React, { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Mic, MicOff, X, Volume2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { sendMessage } from '@mayahq/chat-sdk'
import { Message as ChatMessage } from '@mayahq/chat-sdk'
import Image from 'next/image'

interface VoiceChatInterfaceProps {
  roomId: string
  userId: string
  onClose?: () => void
  supabaseClient: any // Accept authenticated supabase client as prop
  messages: ChatMessage[] // Accept messages from parent to avoid duplicate subscriptions
  mayaAvatar?: string // Maya's avatar URL
}

// Web Speech API types
declare global {
  interface Window {
    SpeechRecognition: any
    webkitSpeechRecognition: any
  }
}

export function VoiceChatInterface({ roomId, userId, onClose, supabaseClient, messages, mayaAvatar }: VoiceChatInterfaceProps) {
  const [isListening, setIsListening] = useState(false)
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [silenceCountdown, setSilenceCountdown] = useState<number | null>(null) // Visual countdown
  
  const recognitionRef = useRef<any>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const audioQueueRef = useRef<string[]>([])
  const isPlayingRef = useRef(false)
  const transcriptRef = useRef('') // Add ref to store latest transcript
  const processedMessageIdsRef = useRef<Set<string>>(new Set()) // Track which messages we've already processed
  const pendingAudioMessagesRef = useRef<Map<string, ReturnType<typeof setInterval>>>(new Map()) // Track messages waiting for audio
  const silenceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null) // For custom silence detection
  const lastSpeechTimeRef = useRef(Date.now()) // Track last time we received speech
  const isListeningRef = useRef(false) // Add ref for isListening to avoid closure issues
  const countdownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null) // For countdown display
  const isInitializedRef = useRef(false) // Track if we've initialized to prevent autoplay
  
  // Clear processed messages when component mounts to prevent playing old audio
  useEffect(() => {
    console.log('[Voice] Voice interface opened, clearing processed messages')
    processedMessageIdsRef.current.clear()
    
    // Mark all current messages as already processed
    messages.forEach(msg => {
      if (msg.role === 'assistant') {
        processedMessageIdsRef.current.add(msg.id)
      }
    })
    console.log(`[Voice] Marked ${processedMessageIdsRef.current.size} existing messages as processed`)
    
    // Set initialized after a short delay to prevent any race conditions
    setTimeout(() => {
      isInitializedRef.current = true
      console.log('[Voice] Voice interface fully initialized, ready to process new messages')
    }, 500)
  }, []) // Run once on mount

  // Initialize speech recognition
  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SpeechRecognition) {
      setError('Speech recognition not supported in your browser')
      return
    }

    // Check microphone permissions
    navigator.mediaDevices.getUserMedia({ audio: true })
      .then(stream => {
        console.log('[Voice] Microphone access granted')
        // Stop the stream immediately, we just needed to check permissions
        stream.getTracks().forEach(track => track.stop())
      })
      .catch(err => {
        console.error('[Voice] Microphone access denied:', err)
        setError('Microphone access is required for voice mode. Please allow microphone access and try again.')
      })

    const recognition = new SpeechRecognition()
    recognition.continuous = true // Keep listening even after pauses
    recognition.interimResults = true
    recognition.lang = 'en-US'
    recognition.maxAlternatives = 1

    recognition.onstart = () => {
      console.log('[Voice] Speech recognition started')
    }
    
    recognition.onsoundstart = () => {
      console.log('[Voice] Sound detected')
    }
    
    recognition.onspeechstart = () => {
      console.log('[Voice] Speech detected')
    }
    
    recognition.onsoundend = () => {
      console.log('[Voice] Sound ended')
    }
    
    recognition.onspeechend = () => {
      console.log('[Voice] Speech ended')
    }
    
    recognition.onnomatch = () => {
      console.log('[Voice] No speech match')
    }
    
    recognition.onaudiostart = () => {
      console.log('[Voice] Audio capture started')
    }
    
    recognition.onaudioend = () => {
      console.log('[Voice] Audio capture ended')
    }

    recognition.onresult = (event: any) => {
      console.log('[Voice] onresult fired. Results:', event.results.length)
      
      const transcript = Array.from(event.results)
        .map((result: any) => result[0])
        .map((result: any) => result.transcript)
        .join('')
      
      console.log('[Voice] Transcript:', transcript)
      setTranscript(transcript)
      transcriptRef.current = transcript // Update ref with latest transcript
      lastSpeechTimeRef.current = Date.now() // Update last speech time
      
      // Clear any existing silence timer and countdown
      if (silenceTimeoutRef.current) {
        clearTimeout(silenceTimeoutRef.current)
        console.log('[Voice] Cleared existing silence timer due to new speech')
      }
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current)
        setSilenceCountdown(null)
      }
      
      // Start new silence timer (3 seconds of silence before sending)
      let countdown = 3
      setSilenceCountdown(countdown)
      
      // Update countdown every second
      countdownIntervalRef.current = setInterval(() => {
        countdown--
        if (countdown > 0) {
          setSilenceCountdown(countdown)
        }
      }, 1000)
      
      silenceTimeoutRef.current = setTimeout(() => {
        console.log('[Voice] Silence detected for 3 seconds, checking if should send...')
        console.log('[Voice] Current state - isListening:', isListeningRef.current, 'transcript:', transcriptRef.current)
        
        if (countdownIntervalRef.current) {
          clearInterval(countdownIntervalRef.current)
          setSilenceCountdown(null)
        }
        
        if (isListeningRef.current && transcriptRef.current.trim()) {
          console.log('[Voice] Conditions met, stopping listening to send message')
          stopListening()
        }
      }, 3000) // Wait 3 seconds of silence
      
      console.log('[Voice] Started new 3-second silence timer')
    }

    recognition.onerror = (event: any) => {
      console.error('[Voice] Speech recognition error:', event.error, event)
      setIsListening(false)
      
      // More specific error messages
      if (event.error === 'no-speech') {
        // Don't show error for no-speech, just keep listening
        console.log('[Voice] No speech detected, continuing to listen...')
        return
      } else if (event.error === 'audio-capture') {
        setError('No microphone detected. Please check your microphone.')
      } else if (event.error === 'not-allowed') {
        setError('Microphone access denied. Please allow microphone access.')
      } else {
        setError(`Speech recognition error: ${event.error}`)
      }
    }

    recognition.onend = () => {
      console.log('[Voice] Speech recognition ended. Final transcript:', transcriptRef.current)
      
      // Clear silence timer and countdown
      if (silenceTimeoutRef.current) {
        clearTimeout(silenceTimeoutRef.current)
        silenceTimeoutRef.current = null
      }
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current)
        setSilenceCountdown(null)
      }
      
      // If we were still listening, restart recognition (for continuous mode)
      if (isListeningRef.current) {
        console.log('[Voice] Restarting recognition for continuous listening')
        try {
          recognition.start()
        } catch (e) {
          console.error('[Voice] Failed to restart recognition:', e)
          setIsListening(false)
          isListeningRef.current = false
        }
      }
    }

    recognitionRef.current = recognition
    
    // Cleanup
    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop()
        } catch (e) {
          // Ignore errors when stopping
        }
      }
      if (silenceTimeoutRef.current) {
        clearTimeout(silenceTimeoutRef.current)
      }
    }
  }, []) // Remove transcript dependency

  // Handle new messages with audio
  useEffect(() => {
    // Don't process any messages until we're initialized
    if (!isInitializedRef.current) {
      console.log('[Voice] Not initialized yet, skipping message processing')
      return
    }
    
    console.log('[Voice] Audio check - Total messages:', messages.length)
    const lastMessage = messages[messages.length - 1]
    
    if (lastMessage) {
      console.log('[Voice] Last message:', { 
        id: lastMessage.id, 
        role: lastMessage.role, 
        metadata: lastMessage.metadata,
        processed: processedMessageIdsRef.current.has(lastMessage.id)
      })
    }
    
    if (lastMessage?.role === 'assistant' && !processedMessageIdsRef.current.has(lastMessage.id)) {
      // Mark this message as processed immediately
      processedMessageIdsRef.current.add(lastMessage.id)
      
      if (lastMessage.metadata) {
        // Type guard for metadata with all properties we need
        const metadata = lastMessage.metadata as { 
          audioUrl?: string; 
          voiceMode?: boolean;
          timestamp?: string;
          replyTo?: string;
        }
        console.log('[Voice] Assistant message metadata:', metadata)
        
        if (metadata.audioUrl && metadata.voiceMode) {
          console.log('[Voice] Found voice mode audio URL:', metadata.audioUrl)
          // Add to audio queue
          audioQueueRef.current.push(metadata.audioUrl)
          
          // Start playing if not already playing
          if (!isPlayingRef.current) {
            console.log('[Voice] Starting audio playback...')
            playNextAudio()
          } else {
            console.log('[Voice] Audio already playing, added to queue')
          }
        } else if (metadata.voiceMode && !metadata.audioUrl) {
          // This is a voice mode message but audio isn't ready yet
          console.log('[Voice] Voice mode message without audio URL yet, will check again...')
          
          // Set up polling for this message
          let pollCount = 0
          const pollInterval = setInterval(async () => {
            pollCount++
            console.log(`[Voice] Polling for audio URL (attempt ${pollCount}/10) for message ${lastMessage.id}`)
            
            // Fetch the message again to check if audio URL was added
            const { data: updatedMessage, error } = await supabaseClient
              .from('messages')
              .select('metadata')
              .eq('id', lastMessage.id)
              .single()
            
            if (error) {
              console.error('[Voice] Error fetching updated message:', error)
            } else if (updatedMessage?.metadata?.audioUrl) {
              console.log('[Voice] Audio URL found after polling:', updatedMessage.metadata.audioUrl)
              clearInterval(pollInterval)
              pendingAudioMessagesRef.current.delete(lastMessage.id)
              
              // Add to audio queue and play
              audioQueueRef.current.push(updatedMessage.metadata.audioUrl)
              if (!isPlayingRef.current) {
                console.log('[Voice] Starting audio playback after polling...')
                playNextAudio()
              }
            } else if (pollCount >= 10) {
              // Stop after 10 attempts (10 seconds)
              console.log('[Voice] Giving up on audio URL after 10 attempts')
              clearInterval(pollInterval)
              pendingAudioMessagesRef.current.delete(lastMessage.id)
            }
          }, 1000) // Check every second
          
          // Store the interval ID so we can clean it up if needed
          pendingAudioMessagesRef.current.set(lastMessage.id, pollInterval)
        } else {
          console.log('[Voice] No audioUrl or not voice mode')
        }
      }
    }
  }, [messages, supabaseClient])

  const playNextAudio = async () => {
    console.log('[Voice] playNextAudio called. Queue length:', audioQueueRef.current.length)
    
    if (audioQueueRef.current.length === 0) {
      isPlayingRef.current = false
      setIsSpeaking(false)
      console.log('[Voice] No more audio in queue')
      return
    }

    const audioUrl = audioQueueRef.current.shift()!
    console.log('[Voice] Playing audio:', audioUrl)
    isPlayingRef.current = true
    setIsSpeaking(true)

    try {
      // Stop any existing audio
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current = null
      }

      const audio = new Audio(audioUrl)
      audioRef.current = audio

      audio.onended = () => {
        console.log('[Voice] Audio playback ended')
        playNextAudio() // Play next in queue
      }

      audio.onerror = (e) => {
        console.error('[Voice] Audio playback error:', e)
        playNextAudio() // Skip to next
      }

      console.log('[Voice] Attempting to play audio...')
      await audio.play()
      console.log('[Voice] Audio playback started successfully')
    } catch (error) {
      console.error('[Voice] Error playing audio:', error)
      playNextAudio() // Skip to next
    }
  }

  const startListening = () => {
    console.log('[Voice] startListening called. Current state:', { isListening, isSpeaking })
    
    if (recognitionRef.current && !isListening && !isSpeaking) {
      setError(null)
      setTranscript('')
      transcriptRef.current = '' // Clear the ref
      setIsListening(true)
      isListeningRef.current = true // Update ref
      
      try {
        recognitionRef.current.start()
        console.log('[Voice] Recognition started successfully')
      } catch (error: any) {
        console.error('[Voice] Failed to start recognition:', error)
        setIsListening(false)
        isListeningRef.current = false // Update ref
        
        // Check if it's because recognition is already running
        if (error.message && error.message.includes('already started')) {
          // Try to stop and restart
          try {
            recognitionRef.current.stop()
            setTimeout(() => {
              if (recognitionRef.current) {
                recognitionRef.current.start()
                console.log('[Voice] Restarted recognition after conflict')
              }
            }, 100)
          } catch (e) {
            console.error('[Voice] Failed to restart:', e)
          }
        } else {
          setError('Failed to start voice recognition. Please try again.')
        }
      }
    } else {
      console.log('[Voice] Cannot start listening:', {
        hasRecognition: !!recognitionRef.current,
        isListening,
        isSpeaking
      })
    }
  }

  const stopListening = () => {
    console.log('[Voice] stopListening called')
    if (recognitionRef.current && isListeningRef.current) {
      // Clear silence timer and countdown
      if (silenceTimeoutRef.current) {
        clearTimeout(silenceTimeoutRef.current)
        silenceTimeoutRef.current = null
        console.log('[Voice] Cleared silence timer in stopListening')
      }
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current)
        setSilenceCountdown(null)
      }
      
      recognitionRef.current.stop()
      setIsListening(false)
      isListeningRef.current = false // Update ref
      
      // Send message if we have a transcript
      if (transcriptRef.current.trim()) {
        console.log('[Voice] Sending message with transcript:', transcriptRef.current)
        handleSendMessage(transcriptRef.current)
        transcriptRef.current = '' // Clear the ref
      }
    }
  }

  const handleSendMessage = async (text: string) => {
    console.log('[Voice] handleSendMessage called with text:', text)
    
    try {
      setIsProcessing(true)
      setTranscript('')
      setError(null)

      console.log('[Voice] Sending message with params:', { roomId, userId, content: text, voiceMode: true })
      
      const result = await sendMessage({
        roomId,
        userId,
        content: text,
        voiceMode: true, // Enable TTS
        supabaseClient: supabaseClient
      } as any) // Type assertion for now until types are updated

      console.log('[Voice] Send message result:', result)

      if (result.error) {
        console.error('[Voice] Send message error:', result.error)
        throw new Error(result.error.message || 'Failed to send message')
      }

      console.log('[Voice] Message sent successfully')
      
      // Call memory worker to process the message (same as chat-window-new.tsx)
      const MEMORY_WORKER_URL = process.env.NEXT_PUBLIC_MEMORY_WORKER_URL || 'http://localhost:3002'
      const MEMORY_WORKER_ENABLED = process.env.NEXT_PUBLIC_MEMORY_WORKER_ENABLED !== 'false'
      
      if (MEMORY_WORKER_ENABLED && result.message) {
        try {
          console.log('[Voice] Calling memory worker to process message...')
          const response = await fetch(`${MEMORY_WORKER_URL}/process-message`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              content: text,
              userId,
              roomId,
              messageId: result.message.id
            }),
          })

          if (!response.ok) {
            console.error('[Voice] Memory worker response not ok:', response.status, response.statusText)
          } else {
            console.log('[Voice] Memory worker processing initiated successfully')
          }
        } catch (memoryError) {
          console.error('[Voice] Error calling memory worker:', memoryError)
          // Don't show this error to user as the message was still sent successfully
        }
      } else {
        console.log('[Voice] Memory worker disabled or no message returned')
      }

    } catch (error) {
      console.error('[Voice] Error sending message:', error)
      setError('Failed to send message. Please try again.')
    } finally {
      setIsProcessing(false)
    }
  }

  const stopAllAudio = () => {
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current = null
    }
    audioQueueRef.current = []
    isPlayingRef.current = false
    setIsSpeaking(false)
    
    // Clear any pending polling intervals
    pendingAudioMessagesRef.current.forEach(interval => clearInterval(interval))
    pendingAudioMessagesRef.current.clear()
  }

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopAllAudio()
      if (recognitionRef.current && isListeningRef.current) {
        recognitionRef.current.stop()
      }
      if (silenceTimeoutRef.current) {
        clearTimeout(silenceTimeoutRef.current)
      }
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current)
      }
      
      // Clear any pending polling intervals
      pendingAudioMessagesRef.current.forEach(interval => clearInterval(interval))
      pendingAudioMessagesRef.current.clear()
    }
  }, [])

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
    >
      <Card className="relative w-full max-w-md bg-gray-900 border-gray-800">
        {/* Close button */}
        {onClose && (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              stopAllAudio()
              onClose()
            }}
            className="absolute top-4 right-4 text-gray-400 hover:text-white"
          >
            <X className="h-4 w-4" />
          </Button>
        )}

        <div className="p-8 space-y-6">
          {/* Maya Avatar */}
          <div className="flex justify-center">
            <motion.div
              animate={{
                scale: isSpeaking ? [1, 1.1, 1] : 1,
              }}
              transition={{
                duration: 1,
                repeat: isSpeaking ? Infinity : 0,
                repeatType: "loop"
              }}
              className="relative"
            >
              <div className={cn(
                "w-32 h-32 rounded-full overflow-hidden ring-4 transition-all",
                isSpeaking ? "ring-purple-500/50" : "ring-gray-700",
                isListening ? "ring-blue-500/50" : ""
              )}>
                {mayaAvatar ? (
                  <Image
                    src={mayaAvatar}
                    alt="Maya"
                    width={128}
                    height={128}
                    className="w-full h-full object-cover"
                    unoptimized
                  />
                ) : (
                  <div className="w-32 h-32 rounded-full bg-purple-600 flex items-center justify-center text-white text-4xl font-bold">
                    M
                  </div>
                )}
              </div>
              
              {/* Status indicator */}
              <motion.div
                animate={{
                  scale: isSpeaking || isListening ? [0.8, 1.2, 0.8] : 1,
                  opacity: isSpeaking || isListening ? [0.5, 1, 0.5] : 0
                }}
                transition={{
                  duration: 2,
                  repeat: Infinity,
                  repeatType: "loop"
                }}
                className={cn(
                  "absolute -bottom-2 -right-2 w-6 h-6 rounded-full",
                  isSpeaking ? "bg-purple-500" : "",
                  isListening ? "bg-blue-500" : ""
                )}
              />
            </motion.div>
          </div>

          {/* Status Text */}
          <div className="text-center space-y-2">
            <h3 className="text-xl font-semibold text-white">
              {isListening ? "Listening..." : 
               isSpeaking ? "Maya is speaking..." : 
               isProcessing ? "Processing..." : 
               "Talk to Maya"}
            </h3>
            
            {transcript && (
              <motion.p
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-sm text-gray-400"
              >
                "{transcript}"
              </motion.p>
            )}
            
            {silenceCountdown !== null && (
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-xs text-gray-500"
              >
                Sending in {silenceCountdown}...
              </motion.p>
            )}

            {error && (
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-sm text-red-400"
              >
                {error}
              </motion.p>
            )}
          </div>

          {/* Microphone Button */}
          <div className="flex justify-center">
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                console.log('[Voice] Microphone button clicked. isListening:', isListening)
                
                if (isListening) {
                  stopListening()
                } else {
                  startListening()
                }
              }}
              onMouseDown={(e) => e.preventDefault()} // Prevent focus issues
              disabled={isSpeaking || isProcessing}
              className={cn(
                "relative w-20 h-20 rounded-full flex items-center justify-center transition-all",
                "focus:outline-none focus:ring-4 focus:ring-offset-2 focus:ring-offset-gray-900",
                isListening 
                  ? "bg-red-500 hover:bg-red-600 focus:ring-red-500" 
                  : "bg-blue-500 hover:bg-blue-600 focus:ring-blue-500",
                (isSpeaking || isProcessing) && "opacity-50 cursor-not-allowed"
              )}
            >
              {isListening ? (
                <MicOff className="h-8 w-8 text-white" />
              ) : (
                <Mic className="h-8 w-8 text-white" />
              )}
              
              {/* Pulse animation when listening */}
              {isListening && (
                <motion.span
                  animate={{
                    scale: [1, 1.5, 2],
                    opacity: [0.5, 0.3, 0]
                  }}
                  transition={{
                    duration: 1.5,
                    repeat: Infinity,
                    repeatType: "loop"
                  }}
                  className="absolute inset-0 rounded-full bg-red-500"
                />
              )}
            </motion.button>
          </div>

          {/* Instructions */}
          <p className="text-xs text-center text-gray-500">
            {isListening 
              ? "Speak naturally - I'll wait for a pause before sending" 
              : "Click and speak your message"}
          </p>
        </div>
      </Card>
    </motion.div>
  )
} 