// Shared types for the Product & Affiliate Management system

export interface Product {
  id: string;
  name: string;
  description?: string | null;
  image_url?: string | null;
  affiliate_link: string;
  original_price?: number | null;
  sale_price?: number | null;
  platform?: string | null; // 'amazon', 'tiktok_shop', 'digital', etc.
  tags?: string[] | null;
  category?: string | null;
  is_active: boolean;
  click_count: number;
  meta_title?: string | null; // SEO
  meta_description?: string | null; // SEO
  slug: string; // URL-friendly identifier
  created_at: string;
  updated_at: string;
}

export interface ProductClick {
  id: string;
  product_id: string;
  clicked_at: string;
  referrer?: string | null;
  user_agent?: string | null;
  ip_hash?: string | null; // hashed for privacy
}

export interface ProductWithClicks extends Product {
  recent_clicks?: ProductClick[];
  clicks_today?: number;
  clicks_this_week?: number;
  clicks_this_month?: number;
}

export interface ProductCreateRequest {
  name: string;
  description?: string;
  image_url?: string;
  affiliate_link: string;
  original_price?: number;
  sale_price?: number;
  platform?: string;
  tags?: string[];
  category?: string;
  is_active?: boolean;
  meta_title?: string;
  meta_description?: string;
  slug?: string; // If not provided, will be generated from name
}

export interface ProductUpdateRequest extends Partial<ProductCreateRequest> {
  id: string;
}

export interface ProductsResponse {
  products: Product[];
  total_count: number;
  page: number;
  limit: number;
  total_pages: number;
}

export interface ProductSearchFilters {
  platform?: string;
  category?: string;
  tags?: string[];
  is_active?: boolean;
  search?: string; // Search in name, description
}

export interface ProductAnalytics {
  product_id: string;
  total_clicks: number;
  clicks_today: number;
  clicks_this_week: number;
  clicks_this_month: number;
  top_referrers: Array<{
    referrer: string;
    count: number;
  }>;
  click_history: Array<{
    date: string;
    clicks: number;
  }>;
}

export interface ProductClickRequest {
  product_id: string;
  referrer?: string;
  user_agent?: string;
  ip_address?: string; // Will be hashed before storage
}

// For MCP tool integration
export interface ProductMCPResponse {
  success: boolean;
  data?: any;
  error?: string;
  message?: string;
}

export type ProductPlatform = 'amazon' | 'tiktok_shop' | 'digital' | 'shopify' | 'etsy' | 'other';

export type ProductCategory = 'tech' | 'fashion' | 'home' | 'beauty' | 'books' | 'sports' | 'other'; 