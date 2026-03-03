'use client'

import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Zap, Sparkles, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { XaiVoiceChat } from './xai-voice-chat'
import { ElevenLabsVoiceChat } from './elevenlabs-voice-chat'

export type VoiceProvider = 'xai' | 'elevenlabs'

interface VoiceChatProps {
  onClose?: () => void
  mayaAvatar?: string
  onTranscript?: (text: string) => void
  onResponse?: (text: string) => void
  defaultProvider?: VoiceProvider
}

/**
 * Combined Voice Chat Component
 * Allows switching between xAI Grok (fast) and ElevenLabs (expressive)
 */
export function VoiceChat({
  onClose,
  mayaAvatar,
  onTranscript,
  onResponse,
  defaultProvider = 'xai',
}: VoiceChatProps) {
  const [provider, setProvider] = useState<VoiceProvider>(defaultProvider)
  const [showSelector, setShowSelector] = useState(true)

  const handleSelectProvider = (selected: VoiceProvider) => {
    setProvider(selected)
    setShowSelector(false)
  }

  const handleBack = () => {
    setShowSelector(true)
  }

  // Show provider selector first
  if (showSelector) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
      >
        <Card className="relative w-full max-w-md bg-gray-900 border-gray-800 p-8">
          {/* Close button */}
          {onClose && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="absolute top-4 right-4 text-gray-400 hover:text-white"
            >
              <X className="h-4 w-4" />
            </Button>
          )}

          <div className="space-y-6">
            <div className="text-center">
              <h2 className="text-2xl font-bold text-white mb-2">Voice Mode</h2>
              <p className="text-gray-400">Choose your voice experience</p>
            </div>

            <div className="grid gap-4">
              {/* xAI Grok Option */}
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => handleSelectProvider('xai')}
                className={cn(
                  'p-6 rounded-xl border-2 text-left transition-all',
                  'hover:border-blue-500/50 hover:bg-blue-900/20',
                  'border-gray-700 bg-gray-800/50'
                )}
              >
                <div className="flex items-start gap-4">
                  <div className="p-3 rounded-lg bg-blue-500/20">
                    <Zap className="h-6 w-6 text-blue-400" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                      xAI Grok Voice
                      <span className="text-xs px-2 py-0.5 bg-blue-500/20 text-blue-400 rounded-full">
                        Fast
                      </span>
                    </h3>
                    <p className="text-sm text-gray-400 mt-1">
                      Ultra-low latency (&lt;1s). Best for quick back-and-forth conversations.
                    </p>
                    <div className="flex flex-wrap gap-2 mt-3">
                      <span className="text-xs px-2 py-1 bg-gray-700 text-gray-300 rounded">
                        ~0.8s latency
                      </span>
                      <span className="text-xs px-2 py-1 bg-gray-700 text-gray-300 rounded">
                        Built-in LLM
                      </span>
                    </div>
                  </div>
                </div>
              </motion.button>

              {/* ElevenLabs Option */}
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => handleSelectProvider('elevenlabs')}
                className={cn(
                  'p-6 rounded-xl border-2 text-left transition-all',
                  'hover:border-pink-500/50 hover:bg-pink-900/20',
                  'border-gray-700 bg-gray-800/50'
                )}
              >
                <div className="flex items-start gap-4">
                  <div className="p-3 rounded-lg bg-pink-500/20">
                    <Sparkles className="h-6 w-6 text-pink-400" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                      ElevenLabs + Claude
                      <span className="text-xs px-2 py-0.5 bg-pink-500/20 text-pink-400 rounded-full">
                        Expressive
                      </span>
                    </h3>
                    <p className="text-sm text-gray-400 mt-1">
                      Emotional voice with audio tags. Best for intimate/expressive moments.
                    </p>
                    <div className="flex flex-wrap gap-2 mt-3">
                      <span className="text-xs px-2 py-1 bg-gray-700 text-gray-300 rounded">
                        Claude Opus 4.5
                      </span>
                      <span className="text-xs px-2 py-1 bg-gray-700 text-gray-300 rounded">
                        Full memory
                      </span>
                      <span className="text-xs px-2 py-1 bg-pink-900/50 text-pink-300 rounded">
                        [whispers] [laughs] [moans]
                      </span>
                    </div>
                  </div>
                </div>
              </motion.button>
            </div>

            <p className="text-xs text-center text-gray-500">
              Both modes save conversations to Maya's memory
            </p>
          </div>
        </Card>
      </motion.div>
    )
  }

  // Render selected provider's voice chat
  return (
    <AnimatePresence mode="wait">
      {provider === 'xai' ? (
        <XaiVoiceChat
          key="xai"
          onClose={onClose}
          mayaAvatar={mayaAvatar}
          onTranscript={onTranscript}
          onResponse={onResponse}
        />
      ) : (
        <ElevenLabsVoiceChat
          key="elevenlabs"
          onClose={onClose}
          mayaAvatar={mayaAvatar}
          onTranscript={onTranscript}
          onResponse={onResponse}
        />
      )}
    </AnimatePresence>
  )
}

export default VoiceChat
