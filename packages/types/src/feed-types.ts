// Shared types for the Feed system

export interface Profile {
  id: string;
  name?: string | null;
  avatar_url?: string | null;
}

export interface FeedItem {
  id: string;
  created_at: string;
  updated_at: string;
  created_by_maya_profile_id: string; // Creator's user_id (UUID)
  item_type: string; 
  source_system: string; 
  content_data: any; 
  status: 'pending_review' | 'approved' | 'rejected' | 'approved_for_posting' | 'posted_social' | 'error_posting' | 'prompt_generated' | 'image_generated_pending_review' | 'series_generated'; 
  reviewed_by_user_id?: string | null; // Reviewer's user_id (UUID) or null
  reviewed_at?: string | null;
  approved_at?: string | null;
  admin_review_notes?: string | null;
  original_context?: any | null; 
  posted_to_platforms?: any | null; 
  error_details?: any | null; 
  generated_series_data?: { image_url: string; generated_image_prompt: string; variation_details: any; raw_image_prompt_components?: any[] }[] | null; // Changed generated_prompt to generated_image_prompt
  parent_feed_item_id?: string | null; // ADDED: To link series variations to their master
  
  // Flattened profile fields from the view
  creator_profile_id?: string | null;
  creator_profile_name?: string | null;
  creator_profile_avatar_url?: string | null;
  reviewer_profile_id?: string | null;
  reviewer_profile_name?: string | null;
  reviewer_profile_avatar_url?: string | null;
}

export interface FeedResponse {
  items: FeedItem[];
  total_count: number;
  page: number;
  limit: number;
  total_pages: number;
} 