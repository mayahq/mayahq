import { Json } from './database-types'

export interface Message {
  id: string
  room_id: string
  content: string
  user_id: string
  role: 'user' | 'assistant' | 'system'
  created_at: string
  metadata: Record<string, Json> | null
} 