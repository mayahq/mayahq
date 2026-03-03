export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      messages: {
        Row: {
          id: string
          user_id: string
          content: string
          created_at: string
          room_id: string
          role: 'user' | 'assistant' | 'system'
          metadata?: Json | null
        }
      }
      rooms: {
        Row: {
          id: string
          name: string
          created_at: string
          user_id: string
          last_message_at: string | null
        }
      }
      maya_memories: {
        Row: {
          id: number
          content: string
          metadata: Json
          embedding: unknown // vector type
          created_at: string | null
          importance: number | null
          expires_at: string | null
          modality: 'text' | 'image' | 'audio' | 'sensor' | null
          embedding_model: string | null
          embedding_ver: string | null
          tags: string[] | null
        }
      }
      daily_reports: {
        Row: {
          id: string | number
          user_id: string
          created_at: string
          report_text: string | null
          content: string | null
          delivered: boolean
          delivered_at: string | null
          delivery_method: string | null
          analytics: Json | null
          report_date: string | null
          generated_at: string | null
          read_at: string | null
          source: string | null
          tags: string[] | null
          metadata: Json | null
        }
      }
      tasks: {
        Row: {
          id: number
          user_id: string
          content: string
          status: string | null
          tags: string[] | null
          created_at: string | null
          completed_at: string | null
          due_at: string | null
          note: string | null
          priority: string | null
          reminder_sent: boolean | null
        }
      }
    }
  }
}

export type Message = Database['public']['Tables']['messages']['Row']
export type Room = Database['public']['Tables']['rooms']['Row']
export type Memory = Database['public']['Tables']['maya_memories']['Row']
export type Task = Database['public']['Tables']['tasks']['Row']
export type DailyReport = Database['public']['Tables']['daily_reports']['Row'] 