import { Metadata } from 'next';
import { createSupabaseClient } from '@mayahq/supabase-client';
import { ProductsClient } from './products-client';

interface Product {
  id: string;
  name: string;
  description?: string | null;
  image_url?: string | null;
  affiliate_link: string;
  original_price?: number | null;
  sale_price?: number | null;
  platform?: string | null;
  tags?: string[] | null;
  category?: string | null;
  is_active: boolean;
  click_count: number;
  slug: string;
  created_at: string;
  updated_at: string;
}

interface ProductsPageProps {
  searchParams: {
    page?: string;
    search?: string;
    platform?: string;
    category?: string;
    tags?: string;
    sort_by?: string;
    sort_order?: string;
  };
}

async function getProducts(searchParams: ProductsPageProps['searchParams']) {
  try {
    const supabase = createSupabaseClient();
    
    const page = parseInt(searchParams.page || '1');
    const limit = 20;
    const offset = (page - 1) * limit;

    let query = (supabase as any)
      .from('maya_products')
      .select('*', { count: 'exact' })
      .eq('is_active', true);

    // Apply filters
    if (searchParams.search) {
      query = query.or(`name.ilike.%${searchParams.search}%,description.ilike.%${searchParams.search}%`);
    }
    if (searchParams.platform) {
      query = query.eq('platform', searchParams.platform);
    }
    if (searchParams.category) {
      query = query.eq('category', searchParams.category);
    }
    if (searchParams.tags) {
      const tags = searchParams.tags.split(',').filter(Boolean);
      if (tags.length > 0) {
        query = query.overlaps('tags', tags);
      }
    }

    // Apply sorting
    const sortBy = searchParams.sort_by || 'created_at';
    const sortOrder = searchParams.sort_order || 'desc';
    query = query.order(sortBy, { ascending: sortOrder === 'asc' });

    // Apply pagination
    query = query.range(offset, offset + limit - 1);

    const { data: products, error, count } = await query;

    if (error) {
      console.error('Error fetching products:', error);
      return {
        products: [],
        total_count: 0,
        page,
        limit,
        total_pages: 0
      };
    }

    return {
      products: products || [],
      total_count: count || 0,
      page,
      limit,
      total_pages: Math.ceil((count || 0) / limit)
    };
  } catch (error) {
    console.error('Error in getProducts:', error);
    return {
      products: [],
      total_count: 0,
      page: 1,
      limit: 20,
      total_pages: 0
    };
  }
}

async function getFacets() {
  try {
    const supabase = createSupabaseClient();
    
    // Get platforms
    const { data: platformData } = await (supabase as any)
      .from('maya_products')
      .select('platform')
      .not('platform', 'is', null)
      .eq('is_active', true);

    // Get categories
    const { data: categoryData } = await (supabase as any)
      .from('maya_products')
      .select('category')
      .not('category', 'is', null)
      .eq('is_active', true);

    // Get tags
    const { data: tagData } = await (supabase as any)
      .from('maya_products')
      .select('tags')
      .not('tags', 'is', null)
      .eq('is_active', true);

    // Process platforms
    const platformCounts: { [key: string]: number } = {};
    platformData?.forEach((item: any) => {
      if (item.platform) {
        platformCounts[item.platform] = (platformCounts[item.platform] || 0) + 1;
      }
    });

    // Process categories
    const categoryCounts: { [key: string]: number } = {};
    categoryData?.forEach((item: any) => {
      if (item.category) {
        categoryCounts[item.category] = (categoryCounts[item.category] || 0) + 1;
      }
    });

    // Process tags
    const tagCounts: { [key: string]: number } = {};
    tagData?.forEach((item: any) => {
      if (item.tags && Array.isArray(item.tags)) {
        item.tags.forEach((tag: string) => {
          tagCounts[tag] = (tagCounts[tag] || 0) + 1;
        });
      }
    });

    return {
      platforms: Object.entries(platformCounts)
        .map(([value, count]) => ({ value, count }))
        .sort((a, b) => b.count - a.count),
      categories: Object.entries(categoryCounts)
        .map(([value, count]) => ({ value, count }))
        .sort((a, b) => b.count - a.count),
      tags: Object.entries(tagCounts)
        .map(([value, count]) => ({ value, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 20) // Limit to top 20 tags
    };
  } catch (error) {
    console.error('Error getting facets:', error);
    return {
      platforms: [],
      categories: [],
      tags: []
    };
  }
}

export const metadata: Metadata = {
  title: 'Products | Maya',
  description: 'Discover our curated collection of products across various categories including tech, fashion, home, and more.',
  openGraph: {
    title: 'Products | Maya',
    description: 'Discover our curated collection of products across various categories including tech, fashion, home, and more.',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Products | Maya',
    description: 'Discover our curated collection of products across various categories including tech, fashion, home, and more.',
  },
};

export default async function ProductsPage({ searchParams }: ProductsPageProps) {
  const [productsData, facets] = await Promise.all([
    getProducts(searchParams),
    getFacets()
  ]);

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-4xl font-bold mb-2">Products</h1>
        <p className="text-xl text-muted-foreground">
          Discover our curated collection of products
        </p>
      </div>

      <ProductsClient 
        initialData={productsData}
        facets={facets}
        searchParams={searchParams}
      />
    </div>
  );
} 