import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseClient } from '@mayahq/supabase-client';
// Using local types for now - will be moved to shared package later
interface ProductCreateRequest {
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
  slug?: string;
}

interface ProductsResponse {
  products: any[];
  total_count: number;
  page: number;
  limit: number;
  total_pages: number;
}

// Generate URL-friendly slug
function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-zA-Z0-9\s\-_]/g, '')
    .trim()
    .replace(/\s+/g, '-');
}

// Ensure unique slug
async function ensureUniqueSlug(supabase: any, baseSlug: string, excludeId?: string): Promise<string> {
  let slug = baseSlug;
  let counter = 1;

  while (true) {
    try {
      let query = supabase
        .from('maya_products')
        .select('id')
        .eq('slug', slug);
      
      if (excludeId) {
        query = query.neq('id', excludeId);
      }

      const { data, error } = await query.maybeSingle();
      
      if (error) {
        console.warn('Slug check error, proceeding with slug:', slug, error);
        return slug;
      }
      
      if (!data) {
        // No row found, slug is unique
        return slug;
      }
      
      // Slug exists, try with counter
      slug = `${baseSlug}-${counter}`;
      counter++;
      
      // Prevent infinite loop
      if (counter > 100) {
        return `${baseSlug}-${Date.now()}`;
      }
    } catch (err) {
      console.warn('Error checking slug uniqueness:', err);
      return `${baseSlug}-${Date.now()}`;
    }
  }
}

export async function GET(request: NextRequest) {
  try {
    const supabase = createSupabaseClient();
    const { searchParams } = new URL(request.url);

    // Parse query parameters
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const platform = searchParams.get('platform');
    const category = searchParams.get('category');
    const tags = searchParams.get('tags')?.split(',').filter(Boolean);
    const isActive = searchParams.get('is_active');
    const search = searchParams.get('search');
    const sortBy = searchParams.get('sort_by') || 'created_at';
    const sortOrder = searchParams.get('sort_order') || 'desc';

    // Build query with proper type assertion
    let query = (supabase as any)
      .from('maya_products')
      .select('*', { count: 'exact' });

    // Apply filters
    if (platform) {
      query = query.eq('platform', platform);
    }
    if (category) {
      query = query.eq('category', category);
    }
    if (tags && tags.length > 0) {
      query = query.overlaps('tags', tags);
    }
    if (isActive !== null && isActive !== undefined) {
      query = query.eq('is_active', isActive === 'true');
    }
    if (search) {
      query = query.or(`name.ilike.%${search}%,description.ilike.%${search}%`);
    }

    // Apply sorting and pagination
    const offset = (page - 1) * limit;
    query = query
      .order(sortBy, { ascending: sortOrder === 'asc' })
      .range(offset, offset + limit - 1);

    const { data: products, error, count } = await query;

    if (error) {
      console.error('Error fetching products:', error);
      return NextResponse.json(
        { error: 'Failed to fetch products' },
        { status: 500 }
      );
    }

    const totalPages = Math.ceil((count || 0) / limit);

    const response: ProductsResponse = {
      products: products || [],
      total_count: count || 0,
      page,
      limit,
      total_pages: totalPages
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Error in products GET:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = createSupabaseClient();
    const body: ProductCreateRequest = await request.json();

    // Validate required fields
    if (!body.name || !body.affiliate_link) {
      return NextResponse.json(
        { error: 'Name and affiliate_link are required' },
        { status: 400 }
      );
    }

    // Generate slug if not provided
    let slug = body.slug || generateSlug(body.name);
    slug = await ensureUniqueSlug(supabase, slug);

    // Prepare insert data
    const insertData = {
      name: body.name,
      description: body.description || null,
      image_url: body.image_url || null,
      affiliate_link: body.affiliate_link,
      original_price: body.original_price || null,
      sale_price: body.sale_price || null,
      platform: body.platform || null,
      tags: body.tags || null,
      category: body.category || null,
      is_active: body.is_active ?? true,
      meta_title: body.meta_title || body.name,
      meta_description: body.meta_description || body.description,
      slug,
      click_count: 0
    };

    const { data: product, error } = await (supabase as any)
      .from('maya_products')
      .insert(insertData)
      .select()
      .single();

    if (error) {
      console.error('Error creating product:', error);
      return NextResponse.json(
        { error: 'Failed to create product' },
        { status: 500 }
      );
    }

    return NextResponse.json(product, { status: 201 });
  } catch (error) {
    console.error('Error in products POST:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
} 