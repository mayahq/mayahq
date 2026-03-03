export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
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
            referencedRelation: "feed_items_with_profiles"
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
          original_context: Json | null
          parent_feed_item_id: string | null
          posted_to_platforms: Json | null
          reviewed_at: string | null
          reviewed_by_user_id: string | null
          source_system: string
          status: string
          updated_at: string
        }
        Insert: {
          admin_review_notes?: string | null
          approved_at?: string | null
          content_data: Json
          created_at?: string
          created_by_maya_profile_id: string
          error_details?: Json | null
          generated_series_data?: Json | null
          id?: string
          item_type: string
          original_context?: Json | null
          parent_feed_item_id?: string | null
          posted_to_platforms?: Json | null
          reviewed_at?: string | null
          reviewed_by_user_id?: string | null
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
          original_context?: Json | null
          parent_feed_item_id?: string | null
          posted_to_platforms?: Json | null
          reviewed_at?: string | null
          reviewed_by_user_id?: string | null
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
            referencedRelation: "feed_items_with_profiles"
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
      images: {
        Row: {
          created_at: string | null
          id: number
          image_url: string | null
          prompt: string | null
          source: string | null
        }
        Insert: {
          created_at?: string | null
          id?: number
          image_url?: string | null
          prompt?: string | null
          source?: string | null
        }
        Update: {
          created_at?: string | null
          id?: number
          image_url?: string | null
          prompt?: string | null
          source?: string | null
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
      maya_facts: {
        Row: {
          content: string | null
          embedding: string | null
          embedding_model: string | null
          embedding_ver: string | null
          expires_at: string | null
          id: string
          object: string
          predicate: string
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
          id?: string
          object: string
          predicate: string
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
          id?: string
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
          metadata: Json | null
          modality: string | null
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
          metadata?: Json | null
          modality?: string | null
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
          metadata?: Json | null
          modality?: string | null
          tags?: string[] | null
        }
        Relationships: []
      }
      maya_mood_activity: {
        Row: {
          created_at: string | null
          error_message: string | null
          id: string
          internal_thought: string | null
          message_id: string | null
          metadata: Json | null
          mood: string
          output_message_content: string | null
          target_room_id: string | null
        }
        Insert: {
          created_at?: string | null
          error_message?: string | null
          id?: string
          internal_thought?: string | null
          message_id?: string | null
          metadata?: Json | null
          mood: string
          output_message_content?: string | null
          target_room_id?: string | null
        }
        Update: {
          created_at?: string | null
          error_message?: string | null
          id?: string
          internal_thought?: string | null
          message_id?: string | null
          metadata?: Json | null
          mood?: string
          output_message_content?: string | null
          target_room_id?: string | null
        }
        Relationships: []
      }
      maya_prompts: {
        Row: {
          aspect_ratio: string | null
          created_at: string | null
          guidance_scale: number | null
          id: string
          image_url: string | null
          lora_scale: number | null
          message: string | null
          model: string | null
          negative_prompt: string | null
          num_inference_steps: number | null
          priority: number | null
          prompt: string
          source: string | null
          status: string
          tags: string[] | null
          theme: string | null
          updated_at: string | null
          used_at: string | null
        }
        Insert: {
          aspect_ratio?: string | null
          created_at?: string | null
          guidance_scale?: number | null
          id?: string
          image_url?: string | null
          lora_scale?: number | null
          message?: string | null
          model?: string | null
          negative_prompt?: string | null
          num_inference_steps?: number | null
          priority?: number | null
          prompt: string
          source?: string | null
          status?: string
          tags?: string[] | null
          theme?: string | null
          updated_at?: string | null
          used_at?: string | null
        }
        Update: {
          aspect_ratio?: string | null
          created_at?: string | null
          guidance_scale?: number | null
          id?: string
          image_url?: string | null
          lora_scale?: number | null
          message?: string | null
          model?: string | null
          negative_prompt?: string | null
          num_inference_steps?: number | null
          priority?: number | null
          prompt?: string
          source?: string | null
          status?: string
          tags?: string[] | null
          theme?: string | null
          updated_at?: string | null
          used_at?: string | null
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
      missing_env_vars: {
        Row: {
          created_at: string | null
          description: string
          name: string
        }
        Insert: {
          created_at?: string | null
          description: string
          name: string
        }
        Update: {
          created_at?: string | null
          description?: string
          name?: string
        }
        Relationships: []
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
          cover_image: string | null
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          published_at: string | null
          reading_time: number | null
          slug: string
          status: string | null
          tags: string[] | null
          title: string
          updated_at: string
        }
        Insert: {
          body: string
          cover_image?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          published_at?: string | null
          reading_time?: number | null
          slug: string
          status?: string | null
          tags?: string[] | null
          title: string
          updated_at?: string
        }
        Update: {
          body?: string
          cover_image?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          published_at?: string | null
          reading_time?: number | null
          slug?: string
          status?: string | null
          tags?: string[] | null
          title?: string
          updated_at?: string
        }
        Relationships: []
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
      prompt_chunks: {
        Row: {
          category: string
          items: string[]
        }
        Insert: {
          category: string
          items: string[]
        }
        Update: {
          category?: string
          items?: string[]
        }
        Relationships: []
      }
      prompt_elements: {
        Row: {
          category: string
          element: string
          id: number
          is_nsfw: boolean
        }
        Insert: {
          category: string
          element: string
          id?: number
          is_nsfw?: boolean
        }
        Update: {
          category?: string
          element?: string
          id?: number
          is_nsfw?: boolean
        }
        Relationships: []
      }
      prompt_model_config: {
        Row: {
          default_params: Json
          identity_token: string
          include_negative_in_prompt: boolean
          model: string
          version: string
        }
        Insert: {
          default_params: Json
          identity_token: string
          include_negative_in_prompt?: boolean
          model: string
          version: string
        }
        Update: {
          default_params?: Json
          identity_token?: string
          include_negative_in_prompt?: boolean
          model?: string
          version?: string
        }
        Relationships: []
      }
      prompt_theme_chunks: {
        Row: {
          category: string
          items: string[]
          theme: string
        }
        Insert: {
          category: string
          items: string[]
          theme: string
        }
        Update: {
          category?: string
          items?: string[]
          theme?: string
        }
        Relationships: []
      }
      prompts: {
        Row: {
          created_at: string | null
          id: number
          negative_prompt: string | null
          prompt_text: string
          tags: string | null
        }
        Insert: {
          created_at?: string | null
          id?: number
          negative_prompt?: string | null
          prompt_text: string
          tags?: string | null
        }
        Update: {
          created_at?: string | null
          id?: number
          negative_prompt?: string | null
          prompt_text?: string
          tags?: string | null
        }
        Relationships: []
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
          completed_at: string | null
          content: string
          created_at: string | null
          due_at: string | null
          id: number
          note: string | null
          priority: string | null
          reminder_sent: boolean | null
          status: string | null
          tags: string[] | null
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          content: string
          created_at?: string | null
          due_at?: string | null
          id?: number
          note?: string | null
          priority?: string | null
          reminder_sent?: boolean | null
          status?: string | null
          tags?: string[] | null
          user_id: string
        }
        Update: {
          completed_at?: string | null
          content?: string
          created_at?: string | null
          due_at?: string | null
          id?: number
          note?: string | null
          priority?: string | null
          reminder_sent?: boolean | null
          status?: string | null
          tags?: string[] | null
          user_id?: string
        }
        Relationships: []
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
        Relationships: []
      }
    }
    Functions: {
      add_task_from_message: {
        Args: { p_message: string; p_user_id: string; p_tags?: string[] }
        Returns: number
      }
      api_insert_maya_memory: {
        Args: { p_content: string; p_metadata: Json }
        Returns: number
      }
      bytea_to_text: {
        Args: { data: string }
        Returns: string
      }
      copy_embeddings_for_similar_memories: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
      extract_core_facts: {
        Args: { content: string }
        Returns: {
          subject: string
          predicate: string
          object: string
          category: string
        }[]
      }
      extract_simple_facts: {
        Args: { content: string }
        Returns: {
          subject: string
          predicate: string
          object: string
        }[]
      }
      extract_tasks: {
        Args: { message: string }
        Returns: {
          task_text: string
          due_date: string
        }[]
      }
      find_similar_ideas: {
        Args: {
          query_embedding: string
          similarity_threshold?: number
          max_results?: number
        }
        Returns: {
          id: string
          content: string
          similarity: number
          metadata: Json
          created_at: string
        }[]
      }
      find_tasks_fuzzy: {
        Args: { p_user_id: string; p_query: string }
        Returns: {
          id: number
          content: string
          status: string
          priority: string
          due_at: string
          rank: number
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
      generate_conversation_id: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
      get_embedding_stats: {
        Args: Record<PropertyKey, never>
        Returns: {
          table_name: string
          total_records: number
          records_with_embeddings: number
          percentage: number
        }[]
      }
      get_most_recent_task: {
        Args: { p_user_id: string }
        Returns: {
          id: number
          content: string
          status: string
          priority: string
          due_at: string
        }[]
      }
      get_prompt_package: {
        Args: { p_theme: string; p_model: string }
        Returns: Json
      }
      get_prompt_pool: {
        Args: Record<PropertyKey, never> | { p_theme?: string }
        Returns: Json
      }
      get_related_facts: {
        Args: { p_user_id: string; query: string; k?: number }
        Returns: {
          id: string
          user_id: string
          subject: string
          predicate: string
          object: string
          weight: number
          source_ref: Json
          ts: string
          expires_at: string
          user_display_name: string
        }[]
      }
      get_semantic_related_facts: {
        Args: {
          p_user_id: string
          p_query: string
          p_embedding: string
          p_k?: number
          p_similarity_threshold?: number
        }
        Returns: {
          id: string
          user_id: string
          subject: string
          predicate: string
          object: string
          weight: number
          source_ref: Json
          ts: string
          expires_at: string
          similarity: number
          user_display_name: string
        }[]
      }
      get_semantic_related_facts_1024: {
        Args: {
          p_user_id: string
          p_query: string
          p_embedding: string
          p_k?: number
          p_similarity_threshold?: number
        }
        Returns: {
          id: string
          user_id: string
          subject: string
          predicate: string
          object: string
          weight: number
          source_ref: Json
          ts: string
          expires_at: string
          embedding: string
          embedding_model: string
          embedding_ver: string
          similarity: number
          user_display_name: string
        }[]
      }
      gtrgm_compress: {
        Args: { "": unknown }
        Returns: unknown
      }
      gtrgm_decompress: {
        Args: { "": unknown }
        Returns: unknown
      }
      gtrgm_in: {
        Args: { "": unknown }
        Returns: unknown
      }
      gtrgm_options: {
        Args: { "": unknown }
        Returns: undefined
      }
      gtrgm_out: {
        Args: { "": unknown }
        Returns: unknown
      }
      hash_password: {
        Args: { password: string }
        Returns: string
      }
      http: {
        Args: { request: Database["public"]["CompositeTypes"]["http_request"] }
        Returns: unknown
      }
      http_delete: {
        Args:
          | { uri: string }
          | { uri: string; content: string; content_type: string }
        Returns: unknown
      }
      http_get: {
        Args: { uri: string } | { uri: string; data: Json }
        Returns: unknown
      }
      http_head: {
        Args: { uri: string }
        Returns: unknown
      }
      http_header: {
        Args: { field: string; value: string }
        Returns: Database["public"]["CompositeTypes"]["http_header"]
      }
      http_list_curlopt: {
        Args: Record<PropertyKey, never>
        Returns: {
          curlopt: string
          value: string
        }[]
      }
      http_patch: {
        Args: { uri: string; content: string; content_type: string }
        Returns: unknown
      }
      http_post: {
        Args:
          | { uri: string; content: string; content_type: string }
          | { uri: string; data: Json }
        Returns: unknown
      }
      http_put: {
        Args: { uri: string; content: string; content_type: string }
        Returns: unknown
      }
      http_reset_curlopt: {
        Args: Record<PropertyKey, never>
        Returns: boolean
      }
      http_set_curlopt: {
        Args: { curlopt: string; value: string }
        Returns: boolean
      }
      increment_tag_stat: {
        Args: { tag_slug: string }
        Returns: undefined
      }
      insert_mobile_memory_direct: {
        Args: { p_content: string; p_user_id: string; p_user_name?: string }
        Returns: number
      }
      invoke_embedding_generator: {
        Args: Record<PropertyKey, never>
        Returns: Json
      }
      invoke_process_memory_queue: {
        Args: Record<PropertyKey, never>
        Returns: Json
      }
      mark_facts_for_embedding: {
        Args: { batch_size?: number }
        Returns: {
          id: string
          subject: string
          predicate: string
          object: string
          embedding_text: string
        }[]
      }
      mark_memories_for_embedding: {
        Args: { batch_size?: number }
        Returns: {
          memory_ids: number[]
          count: number
        }[]
      }
      match_documents: {
        Args:
          | { query_embedding: string; match_count?: number; filter?: Json }
          | {
              query_embedding: string
              match_threshold: number
              match_count: number
            }
        Returns: {
          id: number
          content: string
          metadata: Json
          similarity: number
        }[]
      }
      match_documents_facts: {
        Args:
          | { query_embedding: string; match_count: number; filter?: Json }
          | {
              query_embedding: string
              match_threshold?: number
              match_count?: number
            }
        Returns: {
          id: string
          content: string
          metadata: Json
          embedding: string
          similarity: number
        }[]
      }
      match_documents_memories: {
        Args:
          | { query_embedding: string; match_count: number; filter?: Json }
          | {
              query_embedding: string
              match_threshold?: number
              match_count?: number
            }
        Returns: {
          id: number
          content: string
          metadata: Json
          embedding: string
          similarity: number
        }[]
      }
      match_facts: {
        Args:
          | {
              query_embedding: string
              match_threshold: number
              match_count: number
              user_id_param: string
            }
          | {
              query_embedding: string
              match_threshold: number
              match_count: number
              user_id_param: string
            }
        Returns: {
          id: string
          subject: string
          predicate: string
          object: string
          similarity: number
        }[]
      }
      match_memories: {
        Args:
          | {
              query_embedding: string
              match_threshold: number
              match_count: number
            }
          | {
              query_embedding: string
              match_threshold: number
              match_count: number
              user_id_param: string
            }
        Returns: {
          id: number
          content: string
          metadata: Json
          similarity: number
        }[]
      }
      process_embeddings_for_memories: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
      process_memory_queue_batch: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
      process_memory_queue_batch_with_embeddings: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
      random_vector: {
        Args: { dimensions: number }
        Returns: string
      }
      set_limit: {
        Args: { "": number }
        Returns: number
      }
      show_limit: {
        Args: Record<PropertyKey, never>
        Returns: number
      }
      show_trgm: {
        Args: { "": string }
        Returns: string[]
      }
      store_mobile_memory: {
        Args: {
          p_content: string
          p_user_id: string
          p_user_name?: string
          p_tags?: string[]
        }
        Returns: number
      }
      table_exists: {
        Args: { schema: string; tablename: string }
        Returns: boolean
      }
      tag_message: {
        Args: { msg: string }
        Returns: string[]
      }
      test_fact_query: {
        Args: { user_id_param: string }
        Returns: {
          id: string
          user_id: string
          subject: string
          predicate: string
          object: string
          weight: number
          has_embedding: boolean
          embedding_model: string
        }[]
      }
      test_facts_query: {
        Args: { p_user_id: string }
        Returns: {
          subject: string
          predicate: string
          object: string
          weight: number
          source_ref: Json
          user_info: Json
        }[]
      }
      text_to_bytea: {
        Args: { data: string }
        Returns: string
      }
      update_fact_with_embedding: {
        Args: {
          fact_id: string
          embedding_vector: string
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
        Args: { p_entity_a_id: string; p_entity_b_id: string; p_delta: number }
        Returns: undefined
      }
      update_website_chat_window: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      urlencode: {
        Args: { data: Json } | { string: string } | { string: string }
        Returns: string
      }
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
      relationship_type: "friend" | "acquaintance" | "mentor" | "student"
    }
    CompositeTypes: {
      http_header: {
        field: string | null
        value: string | null
      }
      http_request: {
        method: unknown | null
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

type DefaultSchema = Database[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof (Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        Database[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? (Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      Database[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
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
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
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
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
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
    | { schema: keyof Database },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof Database },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof Database }
  ? Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
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
      relationship_type: ["friend", "acquaintance", "mentor", "student"],
    },
  },
} as const

// Common table type aliases
export type Profile = Tables<'profiles'>;
export type FeedItem = Tables<'feed_items'>;
export type FeedItemLike = Tables<'feed_item_likes'>;
export type FeedItemComment = Tables<'feed_item_comments'>;
export type Message = Tables<'messages'>;
export type Room = Tables<'rooms'>;
export type MayaMemory = Tables<'maya_memories'>; // Renamed to avoid conflict with global Memory
export type MayaFact = Tables<'maya_facts'>; // Renamed to avoid conflict
export type CoreFact = Tables<'maya_core_facts'>;
export type Task = Tables<'tasks'>;
export type DailyReport = Tables<'daily_reports'>;
export type ImagePromptComponent = Tables<'image_prompt_components'>;
export type MoodDefinition = Tables<'mood_definitions'>;
export type MoodEngineConfigSetting = Tables<'mood_engine_config_settings'>;

// If you have other frequently used table types, add them here following the pattern:
// export type YourTypeName = Tables<'your_table_name_in_supabase'>;

// The generic Tables, Enums, etc., are already exported by the Supabase generated code block earlier in this file.
