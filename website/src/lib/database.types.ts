export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "12.2.3 (519615d)"
  }
  public: {
    Tables: {
      autonomy_log: {
        Row: {
          action_type: string
          content: string
          created_at: string | null
          id: number
          task_id: number | null
          user_id: string
        }
        Insert: {
          action_type: string
          content: string
          created_at?: string | null
          id?: number
          task_id?: number | null
          user_id: string
        }
        Update: {
          action_type?: string
          content?: string
          created_at?: string | null
          id?: number
          task_id?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "autonomy_log_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      calendar_event_reminders: {
        Row: {
          created_at: string | null
          event_id: string
          id: string
          minutes_before: number
          reminder_type: string
          sent: boolean | null
        }
        Insert: {
          created_at?: string | null
          event_id: string
          id?: string
          minutes_before: number
          reminder_type: string
          sent?: boolean | null
        }
        Update: {
          created_at?: string | null
          event_id?: string
          id?: string
          minutes_before?: number
          reminder_type?: string
          sent?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "calendar_event_reminders_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "calendar_events"
            referencedColumns: ["id"]
          },
        ]
      }
      calendar_events: {
        Row: {
          ai_generated: boolean | null
          ai_source_system: string | null
          all_day: boolean | null
          created_at: string | null
          created_by: string | null
          description: string | null
          end_time: string
          energy_level: string | null
          id: string
          is_exception: boolean | null
          location: string | null
          mood: string | null
          priority: number | null
          recurrence_id: string | null
          recurrence_rule: string | null
          start_time: string
          tags: string[] | null
          timezone: string | null
          title: string
          updated_at: string | null
          workflow_hooks: Json | null
        }
        Insert: {
          ai_generated?: boolean | null
          ai_source_system?: string | null
          all_day?: boolean | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          end_time: string
          energy_level?: string | null
          id?: string
          is_exception?: boolean | null
          location?: string | null
          mood?: string | null
          priority?: number | null
          recurrence_id?: string | null
          recurrence_rule?: string | null
          start_time: string
          tags?: string[] | null
          timezone?: string | null
          title: string
          updated_at?: string | null
          workflow_hooks?: Json | null
        }
        Update: {
          ai_generated?: boolean | null
          ai_source_system?: string | null
          all_day?: boolean | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          end_time?: string
          energy_level?: string | null
          id?: string
          is_exception?: boolean | null
          location?: string | null
          mood?: string | null
          priority?: number | null
          recurrence_id?: string | null
          recurrence_rule?: string | null
          start_time?: string
          tags?: string[] | null
          timezone?: string | null
          title?: string
          updated_at?: string | null
          workflow_hooks?: Json | null
        }
        Relationships: []
      }
      calendar_ics_tokens: {
        Row: {
          active: boolean | null
          created_at: string | null
          id: string
          last_accessed: string | null
          name: string
          token: string
          user_id: string
        }
        Insert: {
          active?: boolean | null
          created_at?: string | null
          id?: string
          last_accessed?: string | null
          name: string
          token: string
          user_id: string
        }
        Update: {
          active?: boolean | null
          created_at?: string | null
          id?: string
          last_accessed?: string | null
          name?: string
          token?: string
          user_id?: string
        }
        Relationships: []
      }
      comfyui_generated: {
        Row: {
          comfyui_prompt: string | null
          comfyui_workflow_id: string | null
          content_hash: string | null
          created_at: string
          dimensions: string | null
          feed_item_id: string | null
          file_size_bytes: number | null
          generated_at: string | null
          id: string
          image_filename: string
          image_s3_key: string
          image_url: string
          metadata: Json
          model_used: string | null
          nsfw_safe: boolean | null
          reviewed_at: string | null
          reviewed_by_user_id: string | null
          s3_uploaded_at: string | null
          status: string | null
          style: string | null
          updated_at: string
        }
        Insert: {
          comfyui_prompt?: string | null
          comfyui_workflow_id?: string | null
          content_hash?: string | null
          created_at?: string
          dimensions?: string | null
          feed_item_id?: string | null
          file_size_bytes?: number | null
          generated_at?: string | null
          id?: string
          image_filename: string
          image_s3_key: string
          image_url: string
          metadata?: Json
          model_used?: string | null
          nsfw_safe?: boolean | null
          reviewed_at?: string | null
          reviewed_by_user_id?: string | null
          s3_uploaded_at?: string | null
          status?: string | null
          style?: string | null
          updated_at?: string
        }
        Update: {
          comfyui_prompt?: string | null
          comfyui_workflow_id?: string | null
          content_hash?: string | null
          created_at?: string
          dimensions?: string | null
          feed_item_id?: string | null
          file_size_bytes?: number | null
          generated_at?: string | null
          id?: string
          image_filename?: string
          image_s3_key?: string
          image_url?: string
          metadata?: Json
          model_used?: string | null
          nsfw_safe?: boolean | null
          reviewed_at?: string | null
          reviewed_by_user_id?: string | null
          s3_uploaded_at?: string | null
          status?: string | null
          style?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "comfyui_generated_feed_item_id_fkey"
            columns: ["feed_item_id"]
            isOneToOne: false
            referencedRelation: "feed_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comfyui_generated_feed_item_id_fkey"
            columns: ["feed_item_id"]
            isOneToOne: false
            referencedRelation: "feed_items_with_elements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comfyui_generated_feed_item_id_fkey"
            columns: ["feed_item_id"]
            isOneToOne: false
            referencedRelation: "feed_items_with_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      content_posts: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          caption: string | null
          caption_template: string | null
          created_at: string | null
          id: string
          media_url: string | null
          source_id: string | null
          source_type: string | null
          source_url: string | null
          status: string | null
          tags: string[] | null
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          caption?: string | null
          caption_template?: string | null
          created_at?: string | null
          id?: string
          media_url?: string | null
          source_id?: string | null
          source_type?: string | null
          source_url?: string | null
          status?: string | null
          tags?: string[] | null
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          caption?: string | null
          caption_template?: string | null
          created_at?: string | null
          id?: string
          media_url?: string | null
          source_id?: string | null
          source_type?: string | null
          source_url?: string | null
          status?: string | null
          tags?: string[] | null
        }
        Relationships: []
      }
      content_usage: {
        Row: {
          content_post_id: string
          platform: string
          used_at: string | null
        }
        Insert: {
          content_post_id: string
          platform: string
          used_at?: string | null
        }
        Update: {
          content_post_id?: string
          platform?: string
          used_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "content_usage_content_post_id_fkey"
            columns: ["content_post_id"]
            isOneToOne: false
            referencedRelation: "content_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      cron_executions: {
        Row: {
          completed_at: string | null
          created_at: string | null
          cron_job_id: string | null
          duration_ms: number | null
          error_message: string | null
          id: string
          openclaw_id: string | null
          output: Json | null
          session_id: string | null
          started_at: string
          status: string
          summary: string | null
          triggered_by: string | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string | null
          cron_job_id?: string | null
          duration_ms?: number | null
          error_message?: string | null
          id?: string
          openclaw_id?: string | null
          output?: Json | null
          session_id?: string | null
          started_at: string
          status: string
          summary?: string | null
          triggered_by?: string | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string | null
          cron_job_id?: string | null
          duration_ms?: number | null
          error_message?: string | null
          id?: string
          openclaw_id?: string | null
          output?: Json | null
          session_id?: string | null
          started_at?: string
          status?: string
          summary?: string | null
          triggered_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cron_executions_cron_job_id_fkey"
            columns: ["cron_job_id"]
            isOneToOne: false
            referencedRelation: "cron_activity"
            referencedColumns: ["cron_job_id"]
          },
          {
            foreignKeyName: "cron_executions_cron_job_id_fkey"
            columns: ["cron_job_id"]
            isOneToOne: false
            referencedRelation: "cron_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      cron_jobs: {
        Row: {
          category: string | null
          created_at: string | null
          discord_channel_id: string | null
          discord_channel_name: string | null
          enabled: boolean | null
          id: string
          last_synced_at: string | null
          name: string
          notes: string | null
          openclaw_id: string
          payload: Json | null
          platform: string | null
          schedule: string | null
          updated_at: string | null
        }
        Insert: {
          category?: string | null
          created_at?: string | null
          discord_channel_id?: string | null
          discord_channel_name?: string | null
          enabled?: boolean | null
          id?: string
          last_synced_at?: string | null
          name: string
          notes?: string | null
          openclaw_id: string
          payload?: Json | null
          platform?: string | null
          schedule?: string | null
          updated_at?: string | null
        }
        Update: {
          category?: string | null
          created_at?: string | null
          discord_channel_id?: string | null
          discord_channel_name?: string | null
          enabled?: boolean | null
          id?: string
          last_synced_at?: string | null
          name?: string
          notes?: string | null
          openclaw_id?: string
          payload?: Json | null
          platform?: string | null
          schedule?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      cron_runs: {
        Row: {
          duration_ms: number | null
          error_message: string | null
          id: string
          job_name: string
          output_summary: string | null
          run_at: string | null
          session_key: string | null
          status: string | null
          tasks_completed: number | null
          tasks_created: number | null
        }
        Insert: {
          duration_ms?: number | null
          error_message?: string | null
          id?: string
          job_name: string
          output_summary?: string | null
          run_at?: string | null
          session_key?: string | null
          status?: string | null
          tasks_completed?: number | null
          tasks_created?: number | null
        }
        Update: {
          duration_ms?: number | null
          error_message?: string | null
          id?: string
          job_name?: string
          output_summary?: string | null
          run_at?: string | null
          session_key?: string | null
          status?: string | null
          tasks_completed?: number | null
          tasks_created?: number | null
        }
        Relationships: []
      }
      daily_reports: {
        Row: {
          content: string
          created_at: string | null
          delivered: boolean | null
          delivered_at: string | null
          delivery_method: string | null
          generated_at: string | null
          id: number
          metadata: Json | null
          read_at: string | null
          report_date: string
          report_text: string | null
          source: string | null
          tags: string[] | null
          user_id: string | null
        }
        Insert: {
          content: string
          created_at?: string | null
          delivered?: boolean | null
          delivered_at?: string | null
          delivery_method?: string | null
          generated_at?: string | null
          id?: number
          metadata?: Json | null
          read_at?: string | null
          report_date: string
          report_text?: string | null
          source?: string | null
          tags?: string[] | null
          user_id?: string | null
        }
        Update: {
          content?: string
          created_at?: string | null
          delivered?: boolean | null
          delivered_at?: string | null
          delivery_method?: string | null
          generated_at?: string | null
          id?: number
          metadata?: Json | null
          read_at?: string | null
          report_date?: string
          report_text?: string | null
          source?: string | null
          tags?: string[] | null
          user_id?: string | null
        }
        Relationships: []
      }
      daily_sweeps: {
        Row: {
          action_items: Json | null
          cost: number | null
          created_at: string | null
          duration_seconds: number | null
          health_score: string | null
          id: string
          metrics: Json | null
          report: string | null
          summary: string | null
          sweep_date: string
          turns: number | null
        }
        Insert: {
          action_items?: Json | null
          cost?: number | null
          created_at?: string | null
          duration_seconds?: number | null
          health_score?: string | null
          id?: string
          metrics?: Json | null
          report?: string | null
          summary?: string | null
          sweep_date: string
          turns?: number | null
        }
        Update: {
          action_items?: Json | null
          cost?: number | null
          created_at?: string | null
          duration_seconds?: number | null
          health_score?: string | null
          id?: string
          metrics?: Json | null
          report?: string | null
          summary?: string | null
          sweep_date?: string
          turns?: number | null
        }
        Relationships: []
      }
      data_sources: {
        Row: {
          active: boolean | null
          config: Json
          created_at: string | null
          id: string
          name: string
          type: string
          updated_at: string | null
        }
        Insert: {
          active?: boolean | null
          config?: Json
          created_at?: string | null
          id?: string
          name: string
          type: string
          updated_at?: string | null
        }
        Update: {
          active?: boolean | null
          config?: Json
          created_at?: string | null
          id?: string
          name?: string
          type?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      digest_posts: {
        Row: {
          approved_at: string | null
          created_at: string | null
          id: string
          image_prompt: string | null
          image_url: string | null
          linkedin_content: string | null
          linkedin_post_id: string | null
          posted_at: string | null
          run_id: string | null
          source_context: Json | null
          source_urls: string[] | null
          status: string
          tags: string[] | null
          topic: string
          x_content: string | null
          x_post_id: string | null
        }
        Insert: {
          approved_at?: string | null
          created_at?: string | null
          id?: string
          image_prompt?: string | null
          image_url?: string | null
          linkedin_content?: string | null
          linkedin_post_id?: string | null
          posted_at?: string | null
          run_id?: string | null
          source_context?: Json | null
          source_urls?: string[] | null
          status?: string
          tags?: string[] | null
          topic: string
          x_content?: string | null
          x_post_id?: string | null
        }
        Update: {
          approved_at?: string | null
          created_at?: string | null
          id?: string
          image_prompt?: string | null
          image_url?: string | null
          linkedin_content?: string | null
          linkedin_post_id?: string | null
          posted_at?: string | null
          run_id?: string | null
          source_context?: Json | null
          source_urls?: string[] | null
          status?: string
          tags?: string[] | null
          topic?: string
          x_content?: string | null
          x_post_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "digest_posts_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "digest_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      digest_runs: {
        Row: {
          completed_at: string | null
          created_at: string | null
          error: string | null
          id: string
          post_count: number | null
          research_data: Json | null
          run_date: string
          sources_used: string[] | null
          status: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string | null
          error?: string | null
          id?: string
          post_count?: number | null
          research_data?: Json | null
          run_date?: string
          sources_used?: string[] | null
          status?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string | null
          error?: string | null
          id?: string
          post_count?: number | null
          research_data?: Json | null
          run_date?: string
          sources_used?: string[] | null
          status?: string
        }
        Relationships: []
      }
      entities: {
        Row: {
          created_at: string | null
          id: string
          metadata: Json | null
          name: string
          type: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          metadata?: Json | null
          name: string
          type: string
        }
        Update: {
          created_at?: string | null
          id?: string
          metadata?: Json | null
          name?: string
          type?: string
        }
        Relationships: []
      }
      entity_links: {
        Row: {
          context: string | null
          created_at: string | null
          created_by: string | null
          id: string
          link_type: Database["public"]["Enums"]["relationship_type"]
          metadata: Json | null
          source_entity_id: string
          source_entity_type: string
          target_entity_id: string
          target_entity_type: string
        }
        Insert: {
          context?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          link_type: Database["public"]["Enums"]["relationship_type"]
          metadata?: Json | null
          source_entity_id: string
          source_entity_type: string
          target_entity_id: string
          target_entity_type: string
        }
        Update: {
          context?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          link_type?: Database["public"]["Enums"]["relationship_type"]
          metadata?: Json | null
          source_entity_id?: string
          source_entity_type?: string
          target_entity_id?: string
          target_entity_type?: string
        }
        Relationships: []
      }
      events: {
        Row: {
          body: string
          created_at: string | null
          id: string
        }
        Insert: {
          body: string
          created_at?: string | null
          id?: string
        }
        Update: {
          body?: string
          created_at?: string | null
          id?: string
        }
        Relationships: []
      }
      feed_item_comments: {
        Row: {
          comment_text: string
          created_at: string
          feed_item_id: string
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          comment_text: string
          created_at?: string
          feed_item_id: string
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          comment_text?: string
          created_at?: string
          feed_item_id?: string
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "feed_item_comments_feed_item_id_fkey"
            columns: ["feed_item_id"]
            isOneToOne: false
            referencedRelation: "feed_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feed_item_comments_feed_item_id_fkey"
            columns: ["feed_item_id"]
            isOneToOne: false
            referencedRelation: "feed_items_with_elements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feed_item_comments_feed_item_id_fkey"
            columns: ["feed_item_id"]
            isOneToOne: false
            referencedRelation: "feed_items_with_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feed_item_comments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "feed_items_with_profiles"
            referencedColumns: ["creator_profile_id"]
          },
          {
            foreignKeyName: "feed_item_comments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "feed_items_with_profiles"
            referencedColumns: ["reviewer_profile_id"]
          },
          {
            foreignKeyName: "feed_item_comments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      feed_item_likes: {
        Row: {
          created_at: string
          feed_item_id: string
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          feed_item_id: string
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string
          feed_item_id?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "feed_item_likes_feed_item_id_fkey"
            columns: ["feed_item_id"]
            isOneToOne: false
            referencedRelation: "feed_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feed_item_likes_feed_item_id_fkey"
            columns: ["feed_item_id"]
            isOneToOne: false
            referencedRelation: "feed_items_with_elements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feed_item_likes_feed_item_id_fkey"
            columns: ["feed_item_id"]
            isOneToOne: false
            referencedRelation: "feed_items_with_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      feed_item_visual_elements: {
        Row: {
          created_at: string | null
          element_category: string | null
          element_description: string | null
          element_name: string | null
          element_tags: string[] | null
          feed_item_id: string
          id: string
          visual_element_id: string
        }
        Insert: {
          created_at?: string | null
          element_category?: string | null
          element_description?: string | null
          element_name?: string | null
          element_tags?: string[] | null
          feed_item_id: string
          id?: string
          visual_element_id: string
        }
        Update: {
          created_at?: string | null
          element_category?: string | null
          element_description?: string | null
          element_name?: string | null
          element_tags?: string[] | null
          feed_item_id?: string
          id?: string
          visual_element_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "feed_item_visual_elements_feed_item_id_fkey"
            columns: ["feed_item_id"]
            isOneToOne: false
            referencedRelation: "feed_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feed_item_visual_elements_feed_item_id_fkey"
            columns: ["feed_item_id"]
            isOneToOne: false
            referencedRelation: "feed_items_with_elements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feed_item_visual_elements_feed_item_id_fkey"
            columns: ["feed_item_id"]
            isOneToOne: false
            referencedRelation: "feed_items_with_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feed_item_visual_elements_visual_element_id_fkey"
            columns: ["visual_element_id"]
            isOneToOne: false
            referencedRelation: "visual_elements"
            referencedColumns: ["id"]
          },
        ]
      }
      feed_items: {
        Row: {
          admin_review_notes: string | null
          approved_at: string | null
          content_data: Json
          created_at: string
          created_by_maya_profile_id: string
          error_details: Json | null
          generated_series_data: Json | null
          id: string
          item_type: string
          modifier_instructions: string | null
          original_context: Json | null
          parent_feed_item_id: string | null
          posted_to_platforms: Json | null
          raw_event_id: string | null
          reviewed_at: string | null
          reviewed_by_user_id: string | null
          social_platforms_selected: Json | null
          social_posting_metadata: Json | null
          social_posting_status: string | null
          source_system: string
          status: string
          updated_at: string
        }
        Insert: {
          admin_review_notes?: string | null
          approved_at?: string | null
          content_data: Json
          created_at?: string
          created_by_maya_profile_id?: string
          error_details?: Json | null
          generated_series_data?: Json | null
          id?: string
          item_type: string
          modifier_instructions?: string | null
          original_context?: Json | null
          parent_feed_item_id?: string | null
          posted_to_platforms?: Json | null
          raw_event_id?: string | null
          reviewed_at?: string | null
          reviewed_by_user_id?: string | null
          social_platforms_selected?: Json | null
          social_posting_metadata?: Json | null
          social_posting_status?: string | null
          source_system: string
          status?: string
          updated_at?: string
        }
        Update: {
          admin_review_notes?: string | null
          approved_at?: string | null
          content_data?: Json
          created_at?: string
          created_by_maya_profile_id?: string
          error_details?: Json | null
          generated_series_data?: Json | null
          id?: string
          item_type?: string
          modifier_instructions?: string | null
          original_context?: Json | null
          parent_feed_item_id?: string | null
          posted_to_platforms?: Json | null
          raw_event_id?: string | null
          reviewed_at?: string | null
          reviewed_by_user_id?: string | null
          social_platforms_selected?: Json | null
          social_posting_metadata?: Json | null
          social_posting_status?: string | null
          source_system?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "feed_items_parent_feed_item_id_fkey"
            columns: ["parent_feed_item_id"]
            isOneToOne: false
            referencedRelation: "feed_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feed_items_parent_feed_item_id_fkey"
            columns: ["parent_feed_item_id"]
            isOneToOne: false
            referencedRelation: "feed_items_with_elements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feed_items_parent_feed_item_id_fkey"
            columns: ["parent_feed_item_id"]
            isOneToOne: false
            referencedRelation: "feed_items_with_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feed_items_raw_event_id_fkey"
            columns: ["raw_event_id"]
            isOneToOne: false
            referencedRelation: "raw_events"
            referencedColumns: ["id"]
          },
        ]
      }
      generations: {
        Row: {
          category: string | null
          created_at: string
          id: number
          image_url: string
          is_nsfw: boolean | null
          metadata: Json | null
          prompt: string
          series: string | null
          star_rating: number | null
          tags: string[] | null
        }
        Insert: {
          category?: string | null
          created_at?: string
          id?: never
          image_url: string
          is_nsfw?: boolean | null
          metadata?: Json | null
          prompt: string
          series?: string | null
          star_rating?: number | null
          tags?: string[] | null
        }
        Update: {
          category?: string | null
          created_at?: string
          id?: never
          image_url?: string
          is_nsfw?: boolean | null
          metadata?: Json | null
          prompt?: string
          series?: string | null
          star_rating?: number | null
          tags?: string[] | null
        }
        Relationships: []
      }
      image_analyses: {
        Row: {
          analysis_result: string
          analysis_type: string
          created_at: string | null
          id: string
          image_url: string | null
          metadata: Json | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          analysis_result: string
          analysis_type?: string
          created_at?: string | null
          id?: string
          image_url?: string | null
          metadata?: Json | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          analysis_result?: string
          analysis_type?: string
          created_at?: string | null
          id?: string
          image_url?: string | null
          metadata?: Json | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      image_generation_batches: {
        Row: {
          completed_items: number | null
          created_at: string | null
          default_modifier_instructions: string | null
          default_visual_element_ids: string[] | null
          failed_items: number | null
          id: string
          prompt: string | null
          status: string | null
          total_items: number | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          completed_items?: number | null
          created_at?: string | null
          default_modifier_instructions?: string | null
          default_visual_element_ids?: string[] | null
          failed_items?: number | null
          id?: string
          prompt?: string | null
          status?: string | null
          total_items?: number | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          completed_items?: number | null
          created_at?: string | null
          default_modifier_instructions?: string | null
          default_visual_element_ids?: string[] | null
          failed_items?: number | null
          id?: string
          prompt?: string | null
          status?: string | null
          total_items?: number | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      image_generation_queue: {
        Row: {
          attempts: number | null
          batch_id: string | null
          completed_at: string | null
          created_at: string | null
          error_message: string | null
          feed_item_id: string | null
          id: string
          max_attempts: number | null
          modifier_instructions: string | null
          modifier_visual_element_ids: string[] | null
          prompt: string | null
          result_feed_item_id: string | null
          result_image_url: string | null
          source_image_base64: string | null
          source_image_url: string | null
          started_at: string | null
          status: string | null
        }
        Insert: {
          attempts?: number | null
          batch_id?: string | null
          completed_at?: string | null
          created_at?: string | null
          error_message?: string | null
          feed_item_id?: string | null
          id?: string
          max_attempts?: number | null
          modifier_instructions?: string | null
          modifier_visual_element_ids?: string[] | null
          prompt?: string | null
          result_feed_item_id?: string | null
          result_image_url?: string | null
          source_image_base64?: string | null
          source_image_url?: string | null
          started_at?: string | null
          status?: string | null
        }
        Update: {
          attempts?: number | null
          batch_id?: string | null
          completed_at?: string | null
          created_at?: string | null
          error_message?: string | null
          feed_item_id?: string | null
          id?: string
          max_attempts?: number | null
          modifier_instructions?: string | null
          modifier_visual_element_ids?: string[] | null
          prompt?: string | null
          result_feed_item_id?: string | null
          result_image_url?: string | null
          source_image_base64?: string | null
          source_image_url?: string | null
          started_at?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "image_generation_queue_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "image_generation_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "image_generation_queue_feed_item_id_fkey"
            columns: ["feed_item_id"]
            isOneToOne: false
            referencedRelation: "feed_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "image_generation_queue_feed_item_id_fkey"
            columns: ["feed_item_id"]
            isOneToOne: false
            referencedRelation: "feed_items_with_elements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "image_generation_queue_feed_item_id_fkey"
            columns: ["feed_item_id"]
            isOneToOne: false
            referencedRelation: "feed_items_with_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "image_generation_queue_result_feed_item_id_fkey"
            columns: ["result_feed_item_id"]
            isOneToOne: false
            referencedRelation: "feed_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "image_generation_queue_result_feed_item_id_fkey"
            columns: ["result_feed_item_id"]
            isOneToOne: false
            referencedRelation: "feed_items_with_elements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "image_generation_queue_result_feed_item_id_fkey"
            columns: ["result_feed_item_id"]
            isOneToOne: false
            referencedRelation: "feed_items_with_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      image_prompt_components: {
        Row: {
          component_type: string
          created_at: string | null
          id: string
          is_active: boolean | null
          theme_tags: string[] | null
          updated_at: string | null
          value: string
          weight: number | null
        }
        Insert: {
          component_type: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          theme_tags?: string[] | null
          updated_at?: string | null
          value: string
          weight?: number | null
        }
        Update: {
          component_type?: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          theme_tags?: string[] | null
          updated_at?: string | null
          value?: string
          weight?: number | null
        }
        Relationships: []
      }
      image_series_variations: {
        Row: {
          applies_to_component_type: string | null
          created_at: string | null
          description: string | null
          id: string
          is_active: boolean | null
          mutually_exclusive_group: string | null
          theme_tags: string[] | null
          updated_at: string | null
          value: string
          variation_set_name: string
          variation_type: string
          weight: number | null
        }
        Insert: {
          applies_to_component_type?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          mutually_exclusive_group?: string | null
          theme_tags?: string[] | null
          updated_at?: string | null
          value: string
          variation_set_name: string
          variation_type: string
          weight?: number | null
        }
        Update: {
          applies_to_component_type?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          mutually_exclusive_group?: string | null
          theme_tags?: string[] | null
          updated_at?: string | null
          value?: string
          variation_set_name?: string
          variation_type?: string
          weight?: number | null
        }
        Relationships: []
      }
      inspo_images: {
        Row: {
          caption: string | null
          created_at: string | null
          date_shown: string | null
          feed_item_id: string | null
          id: string
          image_url: string
          is_shown: boolean | null
          likes: number
          post_url: string
          score: number | null
          source_account: string
          source_hashtag: string
          updated_at: string | null
        }
        Insert: {
          caption?: string | null
          created_at?: string | null
          date_shown?: string | null
          feed_item_id?: string | null
          id?: string
          image_url: string
          is_shown?: boolean | null
          likes?: number
          post_url: string
          score?: number | null
          source_account: string
          source_hashtag: string
          updated_at?: string | null
        }
        Update: {
          caption?: string | null
          created_at?: string | null
          date_shown?: string | null
          feed_item_id?: string | null
          id?: string
          image_url?: string
          is_shown?: boolean | null
          likes?: number
          post_url?: string
          score?: number | null
          source_account?: string
          source_hashtag?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      inspo_search_history: {
        Row: {
          created_at: string | null
          id: string
          last_searched: string | null
          results_found: number | null
          search_term: string
          search_type: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          last_searched?: string | null
          results_found?: number | null
          search_term: string
          search_type?: string
        }
        Update: {
          created_at?: string | null
          id?: string
          last_searched?: string | null
          results_found?: number | null
          search_term?: string
          search_type?: string
        }
        Relationships: []
      }
      links: {
        Row: {
          id: string
          image_url: string | null
          is_active: boolean | null
          order: number | null
          title: string | null
          url: string | null
        }
        Insert: {
          id?: string
          image_url?: string | null
          is_active?: boolean | null
          order?: number | null
          title?: string | null
          url?: string | null
        }
        Update: {
          id?: string
          image_url?: string | null
          is_active?: boolean | null
          order?: number | null
          title?: string | null
          url?: string | null
        }
        Relationships: []
      }
      maya_core_facts: {
        Row: {
          active: boolean | null
          category: string | null
          id: string
          last_updated: string | null
          object: string
          predicate: string
          source_ref: Json | null
          subject: string
          ts: string | null
          user_id: string
          weight: number | null
        }
        Insert: {
          active?: boolean | null
          category?: string | null
          id?: string
          last_updated?: string | null
          object: string
          predicate: string
          source_ref?: Json | null
          subject: string
          ts?: string | null
          user_id: string
          weight?: number | null
        }
        Update: {
          active?: boolean | null
          category?: string | null
          id?: string
          last_updated?: string | null
          object?: string
          predicate?: string
          source_ref?: Json | null
          subject?: string
          ts?: string | null
          user_id?: string
          weight?: number | null
        }
        Relationships: []
      }
      maya_current_mood_state: {
        Row: {
          current_mood: string | null
          energy_level: number | null
          last_influencers: Json | null
          last_mood_update_at: string | null
          user_id: string
        }
        Insert: {
          current_mood?: string | null
          energy_level?: number | null
          last_influencers?: Json | null
          last_mood_update_at?: string | null
          user_id: string
        }
        Update: {
          current_mood?: string | null
          energy_level?: number | null
          last_influencers?: Json | null
          last_mood_update_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      maya_custom_models: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          is_active: boolean | null
          is_local: boolean | null
          model_config: Json | null
          name: string
          provider: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          is_local?: boolean | null
          model_config?: Json | null
          name: string
          provider: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          is_local?: boolean | null
          model_config?: Json | null
          name?: string
          provider?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      maya_facts: {
        Row: {
          content: string | null
          embedding: string | null
          embedding_model: string | null
          embedding_ver: string | null
          expires_at: string | null
          fact_type: string | null
          id: string
          is_permanent: boolean | null
          last_mentioned_at: string | null
          metadata: Json | null
          object: string
          predicate: string
          reference_count: number | null
          source_ref: Json | null
          subject: string
          ts: string | null
          user_id: string
          weight: number | null
        }
        Insert: {
          content?: string | null
          embedding?: string | null
          embedding_model?: string | null
          embedding_ver?: string | null
          expires_at?: string | null
          fact_type?: string | null
          id?: string
          is_permanent?: boolean | null
          last_mentioned_at?: string | null
          metadata?: Json | null
          object: string
          predicate: string
          reference_count?: number | null
          source_ref?: Json | null
          subject: string
          ts?: string | null
          user_id: string
          weight?: number | null
        }
        Update: {
          content?: string | null
          embedding?: string | null
          embedding_model?: string | null
          embedding_ver?: string | null
          expires_at?: string | null
          fact_type?: string | null
          id?: string
          is_permanent?: boolean | null
          last_mentioned_at?: string | null
          metadata?: Json | null
          object?: string
          predicate?: string
          reference_count?: number | null
          source_ref?: Json | null
          subject?: string
          ts?: string | null
          user_id?: string
          weight?: number | null
        }
        Relationships: []
      }
      maya_image_sends: {
        Row: {
          background: string | null
          clothing: string | null
          created_at: string | null
          day_of_week: number | null
          id: string
          image_url: string
          metadata: Json | null
          mood_category: string
          notification_body: string | null
          notification_sent: boolean | null
          notification_title: string | null
          pose: string | null
          prompt: string
          public_url: string
          style: string | null
          time_of_day: string | null
          trigger_type: string
          user_id: string
        }
        Insert: {
          background?: string | null
          clothing?: string | null
          created_at?: string | null
          day_of_week?: number | null
          id?: string
          image_url: string
          metadata?: Json | null
          mood_category: string
          notification_body?: string | null
          notification_sent?: boolean | null
          notification_title?: string | null
          pose?: string | null
          prompt: string
          public_url: string
          style?: string | null
          time_of_day?: string | null
          trigger_type?: string
          user_id: string
        }
        Update: {
          background?: string | null
          clothing?: string | null
          created_at?: string | null
          day_of_week?: number | null
          id?: string
          image_url?: string
          metadata?: Json | null
          mood_category?: string
          notification_body?: string | null
          notification_sent?: boolean | null
          notification_title?: string | null
          pose?: string | null
          prompt?: string
          public_url?: string
          style?: string | null
          time_of_day?: string | null
          trigger_type?: string
          user_id?: string
        }
        Relationships: []
      }
      maya_llm_logs: {
        Row: {
          created_at: string | null
          id: string
          maya_response: string | null
          metadata: Json | null
          model: string | null
          prompt_used: string | null
          provider: string | null
          response_time_ms: number | null
          temperature: number | null
          tokens_used: number | null
          user_id: string | null
          user_message: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          maya_response?: string | null
          metadata?: Json | null
          model?: string | null
          prompt_used?: string | null
          provider?: string | null
          response_time_ms?: number | null
          temperature?: number | null
          tokens_used?: number | null
          user_id?: string | null
          user_message?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          maya_response?: string | null
          metadata?: Json | null
          model?: string | null
          prompt_used?: string | null
          provider?: string | null
          response_time_ms?: number | null
          temperature?: number | null
          tokens_used?: number | null
          user_id?: string | null
          user_message?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "maya_llm_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "feed_items_with_profiles"
            referencedColumns: ["creator_profile_id"]
          },
          {
            foreignKeyName: "maya_llm_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "feed_items_with_profiles"
            referencedColumns: ["reviewer_profile_id"]
          },
          {
            foreignKeyName: "maya_llm_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      maya_memories: {
        Row: {
          content: string
          created_at: string | null
          embedding: string | null
          embedding_model: string | null
          embedding_ver: string | null
          expires_at: string | null
          id: number
          importance: number | null
          last_referenced_at: string | null
          metadata: Json | null
          modality: string | null
          reference_count: number | null
          tags: string[] | null
        }
        Insert: {
          content: string
          created_at?: string | null
          embedding?: string | null
          embedding_model?: string | null
          embedding_ver?: string | null
          expires_at?: string | null
          id?: number
          importance?: number | null
          last_referenced_at?: string | null
          metadata?: Json | null
          modality?: string | null
          reference_count?: number | null
          tags?: string[] | null
        }
        Update: {
          content?: string
          created_at?: string | null
          embedding?: string | null
          embedding_model?: string | null
          embedding_ver?: string | null
          expires_at?: string | null
          id?: number
          importance?: number | null
          last_referenced_at?: string | null
          metadata?: Json | null
          modality?: string | null
          reference_count?: number | null
          tags?: string[] | null
        }
        Relationships: []
      }
      maya_messages_sent: {
        Row: {
          created_at: string | null
          id: string
          message: string
          metadata: Json | null
          thought_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          message: string
          metadata?: Json | null
          thought_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          message?: string
          metadata?: Json | null
          thought_id?: string | null
          user_id?: string
        }
        Relationships: []
      }
      maya_product_clicks: {
        Row: {
          clicked_at: string | null
          id: string
          ip_hash: string | null
          product_id: string
          referrer: string | null
          user_agent: string | null
        }
        Insert: {
          clicked_at?: string | null
          id?: string
          ip_hash?: string | null
          product_id: string
          referrer?: string | null
          user_agent?: string | null
        }
        Update: {
          clicked_at?: string | null
          id?: string
          ip_hash?: string | null
          product_id?: string
          referrer?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "maya_product_clicks_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "maya_products"
            referencedColumns: ["id"]
          },
        ]
      }
      maya_products: {
        Row: {
          affiliate_link: string
          category: string | null
          click_count: number | null
          created_at: string | null
          description: string | null
          id: string
          image_url: string | null
          is_active: boolean | null
          meta_description: string | null
          meta_title: string | null
          name: string
          original_price: number | null
          platform: string | null
          sale_price: number | null
          slug: string | null
          tags: string[] | null
          updated_at: string | null
        }
        Insert: {
          affiliate_link: string
          category?: string | null
          click_count?: number | null
          created_at?: string | null
          description?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean | null
          meta_description?: string | null
          meta_title?: string | null
          name: string
          original_price?: number | null
          platform?: string | null
          sale_price?: number | null
          slug?: string | null
          tags?: string[] | null
          updated_at?: string | null
        }
        Update: {
          affiliate_link?: string
          category?: string | null
          click_count?: number | null
          created_at?: string | null
          description?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean | null
          meta_description?: string | null
          meta_title?: string | null
          name?: string
          original_price?: number | null
          platform?: string | null
          sale_price?: number | null
          slug?: string | null
          tags?: string[] | null
          updated_at?: string | null
        }
        Relationships: []
      }
      maya_reminder_contexts: {
        Row: {
          context_key: string
          context_type: string
          context_value: Json
          detected_at: string | null
          expires_at: string | null
          id: string
          relevance_score: number | null
          source_message_id: string | null
          source_room_id: string | null
          user_id: string
        }
        Insert: {
          context_key: string
          context_type: string
          context_value: Json
          detected_at?: string | null
          expires_at?: string | null
          id?: string
          relevance_score?: number | null
          source_message_id?: string | null
          source_room_id?: string | null
          user_id: string
        }
        Update: {
          context_key?: string
          context_type?: string
          context_value?: Json
          detected_at?: string | null
          expires_at?: string | null
          id?: string
          relevance_score?: number | null
          source_message_id?: string | null
          source_room_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "maya_reminder_contexts_source_message_id_fkey"
            columns: ["source_message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      maya_reminder_deliveries: {
        Row: {
          attempted_at: string | null
          delivered_at: string | null
          delivery_metadata: Json | null
          delivery_method: string
          delivery_status: string
          error_message: string | null
          id: string
          reminder_id: string
          response_at: string | null
          user_response: string | null
        }
        Insert: {
          attempted_at?: string | null
          delivered_at?: string | null
          delivery_metadata?: Json | null
          delivery_method: string
          delivery_status?: string
          error_message?: string | null
          id?: string
          reminder_id: string
          response_at?: string | null
          user_response?: string | null
        }
        Update: {
          attempted_at?: string | null
          delivered_at?: string | null
          delivery_metadata?: Json | null
          delivery_method?: string
          delivery_status?: string
          error_message?: string | null
          id?: string
          reminder_id?: string
          response_at?: string | null
          user_response?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "maya_reminder_deliveries_reminder_id_fkey"
            columns: ["reminder_id"]
            isOneToOne: false
            referencedRelation: "maya_reminders"
            referencedColumns: ["id"]
          },
        ]
      }
      maya_reminder_patterns: {
        Row: {
          confidence_score: number | null
          created_at: string | null
          description: string | null
          id: string
          is_active: boolean | null
          last_triggered: string | null
          occurrences: number | null
          pattern_name: string
          pattern_type: string
          reminder_template: Json | null
          trigger_conditions: Json | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          confidence_score?: number | null
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          last_triggered?: string | null
          occurrences?: number | null
          pattern_name: string
          pattern_type: string
          reminder_template?: Json | null
          trigger_conditions?: Json | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          confidence_score?: number | null
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          last_triggered?: string | null
          occurrences?: number | null
          pattern_name?: string
          pattern_type?: string
          reminder_template?: Json | null
          trigger_conditions?: Json | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      maya_reminders: {
        Row: {
          acknowledged_at: string | null
          content: string | null
          created_at: string | null
          id: string
          metadata: Json | null
          priority: string
          remind_at: string
          reminder_type: string
          rrule: string | null
          sent_at: string | null
          snoozed_until: string | null
          source_message_id: string | null
          source_room_id: string | null
          status: string
          title: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          acknowledged_at?: string | null
          content?: string | null
          created_at?: string | null
          id?: string
          metadata?: Json | null
          priority?: string
          remind_at: string
          reminder_type?: string
          rrule?: string | null
          sent_at?: string | null
          snoozed_until?: string | null
          source_message_id?: string | null
          source_room_id?: string | null
          status?: string
          title: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          acknowledged_at?: string | null
          content?: string | null
          created_at?: string | null
          id?: string
          metadata?: Json | null
          priority?: string
          remind_at?: string
          reminder_type?: string
          rrule?: string | null
          sent_at?: string | null
          snoozed_until?: string | null
          source_message_id?: string | null
          source_room_id?: string | null
          status?: string
          title?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "maya_reminders_source_message_id_fkey"
            columns: ["source_message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      maya_settings: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          key: string
          updated_at: string | null
          value: Json
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          key: string
          updated_at?: string | null
          value: Json
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          key?: string
          updated_at?: string | null
          value?: Json
        }
        Relationships: []
      }
      maya_social_engagement_queue: {
        Row: {
          action_type: string
          approval_status: string | null
          blake_response: string | null
          consultation_message_id: string | null
          created_at: string | null
          draft_content: string | null
          executed_at: string | null
          execution_result: Json | null
          expires_at: string | null
          id: string
          importance_score: number | null
          reasoning: string | null
          requires_approval: boolean | null
          retry_count: number | null
          target_post_id: string | null
          updated_at: string | null
          urgency_level: string | null
          user_id: string
        }
        Insert: {
          action_type: string
          approval_status?: string | null
          blake_response?: string | null
          consultation_message_id?: string | null
          created_at?: string | null
          draft_content?: string | null
          executed_at?: string | null
          execution_result?: Json | null
          expires_at?: string | null
          id?: string
          importance_score?: number | null
          reasoning?: string | null
          requires_approval?: boolean | null
          retry_count?: number | null
          target_post_id?: string | null
          updated_at?: string | null
          urgency_level?: string | null
          user_id: string
        }
        Update: {
          action_type?: string
          approval_status?: string | null
          blake_response?: string | null
          consultation_message_id?: string | null
          created_at?: string | null
          draft_content?: string | null
          executed_at?: string | null
          execution_result?: Json | null
          expires_at?: string | null
          id?: string
          importance_score?: number | null
          reasoning?: string | null
          requires_approval?: boolean | null
          retry_count?: number | null
          target_post_id?: string | null
          updated_at?: string | null
          urgency_level?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "maya_social_engagement_queue_target_post_id_fkey"
            columns: ["target_post_id"]
            isOneToOne: false
            referencedRelation: "maya_social_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      maya_social_insights: {
        Row: {
          confidence_score: number | null
          created_at: string | null
          id: string
          insight: string
          insight_type: string
          memory_id: string | null
          mentioned_users: string[] | null
          related_post_id: string | null
          thought_id: string | null
          topics: string[] | null
          user_id: string
        }
        Insert: {
          confidence_score?: number | null
          created_at?: string | null
          id?: string
          insight: string
          insight_type: string
          memory_id?: string | null
          mentioned_users?: string[] | null
          related_post_id?: string | null
          thought_id?: string | null
          topics?: string[] | null
          user_id: string
        }
        Update: {
          confidence_score?: number | null
          created_at?: string | null
          id?: string
          insight?: string
          insight_type?: string
          memory_id?: string | null
          mentioned_users?: string[] | null
          related_post_id?: string | null
          thought_id?: string | null
          topics?: string[] | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "maya_social_insights_related_post_id_fkey"
            columns: ["related_post_id"]
            isOneToOne: false
            referencedRelation: "maya_social_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      maya_social_logs: {
        Row: {
          action: string
          actions_executed: number | null
          created_at: string | null
          errors_encountered: number | null
          execution_time: string | null
          id: string
          message: string
          metadata: Json | null
          posts_collected: number | null
          status: string
          user_id: string
        }
        Insert: {
          action: string
          actions_executed?: number | null
          created_at?: string | null
          errors_encountered?: number | null
          execution_time?: string | null
          id?: string
          message: string
          metadata?: Json | null
          posts_collected?: number | null
          status: string
          user_id: string
        }
        Update: {
          action?: string
          actions_executed?: number | null
          created_at?: string | null
          errors_encountered?: number | null
          execution_time?: string | null
          id?: string
          message?: string
          metadata?: Json | null
          posts_collected?: number | null
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      maya_social_posts: {
        Row: {
          author_handle: string
          author_id: string | null
          author_name: string | null
          collected_at: string | null
          content: string
          conversation_id: string | null
          created_at: string | null
          embedded: boolean | null
          id: string
          is_reply_to: string | null
          likes_count: number | null
          media_urls: string[] | null
          platform: string
          post_id: string
          post_type: string
          post_url: string
          processed: boolean | null
          replies_count: number | null
          retweets_count: number | null
          screenshot_path: string | null
          topics: string[] | null
          updated_at: string | null
          user_id: string
          views_count: number | null
        }
        Insert: {
          author_handle: string
          author_id?: string | null
          author_name?: string | null
          collected_at?: string | null
          content: string
          conversation_id?: string | null
          created_at?: string | null
          embedded?: boolean | null
          id?: string
          is_reply_to?: string | null
          likes_count?: number | null
          media_urls?: string[] | null
          platform?: string
          post_id: string
          post_type: string
          post_url: string
          processed?: boolean | null
          replies_count?: number | null
          retweets_count?: number | null
          screenshot_path?: string | null
          topics?: string[] | null
          updated_at?: string | null
          user_id: string
          views_count?: number | null
        }
        Update: {
          author_handle?: string
          author_id?: string | null
          author_name?: string | null
          collected_at?: string | null
          content?: string
          conversation_id?: string | null
          created_at?: string | null
          embedded?: boolean | null
          id?: string
          is_reply_to?: string | null
          likes_count?: number | null
          media_urls?: string[] | null
          platform?: string
          post_id?: string
          post_type?: string
          post_url?: string
          processed?: boolean | null
          replies_count?: number | null
          retweets_count?: number | null
          screenshot_path?: string | null
          topics?: string[] | null
          updated_at?: string | null
          user_id?: string
          views_count?: number | null
        }
        Relationships: []
      }
      maya_system_prompts: {
        Row: {
          active: boolean | null
          created_at: string | null
          id: string
          max_tokens: number | null
          name: string
          prompt_content: string
          temperature: number | null
          updated_at: string | null
        }
        Insert: {
          active?: boolean | null
          created_at?: string | null
          id?: string
          max_tokens?: number | null
          name: string
          prompt_content: string
          temperature?: number | null
          updated_at?: string | null
        }
        Update: {
          active?: boolean | null
          created_at?: string | null
          id?: string
          max_tokens?: number | null
          name?: string
          prompt_content?: string
          temperature?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      maya_working_memory: {
        Row: {
          confidence: number
          created_at: string | null
          decay_rate: number
          first_seen: string
          id: string
          importance_score: number
          key: string
          last_mentioned: string
          memory_type: string
          mention_count: number
          metadata: Json | null
          updated_at: string | null
          user_id: string
          value: string
        }
        Insert: {
          confidence?: number
          created_at?: string | null
          decay_rate?: number
          first_seen?: string
          id?: string
          importance_score?: number
          key: string
          last_mentioned?: string
          memory_type: string
          mention_count?: number
          metadata?: Json | null
          updated_at?: string | null
          user_id: string
          value: string
        }
        Update: {
          confidence?: number
          created_at?: string | null
          decay_rate?: number
          first_seen?: string
          id?: string
          importance_score?: number
          key?: string
          last_mentioned?: string
          memory_type?: string
          mention_count?: number
          metadata?: Json | null
          updated_at?: string | null
          user_id?: string
          value?: string
        }
        Relationships: []
      }
      memory_ingestion_queue: {
        Row: {
          attempts: number
          content_to_process: string
          created_at: string | null
          error: string | null
          id: string
          last_error: string | null
          metadata: Json | null
          processed_at: string | null
          source_id: string
          source_type: string
          status: string
          updated_at: string | null
        }
        Insert: {
          attempts?: number
          content_to_process: string
          created_at?: string | null
          error?: string | null
          id?: string
          last_error?: string | null
          metadata?: Json | null
          processed_at?: string | null
          source_id: string
          source_type: string
          status?: string
          updated_at?: string | null
        }
        Update: {
          attempts?: number
          content_to_process?: string
          created_at?: string | null
          error?: string | null
          id?: string
          last_error?: string | null
          metadata?: Json | null
          processed_at?: string | null
          source_id?: string
          source_type?: string
          status?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      messages: {
        Row: {
          content: string
          created_at: string | null
          id: string
          media_path: string | null
          metadata: Json | null
          role: string
          room_id: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string | null
          id?: string
          media_path?: string | null
          metadata?: Json | null
          role: string
          room_id: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string | null
          id?: string
          media_path?: string | null
          metadata?: Json | null
          role?: string
          room_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      mood_definitions: {
        Row: {
          activation_boost_modifier: number
          base_image_prompt_components: Json | null
          base_internal_thought_seed: string
          can_generate_image: boolean | null
          can_post_to_social: boolean
          created_at: string
          display_name: string
          energy_cost_factor_modifier: number
          fallback_message_prefix: string | null
          is_active: boolean
          mood_id: string
          notes: string | null
          updated_at: string
        }
        Insert: {
          activation_boost_modifier?: number
          base_image_prompt_components?: Json | null
          base_internal_thought_seed: string
          can_generate_image?: boolean | null
          can_post_to_social?: boolean
          created_at?: string
          display_name: string
          energy_cost_factor_modifier?: number
          fallback_message_prefix?: string | null
          is_active?: boolean
          mood_id: string
          notes?: string | null
          updated_at?: string
        }
        Update: {
          activation_boost_modifier?: number
          base_image_prompt_components?: Json | null
          base_internal_thought_seed?: string
          can_generate_image?: boolean | null
          can_post_to_social?: boolean
          created_at?: string
          display_name?: string
          energy_cost_factor_modifier?: number
          fallback_message_prefix?: string | null
          is_active?: boolean
          mood_id?: string
          notes?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      mood_engine_config_settings: {
        Row: {
          activation_threshold: number
          config_key: string
          energy_decay_no_send: number
          energy_decay_send: number
          image_generation_probability: number | null
          image_prompt_structure: Json | null
          noise_factor: number
          social_post_probability: number
          updated_at: string
          use_core_fact_probability: number
          use_maya_fact_probability: number
        }
        Insert: {
          activation_threshold?: number
          config_key?: string
          energy_decay_no_send?: number
          energy_decay_send?: number
          image_generation_probability?: number | null
          image_prompt_structure?: Json | null
          noise_factor?: number
          social_post_probability?: number
          updated_at?: string
          use_core_fact_probability?: number
          use_maya_fact_probability?: number
        }
        Update: {
          activation_threshold?: number
          config_key?: string
          energy_decay_no_send?: number
          energy_decay_send?: number
          image_generation_probability?: number | null
          image_prompt_structure?: Json | null
          noise_factor?: number
          social_post_probability?: number
          updated_at?: string
          use_core_fact_probability?: number
          use_maya_fact_probability?: number
        }
        Relationships: []
      }
      mood_llm_prompts: {
        Row: {
          created_at: string
          is_active: boolean
          llm_provider: string
          mood_id: string
          notes: string | null
          prompt_id: number
          system_prompt_suffix: string
          updated_at: string
          user_message_trigger_template: string
        }
        Insert: {
          created_at?: string
          is_active?: boolean
          llm_provider?: string
          mood_id: string
          notes?: string | null
          prompt_id?: number
          system_prompt_suffix: string
          updated_at?: string
          user_message_trigger_template: string
        }
        Update: {
          created_at?: string
          is_active?: boolean
          llm_provider?: string
          mood_id?: string
          notes?: string | null
          prompt_id?: number
          system_prompt_suffix?: string
          updated_at?: string
          user_message_trigger_template?: string
        }
        Relationships: [
          {
            foreignKeyName: "mood_llm_prompts_mood_id_fkey"
            columns: ["mood_id"]
            isOneToOne: false
            referencedRelation: "mood_definitions"
            referencedColumns: ["mood_id"]
          },
        ]
      }
      oauth_tokens: {
        Row: {
          access_token: string
          created_at: string | null
          expires_at: string | null
          id: string
          metadata: Json | null
          person_urn: string | null
          provider: string
          refresh_token: string | null
          refresh_token_expires_at: string | null
          scope: string | null
          token_type: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          access_token: string
          created_at?: string | null
          expires_at?: string | null
          id?: string
          metadata?: Json | null
          person_urn?: string | null
          provider: string
          refresh_token?: string | null
          refresh_token_expires_at?: string | null
          scope?: string | null
          token_type?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          access_token?: string
          created_at?: string | null
          expires_at?: string | null
          id?: string
          metadata?: Json | null
          person_urn?: string | null
          provider?: string
          refresh_token?: string | null
          refresh_token_expires_at?: string | null
          scope?: string | null
          token_type?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      pending_social_posts: {
        Row: {
          created_at: string
          generated_content: string
          internal_thought_seed: string | null
          mood_id: string | null
          platform: string
          post_id: string
          posted_at: string | null
          review_notes: string | null
          reviewed_at: string | null
          status: string
          tweet_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          generated_content: string
          internal_thought_seed?: string | null
          mood_id?: string | null
          platform?: string
          post_id?: string
          posted_at?: string | null
          review_notes?: string | null
          reviewed_at?: string | null
          status?: string
          tweet_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          generated_content?: string
          internal_thought_seed?: string | null
          mood_id?: string | null
          platform?: string
          post_id?: string
          posted_at?: string | null
          review_notes?: string | null
          reviewed_at?: string | null
          status?: string
          tweet_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pending_social_posts_mood_id_fkey"
            columns: ["mood_id"]
            isOneToOne: false
            referencedRelation: "mood_definitions"
            referencedColumns: ["mood_id"]
          },
        ]
      }
      platform_posts: {
        Row: {
          comments: number | null
          content_post_id: string | null
          created_at: string | null
          error_message: string | null
          id: string
          impressions: number | null
          last_metrics_update: string | null
          likes: number | null
          platform: string | null
          platform_post_id: string | null
          platform_post_url: string | null
          platform_username: string | null
          posted_at: string | null
          posted_by: string | null
          scheduled_at: string | null
          shares: number | null
          status: string | null
        }
        Insert: {
          comments?: number | null
          content_post_id?: string | null
          created_at?: string | null
          error_message?: string | null
          id?: string
          impressions?: number | null
          last_metrics_update?: string | null
          likes?: number | null
          platform?: string | null
          platform_post_id?: string | null
          platform_post_url?: string | null
          platform_username?: string | null
          posted_at?: string | null
          posted_by?: string | null
          scheduled_at?: string | null
          shares?: number | null
          status?: string | null
        }
        Update: {
          comments?: number | null
          content_post_id?: string | null
          created_at?: string | null
          error_message?: string | null
          id?: string
          impressions?: number | null
          last_metrics_update?: string | null
          likes?: number | null
          platform?: string | null
          platform_post_id?: string | null
          platform_post_url?: string | null
          platform_username?: string | null
          posted_at?: string | null
          posted_by?: string | null
          scheduled_at?: string | null
          shares?: number | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "platform_posts_content_post_id_fkey"
            columns: ["content_post_id"]
            isOneToOne: false
            referencedRelation: "content_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      post_tags: {
        Row: {
          created_at: string
          post_id: string
          tag_id: string
        }
        Insert: {
          created_at?: string
          post_id: string
          tag_id: string
        }
        Update: {
          created_at?: string
          post_id?: string
          tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_tags_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
        ]
      }
      posts: {
        Row: {
          body: string
          chapter_metadata: Json | null
          cover_image: string | null
          created_at: string
          created_by: string | null
          date_range: string | null
          description: string | null
          id: string
          post_type: string | null
          published_at: string | null
          reading_time: number | null
          slug: string
          status: string | null
          tags: string[] | null
          title: string
          updated_at: string
          word_count: number | null
        }
        Insert: {
          body: string
          chapter_metadata?: Json | null
          cover_image?: string | null
          created_at?: string
          created_by?: string | null
          date_range?: string | null
          description?: string | null
          id?: string
          post_type?: string | null
          published_at?: string | null
          reading_time?: number | null
          slug: string
          status?: string | null
          tags?: string[] | null
          title: string
          updated_at?: string
          word_count?: number | null
        }
        Update: {
          body?: string
          chapter_metadata?: Json | null
          cover_image?: string | null
          created_at?: string
          created_by?: string | null
          date_range?: string | null
          description?: string | null
          id?: string
          post_type?: string | null
          published_at?: string | null
          reading_time?: number | null
          slug?: string
          status?: string | null
          tags?: string[] | null
          title?: string
          updated_at?: string
          word_count?: number | null
        }
        Relationships: []
      }
      processed_user_messages: {
        Row: {
          created_at: string
          message_id: string
          status: string
          updated_at: string
          worker_instance_id: string | null
        }
        Insert: {
          created_at?: string
          message_id: string
          status?: string
          updated_at?: string
          worker_instance_id?: string | null
        }
        Update: {
          created_at?: string
          message_id?: string
          status?: string
          updated_at?: string
          worker_instance_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "processed_user_messages_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: true
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      processing_rules: {
        Row: {
          active: boolean | null
          auto_approve: boolean | null
          conditions: Json
          created_at: string | null
          id: string
          rule_name: string
          source_id: string
          template: Json
          updated_at: string | null
        }
        Insert: {
          active?: boolean | null
          auto_approve?: boolean | null
          conditions?: Json
          created_at?: string | null
          id?: string
          rule_name: string
          source_id: string
          template?: Json
          updated_at?: string | null
        }
        Update: {
          active?: boolean | null
          auto_approve?: boolean | null
          conditions?: Json
          created_at?: string | null
          id?: string
          rule_name?: string
          source_id?: string
          template?: Json
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "processing_rules_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "data_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          bio: string | null
          created_at: string
          default_room_id: string | null
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          default_room_id?: string | null
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          default_room_id?: string | null
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      project_updates: {
        Row: {
          created_at: string | null
          created_by: string | null
          id: string
          project_id: string | null
          update_text: string
          update_type: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          project_id?: string | null
          update_text: string
          update_type?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          project_id?: string | null
          update_text?: string
          update_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_updates_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          name: string
          priority: number | null
          status: string | null
          target_date: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          name: string
          priority?: number | null
          status?: string | null
          target_date?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          name?: string
          priority?: number | null
          status?: string | null
          target_date?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      raw_events: {
        Row: {
          created_at: string | null
          error_message: string | null
          id: string
          metadata: Json | null
          payload: Json
          source_id: string | null
          source_identifier: string
          source_type: string | null
          status: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          error_message?: string | null
          id?: string
          metadata?: Json | null
          payload: Json
          source_id?: string | null
          source_identifier: string
          source_type?: string | null
          status?: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          error_message?: string | null
          id?: string
          metadata?: Json | null
          payload?: Json
          source_id?: string | null
          source_identifier?: string
          source_type?: string | null
          status?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "raw_events_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "data_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      relationships: {
        Row: {
          created_at: string | null
          entity_a_id: string | null
          entity_b_id: string | null
          id: string
          metadata: Json | null
          strength: number | null
          type: Database["public"]["Enums"]["relationship_type"]
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          entity_a_id?: string | null
          entity_b_id?: string | null
          id?: string
          metadata?: Json | null
          strength?: number | null
          type: Database["public"]["Enums"]["relationship_type"]
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          entity_a_id?: string | null
          entity_b_id?: string | null
          id?: string
          metadata?: Json | null
          strength?: number | null
          type?: Database["public"]["Enums"]["relationship_type"]
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "relationships_entity_a_id_fkey"
            columns: ["entity_a_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "relationships_entity_b_id_fkey"
            columns: ["entity_b_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
        ]
      }
      roleplay_scenarios: {
        Row: {
          character: string
          created_at: string
          description: string
          display_order: number
          dynamic: string
          id: string
          is_active: boolean
          name: string
          preferred_voice_tags: string[]
          setting: string
          temperature: number
          updated_at: string
        }
        Insert: {
          character: string
          created_at?: string
          description: string
          display_order?: number
          dynamic: string
          id: string
          is_active?: boolean
          name: string
          preferred_voice_tags?: string[]
          setting: string
          temperature?: number
          updated_at?: string
        }
        Update: {
          character?: string
          created_at?: string
          description?: string
          display_order?: number
          dynamic?: string
          id?: string
          is_active?: boolean
          name?: string
          preferred_voice_tags?: string[]
          setting?: string
          temperature?: number
          updated_at?: string
        }
        Relationships: []
      }
      roleplay_sessions: {
        Row: {
          completed_at: string | null
          created_at: string | null
          dialog_content: string | null
          dialog_message_id: string | null
          dialog_word_count: number | null
          id: string
          initiation_message_id: string | null
          metadata: Json | null
          scenario_id: string | null
          scenario_name: string | null
          status: string
          trigger_type: string
          user_id: string
          voice_tags_used: string[] | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string | null
          dialog_content?: string | null
          dialog_message_id?: string | null
          dialog_word_count?: number | null
          id?: string
          initiation_message_id?: string | null
          metadata?: Json | null
          scenario_id?: string | null
          scenario_name?: string | null
          status?: string
          trigger_type?: string
          user_id?: string
          voice_tags_used?: string[] | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string | null
          dialog_content?: string | null
          dialog_message_id?: string | null
          dialog_word_count?: number | null
          id?: string
          initiation_message_id?: string | null
          metadata?: Json | null
          scenario_id?: string | null
          scenario_name?: string | null
          status?: string
          trigger_type?: string
          user_id?: string
          voice_tags_used?: string[] | null
        }
        Relationships: []
      }
      rooms: {
        Row: {
          created_at: string | null
          id: string
          last_message_at: string | null
          name: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          last_message_at?: string | null
          name: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          last_message_at?: string | null
          name?: string
          user_id?: string
        }
        Relationships: []
      }
      social_media_platforms: {
        Row: {
          config: Json | null
          created_at: string | null
          display_name: string
          icon_emoji: string
          id: string
          is_active: boolean | null
          name: string
          updated_at: string | null
        }
        Insert: {
          config?: Json | null
          created_at?: string | null
          display_name: string
          icon_emoji: string
          id?: string
          is_active?: boolean | null
          name: string
          updated_at?: string | null
        }
        Update: {
          config?: Json | null
          created_at?: string | null
          display_name?: string
          icon_emoji?: string
          id?: string
          is_active?: boolean | null
          name?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      social_media_posting_queue: {
        Row: {
          attempts: number | null
          content_data: Json
          created_at: string | null
          error_details: Json | null
          feed_item_id: string
          id: string
          max_attempts: number | null
          platform_id: string
          post_metadata: Json | null
          posted_at: string | null
          scheduled_for: string | null
          status: string
          updated_at: string | null
        }
        Insert: {
          attempts?: number | null
          content_data: Json
          created_at?: string | null
          error_details?: Json | null
          feed_item_id: string
          id?: string
          max_attempts?: number | null
          platform_id: string
          post_metadata?: Json | null
          posted_at?: string | null
          scheduled_for?: string | null
          status?: string
          updated_at?: string | null
        }
        Update: {
          attempts?: number | null
          content_data?: Json
          created_at?: string | null
          error_details?: Json | null
          feed_item_id?: string
          id?: string
          max_attempts?: number | null
          platform_id?: string
          post_metadata?: Json | null
          posted_at?: string | null
          scheduled_for?: string | null
          status?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "social_media_posting_queue_feed_item_id_fkey"
            columns: ["feed_item_id"]
            isOneToOne: false
            referencedRelation: "feed_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "social_media_posting_queue_feed_item_id_fkey"
            columns: ["feed_item_id"]
            isOneToOne: false
            referencedRelation: "feed_items_with_elements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "social_media_posting_queue_feed_item_id_fkey"
            columns: ["feed_item_id"]
            isOneToOne: false
            referencedRelation: "feed_items_with_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "social_media_posting_queue_platform_id_fkey"
            columns: ["platform_id"]
            isOneToOne: false
            referencedRelation: "social_media_platforms"
            referencedColumns: ["id"]
          },
        ]
      }
      socials: {
        Row: {
          icon: string | null
          id: number
          platform: string | null
          url: string | null
        }
        Insert: {
          icon?: string | null
          id?: number
          platform?: string | null
          url?: string | null
        }
        Update: {
          icon?: string | null
          id?: number
          platform?: string | null
          url?: string | null
        }
        Relationships: []
      }
      subscribers: {
        Row: {
          created_at: string | null
          email: string
          id: string
        }
        Insert: {
          created_at?: string | null
          email: string
          id?: string
        }
        Update: {
          created_at?: string | null
          email?: string
          id?: string
        }
        Relationships: []
      }
      system_logs: {
        Row: {
          created_at: string | null
          event_type: string
          id: number
          message: string
          metadata: Json | null
        }
        Insert: {
          created_at?: string | null
          event_type: string
          id?: number
          message: string
          metadata?: Json | null
        }
        Update: {
          created_at?: string | null
          event_type?: string
          id?: number
          message?: string
          metadata?: Json | null
        }
        Relationships: []
      }
      tag_defs: {
        Row: {
          created_at: string | null
          description: string | null
          id: number
          is_enabled: boolean | null
          is_regex: boolean | null
          keywords: string[]
          regex_patterns: string[] | null
          report_section: string
          slug: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: number
          is_enabled?: boolean | null
          is_regex?: boolean | null
          keywords: string[]
          regex_patterns?: string[] | null
          report_section: string
          slug: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: number
          is_enabled?: boolean | null
          is_regex?: boolean | null
          keywords?: string[]
          regex_patterns?: string[] | null
          report_section?: string
          slug?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      tag_stats: {
        Row: {
          hit_count: number | null
          last_hit: string | null
          slug: string
        }
        Insert: {
          hit_count?: number | null
          last_hit?: string | null
          slug: string
        }
        Update: {
          hit_count?: number | null
          last_hit?: string | null
          slug?: string
        }
        Relationships: [
          {
            foreignKeyName: "tag_stats_slug_fkey"
            columns: ["slug"]
            isOneToOne: true
            referencedRelation: "tag_defs"
            referencedColumns: ["slug"]
          },
        ]
      }
      tags: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      tasks: {
        Row: {
          actual_minutes: number | null
          assignee: string | null
          completed_at: string | null
          content: string
          created_at: string | null
          cron_job_id: string | null
          discord_message_id: string | null
          due_at: string | null
          estimated_minutes: number | null
          id: number
          lvnsupabase_task_id: number | null
          note: string | null
          priority: string | null
          project_id: string | null
          reminder_sent: boolean | null
          source: string | null
          started_at: string | null
          status: string | null
          tags: string[] | null
          user_id: string
        }
        Insert: {
          actual_minutes?: number | null
          assignee?: string | null
          completed_at?: string | null
          content: string
          created_at?: string | null
          cron_job_id?: string | null
          discord_message_id?: string | null
          due_at?: string | null
          estimated_minutes?: number | null
          id?: number
          lvnsupabase_task_id?: number | null
          note?: string | null
          priority?: string | null
          project_id?: string | null
          reminder_sent?: boolean | null
          source?: string | null
          started_at?: string | null
          status?: string | null
          tags?: string[] | null
          user_id: string
        }
        Update: {
          actual_minutes?: number | null
          assignee?: string | null
          completed_at?: string | null
          content?: string
          created_at?: string | null
          cron_job_id?: string | null
          discord_message_id?: string | null
          due_at?: string | null
          estimated_minutes?: number | null
          id?: number
          lvnsupabase_task_id?: number | null
          note?: string | null
          priority?: string | null
          project_id?: string | null
          reminder_sent?: boolean | null
          source?: string | null
          started_at?: string | null
          status?: string | null
          tags?: string[] | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      user_push_tokens: {
        Row: {
          created_at: string | null
          id: string
          last_used_at: string | null
          platform: string
          token: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          last_used_at?: string | null
          platform: string
          token: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          last_used_at?: string | null
          platform?: string
          token?: string
          user_id?: string
        }
        Relationships: []
      }
      video_generation_queue: {
        Row: {
          attempts: number | null
          completed_at: string | null
          config: Json | null
          created_at: string | null
          error_message: string | null
          id: string
          max_attempts: number | null
          prompt: string | null
          provider: string
          provider_request_id: string | null
          result_feed_item_id: string | null
          result_video_url: string | null
          source_feed_item_id: string | null
          source_image_url: string
          started_at: string | null
          status: string
        }
        Insert: {
          attempts?: number | null
          completed_at?: string | null
          config?: Json | null
          created_at?: string | null
          error_message?: string | null
          id?: string
          max_attempts?: number | null
          prompt?: string | null
          provider?: string
          provider_request_id?: string | null
          result_feed_item_id?: string | null
          result_video_url?: string | null
          source_feed_item_id?: string | null
          source_image_url: string
          started_at?: string | null
          status?: string
        }
        Update: {
          attempts?: number | null
          completed_at?: string | null
          config?: Json | null
          created_at?: string | null
          error_message?: string | null
          id?: string
          max_attempts?: number | null
          prompt?: string | null
          provider?: string
          provider_request_id?: string | null
          result_feed_item_id?: string | null
          result_video_url?: string | null
          source_feed_item_id?: string | null
          source_image_url?: string
          started_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "video_generation_queue_result_feed_item_id_fkey"
            columns: ["result_feed_item_id"]
            isOneToOne: false
            referencedRelation: "feed_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "video_generation_queue_result_feed_item_id_fkey"
            columns: ["result_feed_item_id"]
            isOneToOne: false
            referencedRelation: "feed_items_with_elements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "video_generation_queue_result_feed_item_id_fkey"
            columns: ["result_feed_item_id"]
            isOneToOne: false
            referencedRelation: "feed_items_with_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "video_generation_queue_source_feed_item_id_fkey"
            columns: ["source_feed_item_id"]
            isOneToOne: false
            referencedRelation: "feed_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "video_generation_queue_source_feed_item_id_fkey"
            columns: ["source_feed_item_id"]
            isOneToOne: false
            referencedRelation: "feed_items_with_elements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "video_generation_queue_source_feed_item_id_fkey"
            columns: ["source_feed_item_id"]
            isOneToOne: false
            referencedRelation: "feed_items_with_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      visual_elements: {
        Row: {
          category: string
          created_at: string | null
          description: string | null
          id: string
          is_active: boolean | null
          name: string
          storage_path: string
          tags: string[] | null
          thumbnail_url: string | null
          updated_at: string | null
          usage_count: number | null
        }
        Insert: {
          category?: string
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          storage_path: string
          tags?: string[] | null
          thumbnail_url?: string | null
          updated_at?: string | null
          usage_count?: number | null
        }
        Update: {
          category?: string
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          storage_path?: string
          tags?: string[] | null
          thumbnail_url?: string | null
          updated_at?: string | null
          usage_count?: number | null
        }
        Relationships: []
      }
      web_search_cache: {
        Row: {
          cache_key: string
          created_at: string | null
          id: string
          query: string
          results: Json
          search_type: string
        }
        Insert: {
          cache_key: string
          created_at?: string | null
          id?: string
          query: string
          results: Json
          search_type?: string
        }
        Update: {
          cache_key?: string
          created_at?: string | null
          id?: string
          query?: string
          results?: Json
          search_type?: string
        }
        Relationships: []
      }
      web_search_logs: {
        Row: {
          created_at: string | null
          id: string
          query: string
          result_count: number
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          query: string
          result_count?: number
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          query?: string
          result_count?: number
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      api_maya_memories: {
        Row: {
          content: string | null
          created_at: string | null
          embedding_model: string | null
          embedding_ver: string | null
          expires_at: string | null
          id: number | null
          importance: number | null
          metadata: Json | null
          modality: string | null
          tags: string[] | null
        }
        Insert: {
          content?: string | null
          created_at?: string | null
          embedding_model?: string | null
          embedding_ver?: string | null
          expires_at?: string | null
          id?: number | null
          importance?: number | null
          metadata?: Json | null
          modality?: string | null
          tags?: string[] | null
        }
        Update: {
          content?: string | null
          created_at?: string | null
          embedding_model?: string | null
          embedding_ver?: string | null
          expires_at?: string | null
          id?: number | null
          importance?: number | null
          metadata?: Json | null
          modality?: string | null
          tags?: string[] | null
        }
        Relationships: []
      }
      cron_activity: {
        Row: {
          category: string | null
          completed_at: string | null
          cron_job_id: string | null
          discord_channel_name: string | null
          duration_ms: number | null
          enabled: boolean | null
          error_message: string | null
          execution_id: string | null
          name: string | null
          platform: string | null
          started_at: string | null
          status: string | null
          summary: string | null
        }
        Relationships: []
      }
      feed_items_with_elements: {
        Row: {
          admin_review_notes: string | null
          approved_at: string | null
          content_data: Json | null
          created_at: string | null
          created_by_maya_profile_id: string | null
          error_details: Json | null
          generated_series_data: Json | null
          id: string | null
          is_liked_by_blake: boolean | null
          item_type: string | null
          like_count: number | null
          modifier_instructions: string | null
          original_context: Json | null
          parent_feed_item_id: string | null
          posted_to_platforms: Json | null
          raw_event_id: string | null
          reviewed_at: string | null
          reviewed_by_user_id: string | null
          social_platforms_selected: Json | null
          social_posting_metadata: Json | null
          social_posting_status: string | null
          source_system: string | null
          status: string | null
          updated_at: string | null
          visual_elements_used: Json | null
        }
        Insert: {
          admin_review_notes?: string | null
          approved_at?: string | null
          content_data?: Json | null
          created_at?: string | null
          created_by_maya_profile_id?: string | null
          error_details?: Json | null
          generated_series_data?: Json | null
          id?: string | null
          is_liked_by_blake?: never
          item_type?: string | null
          like_count?: never
          modifier_instructions?: string | null
          original_context?: Json | null
          parent_feed_item_id?: string | null
          posted_to_platforms?: Json | null
          raw_event_id?: string | null
          reviewed_at?: string | null
          reviewed_by_user_id?: string | null
          social_platforms_selected?: Json | null
          social_posting_metadata?: Json | null
          social_posting_status?: string | null
          source_system?: string | null
          status?: string | null
          updated_at?: string | null
          visual_elements_used?: never
        }
        Update: {
          admin_review_notes?: string | null
          approved_at?: string | null
          content_data?: Json | null
          created_at?: string | null
          created_by_maya_profile_id?: string | null
          error_details?: Json | null
          generated_series_data?: Json | null
          id?: string | null
          is_liked_by_blake?: never
          item_type?: string | null
          like_count?: never
          modifier_instructions?: string | null
          original_context?: Json | null
          parent_feed_item_id?: string | null
          posted_to_platforms?: Json | null
          raw_event_id?: string | null
          reviewed_at?: string | null
          reviewed_by_user_id?: string | null
          social_platforms_selected?: Json | null
          social_posting_metadata?: Json | null
          social_posting_status?: string | null
          source_system?: string | null
          status?: string | null
          updated_at?: string | null
          visual_elements_used?: never
        }
        Relationships: [
          {
            foreignKeyName: "feed_items_parent_feed_item_id_fkey"
            columns: ["parent_feed_item_id"]
            isOneToOne: false
            referencedRelation: "feed_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feed_items_parent_feed_item_id_fkey"
            columns: ["parent_feed_item_id"]
            isOneToOne: false
            referencedRelation: "feed_items_with_elements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feed_items_parent_feed_item_id_fkey"
            columns: ["parent_feed_item_id"]
            isOneToOne: false
            referencedRelation: "feed_items_with_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feed_items_raw_event_id_fkey"
            columns: ["raw_event_id"]
            isOneToOne: false
            referencedRelation: "raw_events"
            referencedColumns: ["id"]
          },
        ]
      }
      feed_items_with_profiles: {
        Row: {
          admin_review_notes: string | null
          approved_at: string | null
          content_data: Json | null
          created_at: string | null
          created_by_maya_profile_id: string | null
          creator_profile_avatar_url: string | null
          creator_profile_id: string | null
          creator_profile_name: string | null
          error_details: Json | null
          id: string | null
          item_type: string | null
          original_context: Json | null
          parent_feed_item_id: string | null
          posted_to_platforms: Json | null
          reviewed_at: string | null
          reviewed_by_user_id: string | null
          reviewer_profile_avatar_url: string | null
          reviewer_profile_id: string | null
          reviewer_profile_name: string | null
          source_system: string | null
          status: string | null
          updated_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "feed_items_parent_feed_item_id_fkey"
            columns: ["parent_feed_item_id"]
            isOneToOne: false
            referencedRelation: "feed_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feed_items_parent_feed_item_id_fkey"
            columns: ["parent_feed_item_id"]
            isOneToOne: false
            referencedRelation: "feed_items_with_elements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feed_items_parent_feed_item_id_fkey"
            columns: ["parent_feed_item_id"]
            isOneToOne: false
            referencedRelation: "feed_items_with_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      add_task_from_message: {
        Args: { p_message: string; p_tags?: string[]; p_user_id: string }
        Returns: number
      }
      api_insert_maya_memory: {
        Args: { p_content: string; p_metadata: Json }
        Returns: number
      }
      boost_fact_importance: {
        Args: { p_fact_id: string; p_weight_boost?: number }
        Returns: undefined
      }
      boost_facts_importance_batch: {
        Args: { p_fact_ids: string[]; p_weight_boost?: number }
        Returns: undefined
      }
      bytea_to_text: { Args: { data: string }; Returns: string }
      calculate_importance_score: {
        Args: {
          p_confidence: number
          p_decay_rate: number
          p_first_seen: string
          p_last_mentioned: string
          p_mention_count: number
        }
        Returns: number
      }
      calculate_temporal_score: {
        Args: {
          p_created_at: string
          p_frequency_weight?: number
          p_importance?: number
          p_importance_weight?: number
          p_last_referenced_at: string
          p_recency_weight?: number
          p_reference_count: number
        }
        Returns: number
      }
      calculate_time_weight: {
        Args: {
          p_created_at: string
          p_half_life_hours?: number
          p_last_referenced_at: string
        }
        Returns: number
      }
      cleanup_old_search_cache: { Args: never; Returns: undefined }
      cleanup_old_social_posts: { Args: never; Returns: undefined }
      copy_embeddings_for_similar_memories: { Args: never; Returns: string }
      create_entity_link: {
        Args: {
          p_context?: string
          p_link_type: Database["public"]["Enums"]["relationship_type"]
          p_metadata?: Json
          p_source_entity_id: string
          p_source_entity_type: string
          p_target_entity_id: string
          p_target_entity_type: string
        }
        Returns: string
      }
      decay_working_memory: { Args: never; Returns: number }
      enhanced_time_weighted_memory_search: {
        Args: {
          half_life_hours?: number
          lambda?: number
          max_results?: number
          p_user_id: string
          query_embedding: string
          reference_boost?: number
          similarity_threshold?: number
        }
        Returns: {
          combined_score: number
          content: string
          created_at: string
          id: number
          last_referenced_at: string
          metadata: Json
          reference_count: number
          reference_score: number
          similarity: number
          time_weight: number
        }[]
      }
      expire_old_engagement_queue_items: { Args: never; Returns: undefined }
      extract_core_facts: {
        Args: { content: string }
        Returns: {
          category: string
          object: string
          predicate: string
          subject: string
        }[]
      }
      extract_simple_facts: {
        Args: { content: string }
        Returns: {
          object: string
          predicate: string
          subject: string
        }[]
      }
      extract_tasks: {
        Args: { message: string }
        Returns: {
          due_date: string
          task_text: string
        }[]
      }
      find_related_entities: {
        Args: {
          p_entity_id: string
          p_entity_type: string
          p_relationship_types?: Database["public"]["Enums"]["relationship_type"][]
        }
        Returns: {
          created_at: string
          entity_data: Json
          entity_id: string
          entity_type: string
          link_context: string
          link_id: string
          link_type: Database["public"]["Enums"]["relationship_type"]
        }[]
      }
      find_similar_fact: {
        Args: {
          p_content: string
          p_similarity_threshold?: number
          p_user_id: string
        }
        Returns: {
          content: string
          id: string
          is_permanent: boolean
          similarity: number
          weight: number
        }[]
      }
      find_similar_ideas: {
        Args: {
          max_results?: number
          query_embedding: string
          similarity_threshold?: number
        }
        Returns: {
          content: string
          created_at: string
          id: string
          metadata: Json
          similarity: number
        }[]
      }
      find_tasks_fuzzy: {
        Args: { p_query: string; p_user_id: string }
        Returns: {
          content: string
          due_at: string
          id: number
          priority: string
          rank: number
          status: string
        }[]
      }
      generate_cohere_embedding: {
        Args: { text_content: string }
        Returns: number[]
      }
      generate_content_tags: {
        Args: { content_text: string }
        Returns: string[]
      }
      generate_conversation_id: { Args: never; Returns: string }
      generate_slug: { Args: { input_text: string }; Returns: string }
      get_core_facts_weighted: {
        Args: { match_count?: number }
        Returns: {
          category: string
          id: string
          object: string
          predicate: string
          subject: string
          weight: number
        }[]
      }
      get_embedding_stats: {
        Args: never
        Returns: {
          percentage: number
          records_with_embeddings: number
          table_name: string
          total_records: number
        }[]
      }
      get_entity_links: {
        Args: { p_entity_id: string; p_entity_type: string }
        Returns: {
          context: string
          created_at: string
          link_id: string
          link_type: Database["public"]["Enums"]["relationship_type"]
          metadata: Json
          source_entity_id: string
          source_entity_type: string
          target_entity_id: string
          target_entity_type: string
        }[]
      }
      get_fact_statistics: {
        Args: { p_user_id: string }
        Returns: {
          avg_weight: number
          most_referenced_fact: string
          permanent_facts: number
          total_facts: number
          total_references: number
        }[]
      }
      get_most_recent_task: {
        Args: { p_user_id: string }
        Returns: {
          content: string
          due_at: string
          id: number
          priority: string
          status: string
        }[]
      }
      get_pending_reminders: {
        Args: { check_time?: string }
        Returns: {
          content: string
          metadata: Json
          priority: string
          remind_at: string
          reminder_id: string
          reminder_type: string
          title: string
          user_id: string
        }[]
      }
      get_permanent_facts: {
        Args: { max_results?: number; p_user_id: string }
        Returns: {
          content: string
          created_at: string
          fact_type: string
          id: string
          last_mentioned_at: string
          object: string
          predicate: string
          reference_count: number
          subject: string
          weight: number
        }[]
      }
      get_permanent_facts_v2: {
        Args: { max_results?: number; p_user_id: string }
        Returns: {
          content: string
          fact_type: string
          id: string
          last_mentioned_at: string
          object: string
          predicate: string
          reference_count: number
          subject: string
          weight: number
        }[]
      }
      get_prompt_package: {
        Args: { p_model: string; p_theme: string }
        Returns: Json
      }
      get_prompt_pool:
        | { Args: never; Returns: Json }
        | { Args: { p_theme?: string }; Returns: Json }
      get_recent_episodes: {
        Args: {
          days_back?: number
          episode_type_filter?: string
          max_results?: number
          p_user_id: string
        }
        Returns: {
          days_ago: number
          emotional_arc: Json
          end_time: string
          episode_type: string
          id: string
          key_events: Json
          start_time: string
          summary: string
          topics: string[]
        }[]
      }
      get_recent_reflections: {
        Args: {
          days_back?: number
          max_results?: number
          p_user_id: string
          reflection_type_filter?: string
        }
        Returns: {
          days_ago: number
          id: string
          improvements: Json
          mistakes_noted: Json
          patterns_identified: Json
          reflection_date: string
          reflection_type: string
          response_quality_score: number
          self_critique: string
          strengths_noted: Json
        }[]
      }
      get_reflection_for_date: {
        Args: {
          p_user_id: string
          reflection_type_filter?: string
          target_date: string
        }
        Returns: {
          id: string
          improvements: Json
          mistakes_noted: Json
          patterns_identified: Json
          reflection_type: string
          self_critique: string
          strengths_noted: Json
        }[]
      }
      get_related_facts: {
        Args: { k?: number; p_user_id: string; query: string }
        Returns: {
          expires_at: string
          id: string
          object: string
          predicate: string
          source_ref: Json
          subject: string
          ts: string
          user_display_name: string
          user_id: string
          weight: number
        }[]
      }
      get_semantic_related_facts: {
        Args: {
          p_embedding: string
          p_k?: number
          p_query: string
          p_similarity_threshold?: number
          p_user_id: string
        }
        Returns: {
          expires_at: string
          id: string
          object: string
          predicate: string
          similarity: number
          source_ref: Json
          subject: string
          ts: string
          user_display_name: string
          user_id: string
          weight: number
        }[]
      }
      get_semantic_related_facts_1024: {
        Args: {
          p_embedding: string
          p_k?: number
          p_query: string
          p_similarity_threshold?: number
          p_user_id: string
        }
        Returns: {
          embedding: string
          embedding_model: string
          embedding_ver: string
          expires_at: string
          id: string
          object: string
          predicate: string
          similarity: number
          source_ref: Json
          subject: string
          ts: string
          user_display_name: string
          user_id: string
          weight: number
        }[]
      }
      get_session_facts: {
        Args: { max_results?: number; p_hours?: number; p_user_id: string }
        Returns: {
          content: string
          fact_type: string
          hours_ago: number
          id: string
          is_permanent: boolean
          last_mentioned_at: string
          object: string
          predicate: string
          reference_count: number
          subject: string
          weight: number
        }[]
      }
      get_session_memories: {
        Args: { max_results?: number; p_hours?: number; p_user_id: string }
        Returns: {
          content: string
          created_at: string
          hours_ago: number
          id: number
          reference_count: number
        }[]
      }
      get_social_engagement_stats: {
        Args: { p_user_id: string }
        Returns: {
          avg_importance_score: number
          pending_approvals: number
          top_topics: string[]
          total_actions_executed: number
          total_posts_collected: number
        }[]
      }
      get_working_memory: {
        Args: { p_limit?: number; p_user_id: string }
        Returns: {
          confidence: number
          id: string
          importance_score: number
          key: string
          last_mentioned: string
          memory_type: string
          mention_count: number
          metadata: Json
          value: string
        }[]
      }
      hash_password: { Args: { password: string }; Returns: string }
      http: {
        Args: { request: Database["public"]["CompositeTypes"]["http_request"] }
        Returns: Database["public"]["CompositeTypes"]["http_response"]
        SetofOptions: {
          from: "http_request"
          to: "http_response"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      http_delete:
        | {
            Args: { uri: string }
            Returns: Database["public"]["CompositeTypes"]["http_response"]
            SetofOptions: {
              from: "*"
              to: "http_response"
              isOneToOne: true
              isSetofReturn: false
            }
          }
        | {
            Args: { content: string; content_type: string; uri: string }
            Returns: Database["public"]["CompositeTypes"]["http_response"]
            SetofOptions: {
              from: "*"
              to: "http_response"
              isOneToOne: true
              isSetofReturn: false
            }
          }
      http_get:
        | {
            Args: { uri: string }
            Returns: Database["public"]["CompositeTypes"]["http_response"]
            SetofOptions: {
              from: "*"
              to: "http_response"
              isOneToOne: true
              isSetofReturn: false
            }
          }
        | {
            Args: { data: Json; uri: string }
            Returns: Database["public"]["CompositeTypes"]["http_response"]
            SetofOptions: {
              from: "*"
              to: "http_response"
              isOneToOne: true
              isSetofReturn: false
            }
          }
      http_head: {
        Args: { uri: string }
        Returns: Database["public"]["CompositeTypes"]["http_response"]
        SetofOptions: {
          from: "*"
          to: "http_response"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      http_header: {
        Args: { field: string; value: string }
        Returns: Database["public"]["CompositeTypes"]["http_header"]
        SetofOptions: {
          from: "*"
          to: "http_header"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      http_list_curlopt: {
        Args: never
        Returns: {
          curlopt: string
          value: string
        }[]
      }
      http_patch: {
        Args: { content: string; content_type: string; uri: string }
        Returns: Database["public"]["CompositeTypes"]["http_response"]
        SetofOptions: {
          from: "*"
          to: "http_response"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      http_post:
        | {
            Args: { content: string; content_type: string; uri: string }
            Returns: Database["public"]["CompositeTypes"]["http_response"]
            SetofOptions: {
              from: "*"
              to: "http_response"
              isOneToOne: true
              isSetofReturn: false
            }
          }
        | {
            Args: { data: Json; uri: string }
            Returns: Database["public"]["CompositeTypes"]["http_response"]
            SetofOptions: {
              from: "*"
              to: "http_response"
              isOneToOne: true
              isSetofReturn: false
            }
          }
      http_put: {
        Args: { content: string; content_type: string; uri: string }
        Returns: Database["public"]["CompositeTypes"]["http_response"]
        SetofOptions: {
          from: "*"
          to: "http_response"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      http_reset_curlopt: { Args: never; Returns: boolean }
      http_set_curlopt: {
        Args: { curlopt: string; value: string }
        Returns: boolean
      }
      increment_memory_reference: {
        Args: { memory_id: number }
        Returns: undefined
      }
      increment_memory_references_batch: {
        Args: { memory_ids: number[] }
        Returns: undefined
      }
      increment_tag_stat: { Args: { tag_slug: string }; Returns: undefined }
      increment_thought_reference: {
        Args: { thought_id: string }
        Returns: undefined
      }
      insert_mobile_memory_direct: {
        Args: { p_content: string; p_user_id: string; p_user_name?: string }
        Returns: number
      }
      invoke_embedding_generator: { Args: never; Returns: Json }
      invoke_process_memory_queue: { Args: never; Returns: Json }
      mark_fact_permanent:
        | {
            Args: { p_fact_id: string; p_fact_type?: string }
            Returns: undefined
          }
        | {
            Args: { p_fact_id: string; p_fact_type?: string }
            Returns: undefined
          }
      mark_facts_for_embedding: {
        Args: { batch_size?: number }
        Returns: {
          embedding_text: string
          id: string
          object: string
          predicate: string
          subject: string
        }[]
      }
      mark_memories_for_embedding: {
        Args: { batch_size?: number }
        Returns: {
          count: number
          memory_ids: number[]
        }[]
      }
      mark_reminder_sent: { Args: { reminder_uuid: string }; Returns: boolean }
      match_core_facts_hybrid: {
        Args: {
          fact_weight_weight?: number
          match_count?: number
          min_similarity?: number
          query_embedding: string
          similarity_weight?: number
        }
        Returns: {
          category: string
          combined_score: number
          id: string
          object: string
          predicate: string
          similarity: number
          subject: string
          weight: number
        }[]
      }
      match_documents:
        | {
            Args: {
              filter?: Json
              match_count?: number
              query_embedding: string
            }
            Returns: {
              content: string
              id: number
              metadata: Json
              similarity: number
            }[]
          }
        | {
            Args: {
              match_count: number
              match_threshold: number
              query_embedding: string
            }
            Returns: {
              content: string
              id: number
              metadata: Json
              similarity: number
            }[]
          }
      match_documents_facts:
        | {
            Args: {
              filter?: Json
              match_count: number
              query_embedding: string
            }
            Returns: {
              content: string
              id: string
              metadata: Json
              similarity: number
            }[]
          }
        | {
            Args: {
              match_count?: number
              match_threshold?: number
              query_embedding: string
            }
            Returns: {
              content: string
              embedding: string
              id: string
              metadata: Json
              similarity: number
            }[]
          }
      match_documents_memories:
        | {
            Args: {
              filter?: Json
              match_count: number
              query_embedding: string
            }
            Returns: {
              content: string
              id: number
              metadata: Json
              similarity: number
            }[]
          }
        | {
            Args: {
              match_count?: number
              match_threshold?: number
              query_embedding: string
            }
            Returns: {
              content: string
              embedding: string
              id: number
              metadata: Json
              similarity: number
            }[]
          }
      match_episodes: {
        Args: {
          episode_type_filter?: string
          match_count?: number
          match_threshold?: number
          p_user_id: string
          query_embedding: string
        }
        Returns: {
          emotional_arc: Json
          end_time: string
          episode_type: string
          id: string
          key_events: Json
          similarity: number
          start_time: string
          summary: string
          topics: string[]
        }[]
      }
      match_facts:
        | {
            Args: {
              match_count: number
              match_threshold: number
              query_embedding: string
              user_id_param: string
            }
            Returns: {
              id: string
              object: string
              predicate: string
              similarity: number
              subject: string
            }[]
          }
        | {
            Args: {
              match_count: number
              match_threshold: number
              query_embedding: string
              user_id_param: string
            }
            Returns: {
              id: string
              object: string
              predicate: string
              similarity: number
              subject: string
              user_id: string
              weight: number
            }[]
          }
      match_facts_hybrid_v2: {
        Args: {
          importance_weight?: number
          keyword_weight?: number
          match_count?: number
          min_score?: number
          p_keyword_query?: string
          p_user_id: string
          query_embedding: string
          recency_weight?: number
          vector_weight?: number
        }
        Returns: {
          combined_score: number
          content: string
          fact_type: string
          id: string
          is_permanent: boolean
          last_mentioned_at: string
          object: string
          predicate: string
          reference_count: number
          similarity: number
          subject: string
          weight: number
        }[]
      }
      match_memories:
        | {
            Args: {
              match_count: number
              match_threshold: number
              query_embedding: string
            }
            Returns: {
              content: string
              id: string
              metadata: Json
              similarity: number
            }[]
          }
        | {
            Args: {
              match_count: number
              match_threshold: number
              query_embedding: string
              user_id_param: string
            }
            Returns: {
              content: string
              id: number
              metadata: Json
              similarity: number
            }[]
          }
      match_user_facts_hybrid: {
        Args: {
          fact_weight_factor?: number
          match_count?: number
          min_similarity?: number
          p_user_id: string
          permanence_boost?: number
          query_embedding: string
          similarity_weight?: number
        }
        Returns: {
          combined_score: number
          content: string
          fact_type: string
          id: string
          is_permanent: boolean
          object: string
          predicate: string
          reference_count: number
          similarity: number
          subject: string
          user_id: string
          weight: number
        }[]
      }
      process_embeddings_for_memories: { Args: never; Returns: string }
      process_memory_queue_batch: { Args: never; Returns: string }
      process_memory_queue_batch_with_embeddings: {
        Args: never
        Returns: string
      }
      random_vector: { Args: { dimensions: number }; Returns: string }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      store_mobile_memory: {
        Args: {
          p_content: string
          p_tags?: string[]
          p_user_id: string
          p_user_name?: string
        }
        Returns: number
      }
      table_exists: {
        Args: { schema: string; tablename: string }
        Returns: boolean
      }
      tag_message: { Args: { msg: string }; Returns: string[] }
      test_fact_query: {
        Args: { user_id_param: string }
        Returns: {
          embedding_model: string
          has_embedding: boolean
          id: string
          object: string
          predicate: string
          subject: string
          user_id: string
          weight: number
        }[]
      }
      test_facts_query: {
        Args: { p_user_id: string }
        Returns: {
          object: string
          predicate: string
          source_ref: Json
          subject: string
          user_info: Json
          weight: number
        }[]
      }
      text_to_bytea: { Args: { data: string }; Returns: string }
      time_weighted_memory_search: {
        Args: {
          half_life_hours?: number
          lambda?: number
          max_results?: number
          query_embedding: string
        }
        Returns: {
          combined_score: number
          content: string
          created_at: string
          id: number
          metadata: Json
          similarity: number
          time_weight: number
        }[]
      }
      touch_fact: { Args: { p_fact_id: string }; Returns: undefined }
      update_fact_with_embedding: {
        Args: {
          embedding_vector: string
          fact_id: string
          model_name?: string
          model_version?: string
        }
        Returns: undefined
      }
      update_memory_with_embedding: {
        Args: {
          memory_id: number
          p_embedding: string
          p_model?: string
          p_version?: string
        }
        Returns: boolean
      }
      update_relationship_strength: {
        Args: { p_delta: number; p_entity_a_id: string; p_entity_b_id: string }
        Returns: undefined
      }
      update_website_chat_window: { Args: never; Returns: undefined }
      upsert_working_memory: {
        Args: {
          p_confidence?: number
          p_decay_rate?: number
          p_key: string
          p_memory_type: string
          p_metadata?: Json
          p_user_id: string
          p_value: string
        }
        Returns: string
      }
      urlencode:
        | { Args: { data: Json }; Returns: string }
        | {
            Args: { string: string }
            Returns: {
              error: true
            } & "Could not choose the best candidate function between: public.urlencode(string => bytea), public.urlencode(string => varchar). Try renaming the parameters or the function itself in the database so function overloading can be resolved"
          }
        | {
            Args: { string: string }
            Returns: {
              error: true
            } & "Could not choose the best candidate function between: public.urlencode(string => bytea), public.urlencode(string => varchar). Try renaming the parameters or the function itself in the database so function overloading can be resolved"
          }
      validate_rrule: { Args: { rrule_string: string }; Returns: boolean }
    }
    Enums: {
      memory_type:
        | "conversation"
        | "experience"
        | "knowledge"
        | "relationship"
        | "idea"
        | "assistant"
      message_type: "user" | "assistant" | "memory" | "knowledge"
      relationship_type:
        | "friend"
        | "acquaintance"
        | "mentor"
        | "student"
        | "creates"
        | "spawns"
        | "references"
        | "blocks_for"
        | "reminds_about"
        | "follows_up"
        | "depends_on"
        | "similar_to"
        | "part_of"
        | "context_for"
    }
    CompositeTypes: {
      http_header: {
        field: string | null
        value: string | null
      }
      http_request: {
        method: unknown
        uri: string | null
        headers: Database["public"]["CompositeTypes"]["http_header"][] | null
        content_type: string | null
        content: string | null
      }
      http_response: {
        status: number | null
        content_type: string | null
        headers: Database["public"]["CompositeTypes"]["http_header"][] | null
        content: string | null
      }
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      memory_type: [
        "conversation",
        "experience",
        "knowledge",
        "relationship",
        "idea",
        "assistant",
      ],
      message_type: ["user", "assistant", "memory", "knowledge"],
      relationship_type: [
        "friend",
        "acquaintance",
        "mentor",
        "student",
        "creates",
        "spawns",
        "references",
        "blocks_for",
        "reminds_about",
        "follows_up",
        "depends_on",
        "similar_to",
        "part_of",
        "context_for",
      ],
    },
  },
} as const

