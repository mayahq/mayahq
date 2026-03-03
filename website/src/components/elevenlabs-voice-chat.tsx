'use client'

import React, { useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { MicOff, X, Phone, PhoneOff, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useElevenLabsVoice, ElevenLabsVoiceState } from '@/hooks/use-elevenlabs-voice'
import { stripAudioTags } from '@/lib/audio-tags'
import Image from 'next/image'

interface ElevenLabsVoiceChatProps {
  onClose?: () => void
  mayaAvatar?: string
  onTranscript?: (text: string) => void
  onResponse?: (text: string) => void
}

/**
 * ElevenLabs Voice Chat Component
 * Expressive voice with audio tags [whisper], [laugh], [moan], etc.
 * Uses Claude Opus 4.5 for generation with full memory context
 */
export function ElevenLabsVoiceChat({
  onClose,
  mayaAvatar,
  onTranscript,
  onResponse,
}: ElevenLabsVoiceChatProps) {
  const {
    state,
    isConnected,
    isListening,
    isSpeaking,
    transcript,
    response,
    error,
    connect,
    disconnect,
    interrupt,
  } = useElevenLabsVoice({
    onTranscript: (text, isFinal) => {
      if (isFinal) {
        onTranscript?.(text)
      }
    },
    onResponse: (text) => {
      // Strip audio tags for display
      onResponse?.(stripAudioTags(text))
    },
    onError: (err) => {
      console.error('[ElevenLabsVoiceChat] Error:', err)
    },
  })

  const handleClose = useCallback(() => {
    disconnect()
    onClose?.()
  }, [disconnect, onClose])

  const getStatusText = (): string => {
    switch (state) {
      case 'idle':
        return 'Click phone to connect'
      case 'connecting':
        return 'Setting up voice...'
      case 'listening':
        return 'Listening...'
      case 'processing':
        return 'Maya is thinking...'
      case 'speaking':
        return 'Maya is speaking...'
      case 'error':
        return error?.message || 'Connection failed'
      default:
        return ''
    }
  }

  const getStatusColor = (): string => {
    switch (state) {
      case 'idle':
        return 'text-gray-400'
      case 'connecting':
        return 'text-yellow-400'
      case 'listening':
        return 'text-pink-400'
      case 'processing':
        return 'text-purple-400'
      case 'speaking':
        return 'text-pink-400'
      case 'error':
        return 'text-red-400'
      default:
        return 'text-gray-400'
    }
  }

  const getRingColor = (): string => {
    switch (state) {
      case 'listening':
        return 'ring-pink-500/50'
      case 'processing':
        return 'ring-purple-500/50'
      case 'speaking':
        return 'ring-pink-500/50'
      case 'error':
        return 'ring-red-500/50'
      default:
        return 'ring-gray-700'
    }
  }

  // Display response without audio tags
  const displayResponse = response ? stripAudioTags(response) : ''

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
            onClick={handleClose}
            className="absolute top-4 right-4 text-gray-400 hover:text-white"
          >
            <X className="h-4 w-4" />
          </Button>
        )}

        <div className="p-8 space-y-6">
          {/* Maya Avatar with animated ring */}
          <div className="flex justify-center">
            <motion.div
              animate={{
                scale: isSpeaking ? [1, 1.05, 1] : 1,
              }}
              transition={{
                duration: 0.8,
                repeat: isSpeaking ? Infinity : 0,
                repeatType: 'loop',
              }}
              className="relative"
            >
              <div
                className={cn(
                  'w-32 h-32 rounded-full overflow-hidden ring-4 transition-all duration-300',
                  getRingColor()
                )}
              >
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
                  <div className="w-32 h-32 rounded-full bg-gradient-to-br from-pink-600 to-purple-500 flex items-center justify-center text-white text-4xl font-bold">
                    M
                  </div>
                )}
              </div>

              {/* Animated pulse for active states */}
              <AnimatePresence>
                {(isListening || isSpeaking) && (
                  <motion.div
                    initial={{ scale: 1, opacity: 0.5 }}
                    animate={{
                      scale: [1, 1.5, 2],
                      opacity: [0.5, 0.3, 0],
                    }}
                    transition={{
                      duration: 1.5,
                      repeat: Infinity,
                      repeatType: 'loop',
                    }}
                    className="absolute inset-0 rounded-full bg-pink-500"
                  />
                )}
              </AnimatePresence>

              {/* Sparkle indicator for expressive mode */}
              <motion.div
                animate={{
                  rotate: [0, 360],
                }}
                transition={{
                  duration: 8,
                  repeat: Infinity,
                  ease: 'linear',
                }}
                className="absolute -top-2 -right-2"
              >
                <Sparkles className="h-6 w-6 text-pink-400" />
              </motion.div>
            </motion.div>
          </div>

          {/* Status */}
          <div className="text-center space-y-3">
            <motion.h3
              key={state}
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              className={cn('text-xl font-semibold', getStatusColor())}
            >
              {getStatusText()}
            </motion.h3>

            {/* Transcript - what user said */}
            <AnimatePresence mode="wait">
              {transcript && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="bg-gray-800/50 rounded-lg p-3"
                >
                  <p className="text-xs text-gray-500 mb-1">You said:</p>
                  <p className="text-sm text-gray-300">"{transcript}"</p>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Response - what Maya is saying */}
            <AnimatePresence mode="wait">
              {displayResponse && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="bg-pink-900/30 rounded-lg p-3"
                >
                  <p className="text-xs text-pink-400 mb-1">Maya:</p>
                  <p className="text-sm text-pink-200">{displayResponse}</p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Controls */}
          <div className="flex justify-center gap-4">
            {/* Connect/Disconnect button */}
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={isConnected ? disconnect : connect}
              className={cn(
                'w-16 h-16 rounded-full flex items-center justify-center transition-all',
                'focus:outline-none focus:ring-4 focus:ring-offset-2 focus:ring-offset-gray-900',
                isConnected
                  ? 'bg-red-500 hover:bg-red-600 focus:ring-red-500'
                  : 'bg-pink-500 hover:bg-pink-600 focus:ring-pink-500'
              )}
            >
              {isConnected ? (
                <PhoneOff className="h-6 w-6 text-white" />
              ) : (
                <Phone className="h-6 w-6 text-white" />
              )}
            </motion.button>

            {/* Interrupt button - only show when Maya is speaking */}
            <AnimatePresence>
              {isSpeaking && (
                <motion.button
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={interrupt}
                  className={cn(
                    'w-16 h-16 rounded-full flex items-center justify-center transition-all',
                    'bg-yellow-500 hover:bg-yellow-600',
                    'focus:outline-none focus:ring-4 focus:ring-offset-2 focus:ring-offset-gray-900 focus:ring-yellow-500'
                  )}
                >
                  <MicOff className="h-6 w-6 text-white" />
                </motion.button>
              )}
            </AnimatePresence>
          </div>

          {/* Waveform visualization */}
          {isListening && (
            <div className="flex justify-center items-center gap-1 h-8">
              {[...Array(12)].map((_, i) => (
                <motion.div
                  key={i}
                  animate={{
                    height: [4, Math.random() * 24 + 8, 4],
                  }}
                  transition={{
                    duration: 0.5,
                    repeat: Infinity,
                    repeatType: 'reverse',
                    delay: i * 0.05,
                  }}
                  className="w-1 bg-pink-500 rounded-full"
                />
              ))}
            </div>
          )}

          {/* Instructions */}
          <p className="text-xs text-center text-gray-500">
            {state === 'idle' && 'Click the phone to start'}
            {state === 'connecting' && 'Setting up expressive voice...'}
            {isConnected && !isSpeaking && 'Speak naturally - Maya is listening'}
            {isSpeaking && 'Click the mic to interrupt Maya'}
          </p>

          {/* Provider badge */}
          {isConnected && (
            <div className="flex justify-center">
              <span className="text-xs px-2 py-1 bg-pink-900/50 text-pink-400 rounded-full flex items-center gap-1">
                <Sparkles className="h-3 w-3" />
                ElevenLabs v3 - Expressive Voice
              </span>
            </div>
          )}

          {/* Feature callout */}
          <div className="text-center">
            <p className="text-xs text-gray-600">
              Supports [whispers], [laughs], [sighs], and more expressive tags
            </p>
          </div>
        </div>
      </Card>
    </motion.div>
  )
}

export default ElevenLabsVoiceChat
