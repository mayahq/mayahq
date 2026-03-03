'use client'

import React, { useState, useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Mic, MicOff, Volume2, VolumeX } from 'lucide-react'
import { cn } from '@/lib/utils'

interface VoiceModeToggleProps {
  onVoiceModeChange: (enabled: boolean) => void
  onTranscript: (text: string) => void
  onSendVoiceMessage: () => void
  className?: string
}

// Web Speech API types
declare global {
  interface Window {
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
  }
}

export function VoiceModeToggle({ 
  onVoiceModeChange, 
  onTranscript, 
  onSendVoiceMessage,
  className 
}: VoiceModeToggleProps) {
  const [voiceMode, setVoiceMode] = useState(false)
  const [isListening, setIsListening] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [isSupported, setIsSupported] = useState(true)
  const recognitionRef = useRef<any>(null)

  useEffect(() => {
    // Check for browser support
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SpeechRecognition) {
      setIsSupported(false)
      return
    }

    // Initialize speech recognition
    const recognition = new SpeechRecognition()
    recognition.continuous = false
    recognition.interimResults = true
    recognition.lang = 'en-US'

    recognition.onresult = (event: any) => {
      const transcript = Array.from(event.results)
        .map((result: any) => result[0])
        .map((result: any) => result.transcript)
        .join('')
      
      setTranscript(transcript)
      onTranscript(transcript)
    }

    recognition.onerror = (event: any) => {
      console.error('Speech recognition error:', event.error)
      setIsListening(false)
    }

    recognition.onend = () => {
      setIsListening(false)
      if (transcript.trim()) {
        onSendVoiceMessage()
        setTranscript('')
      }
    }

    recognitionRef.current = recognition
  }, [onTranscript, onSendVoiceMessage, transcript])

  const toggleVoiceMode = () => {
    const newMode = !voiceMode
    setVoiceMode(newMode)
    onVoiceModeChange(newMode)
    
    if (!newMode && isListening) {
      stopListening()
    }
  }

  const startListening = () => {
    if (recognitionRef.current && !isListening && voiceMode) {
      recognitionRef.current.start()
      setIsListening(true)
      setTranscript('')
    }
  }

  const stopListening = () => {
    if (recognitionRef.current && isListening) {
      recognitionRef.current.stop()
      setIsListening(false)
    }
  }

  if (!isSupported) {
    return (
      <div className="text-xs text-gray-500">
        Voice mode not supported in your browser
      </div>
    )
  }

  return (
    <div className={cn("flex items-center gap-2", className)}>
      {/* Voice Mode Toggle */}
      <Button
        type="button"
        size="sm"
        variant={voiceMode ? "default" : "ghost"}
        onClick={toggleVoiceMode}
        className={cn(
          "transition-all",
          voiceMode ? "bg-purple-600 hover:bg-purple-700" : ""
        )}
      >
        {voiceMode ? (
          <>
            <Volume2 className="h-4 w-4 mr-1" />
            Voice On
          </>
        ) : (
          <>
            <VolumeX className="h-4 w-4 mr-1" />
            Voice Off
          </>
        )}
      </Button>

      {/* Voice Input Button - Only show when voice mode is on */}
      {voiceMode && (
        <Button
          type="button"
          size="icon"
          variant={isListening ? "destructive" : "secondary"}
          onClick={isListening ? stopListening : startListening}
          className={cn(
            "transition-all",
            isListening && "animate-pulse"
          )}
        >
          {isListening ? (
            <MicOff className="h-4 w-4" />
          ) : (
            <Mic className="h-4 w-4" />
          )}
        </Button>
      )}

      {/* Transcript Display */}
      {voiceMode && transcript && (
        <div className="text-sm text-gray-400 max-w-[200px] truncate">
          {transcript}
        </div>
      )}
    </div>
  )
} 