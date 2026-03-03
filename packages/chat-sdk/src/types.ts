import type { Message as SupabaseMessage, Room as SupabaseRoom } from '@mayahq/supabase-client'
import { SupabaseClient } from '@supabase/supabase-js'

// Re-export types from supabase client
export type { Message as SupabaseMessage, Room as SupabaseRoom } from '@mayahq/supabase-client'

/**
 * Extended Message type with UI state
 */
export interface Message extends SupabaseMessage {
  isPending?: boolean
  isError?: boolean
  localId?: string
  mediaUrl?: string
  mediaType?: 'image' | 'audio' | 'video'
  mediaStatus?: 'uploading' | 'uploaded' | 'error'
  voiceMode?: boolean // Indicates if this message is part of a voice conversation
  audioUrl?: string // URL to the TTS audio file for assistant messages
}

/**
 * Extended Room type with UI state
 */
export interface Room extends SupabaseRoom {
  unreadCount?: number
  lastMessage?: Message
  isActive?: boolean
}

/**
 * Media attachment for messages
 */
export interface MessageMedia {
  uri: string
  type: 'image' | 'audio' | 'video'
  name?: string
  size?: number
  duration?: number // for audio/video in seconds
}

/**
 * Send message options
 */
export interface SendMessageOptions {
  imageFile?: File | null
  roomId: string
  userId: string
  content: string
  role?: 'user' | 'assistant'
  voiceMode?: boolean
  supabaseClient?: SupabaseClient
}

/**
 * Response from sending a message
 */
export interface SendMessageResponse {
  message: Message
  uploadUrl?: string // If media is included, a signed upload URL will be returned
  error?: Error
} 