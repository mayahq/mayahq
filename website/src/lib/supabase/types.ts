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
      ideas: {
        Row: {
          id: string
          content: string
          metadata: {
            priority: number
            status: string
            tags: string[]
          }
          created_at: string | null
          user_id: string | null
        }
        Insert: {
          id?: string
          content: string
          metadata?: Json
          created_at?: string | null
          user_id?: string | null
        }
        Update: {
          id?: string
          content?: string
          metadata?: Json
          created_at?: string | null
          user_id?: string | null
        }
      }
      daily_reports: {
        Row: {
          id: string
          user_id: string
          created_at: string
          report_text: string
          delivered: boolean
          delivered_at: string | null
          delivery_method: string | null
          analytics: Json | null
        }
        Insert: {
          id?: string
          user_id: string
          created_at?: string
          report_text: string
          delivered?: boolean
          delivered_at?: string | null
          delivery_method?: string | null
          analytics?: Json | null
        }
        Update: {
          id?: string
          user_id?: string
          created_at?: string
          report_text?: string
          delivered?: boolean
          delivered_at?: string | null
          delivery_method?: string | null
          analytics?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "daily_reports_user_id_fkey"
            columns: ["user_id"]
            referencedRelation: "users"
            referencedColumns: ["id"]
          }
        ]
      }
    }
  }
}

export type Tables<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Row'] 