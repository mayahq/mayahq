import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseClient } from '@mayahq/supabase-client';

interface ProductSearchFilters {
  platform?: string;
  category?: string;
  tags?: string[];
  is_active?: boolean;
  search?: string;
  min_price?: number;
  max_price?: number;
}

interface SearchResult {
  products: any[];
  total_count: number;
  page: number;
  limit: number;
  total_pages: number;
  facets: {
    platforms: Array<{ value: string; count: number }>;
    categories: Array<{ value: string; count: number }>;
    tags: Array<{ value: string; count: number }>;
  };
}

export async function GET(request: NextRequest) {
  try {
    const supabase = createSupabaseClient();
    const { searchParams } = new URL(request.url);

    // Parse query parameters
    const page = parseInt(searchParams.get('page') || '1');
    const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 100); // Cap at 100
    const platform = searchParams.get('platform');
    const category = searchParams.get('category');
    const tags = searchParams.get('tags')?.split(',').filter(Boolean);
    const isActive = searchParams.get('is_active');
    const search = searchParams.get('search');
    const minPrice = searchParams.get('min_price') ? parseFloat(searchParams.get('min_price')!) : undefined;
    const maxPrice = searchParams.get('max_price') ? parseFloat(searchParams.get('max_price')!) : undefined;
    const sortBy = searchParams.get('sort_by') || 'created_at';
    const sortOrder = searchParams.get('sort_order') || 'desc';
    const includeFacets = searchParams.get('include_facets') === 'true';

    // Build main query
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
      // Enhanced search across multiple fields
      query = query.or(`name.ilike.%${search}%,description.ilike.%${search}%,tags.ilike.%${search}%,category.ilike.%${search}%`);
    }
    if (minPrice !== undefined) {
      query = query.or(`sale_price.gte.${minPrice},original_price.gte.${minPrice}`);
    }
    if (maxPrice !== undefined) {
      query = query.or(`sale_price.lte.${maxPrice},original_price.lte.${maxPrice}`);
    }

    // Apply sorting and pagination
    const offset = (page - 1) * limit;
    
    // Special handling for relevance sorting when searching
    if (search && sortBy === 'relevance') {
      // For now, sort by created_at desc, could be enhanced with full-text search ranking
      query = query.order('created_at', { ascending: false });
    } else {
      query = query.order(sortBy, { ascending: sortOrder === 'asc' });
    }
    
    query = query.range(offset, offset + limit - 1);

    const { data: products, error, count } = await query;

    if (error) {
      console.error('Error searching products:', error);
      return NextResponse.json(
        { error: 'Failed to search products' },
        { status: 500 }
      );
    }

    const totalPages = Math.ceil((count || 0) / limit);

    let facets: {
      platforms: Array<{ value: string; count: number }>;
      categories: Array<{ value: string; count: number }>;
      tags: Array<{ value: string; count: number }>;
    } = {
      platforms: [],
      categories: [],
      tags: []
    };

    // Get facets if requested
    if (includeFacets) {
      try {
        // Get platform facets
        const { data: platformFacets } = await (supabase as any)
          .from('maya_products')
          .select('platform')
          .not('platform', 'is', null)
          .eq('is_active', true);

        // Get category facets
        const { data: categoryFacets } = await (supabase as any)
          .from('maya_products')
          .select('category')
          .not('category', 'is', null)
          .eq('is_active', true);

        // Get tag facets (this is more complex due to array field)
        const { data: tagFacets } = await (supabase as any)
          .from('maya_products')
          .select('tags')
          .not('tags', 'is', null)
          .eq('is_active', true);

        // Process platform facets
        const platformCounts: { [key: string]: number } = {};
        platformFacets?.forEach((item: any) => {
          if (item.platform) {
            platformCounts[item.platform] = (platformCounts[item.platform] || 0) + 1;
          }
        });
        facets.platforms = Object.entries(platformCounts)
          .map(([value, count]) => ({ value, count }))
          .sort((a, b) => b.count - a.count);

        // Process category facets
        const categoryCounts: { [key: string]: number } = {};
        categoryFacets?.forEach((item: any) => {
          if (item.category) {
            categoryCounts[item.category] = (categoryCounts[item.category] || 0) + 1;
          }
        });
        facets.categories = Object.entries(categoryCounts)
          .map(([value, count]) => ({ value, count }))
          .sort((a, b) => b.count - a.count);

        // Process tag facets
        const tagCounts: { [key: string]: number } = {};
        tagFacets?.forEach((item: any) => {
          if (item.tags && Array.isArray(item.tags)) {
            item.tags.forEach((tag: string) => {
              tagCounts[tag] = (tagCounts[tag] || 0) + 1;
            });
          }
        });
        facets.tags = Object.entries(tagCounts)
          .map(([value, count]) => ({ value, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 50); // Limit to top 50 tags
      } catch (facetError) {
        console.error('Error getting facets:', facetError);
        // Continue without facets
      }
    }

    const response: SearchResult = {
      products: products || [],
      total_count: count || 0,
      page,
      limit,
      total_pages: totalPages,
      facets
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Error in product search:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
} 