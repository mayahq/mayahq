import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseClient } from '@mayahq/supabase-client';

interface ProductUpdateRequest {
  name?: string;
  description?: string;
  image_url?: string;
  affiliate_link?: string;
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
        return slug;
      }
      
      slug = `${baseSlug}-${counter}`;
      counter++;
      
      if (counter > 100) {
        return `${baseSlug}-${Date.now()}`;
      }
    } catch (err) {
      console.warn('Error checking slug uniqueness:', err);
      return `${baseSlug}-${Date.now()}`;
    }
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createSupabaseClient();
    const productId = params.id;

    // Check if it's a slug or ID
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(productId);
    
    let query = (supabase as any).from('maya_products').select('*');
    
    if (isUUID) {
      query = query.eq('id', productId);
    } else {
      query = query.eq('slug', productId);
    }

    const { data: product, error } = await query.single();

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json(
          { error: 'Product not found' },
          { status: 404 }
        );
      }
      console.error('Error fetching product:', error);
      return NextResponse.json(
        { error: 'Failed to fetch product' },
        { status: 500 }
      );
    }

    return NextResponse.json(product);
  } catch (error) {
    console.error('Error in product GET:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createSupabaseClient();
    const productId = params.id;
    const body: ProductUpdateRequest = await request.json();

    // Check if product exists
    const { data: existingProduct, error: fetchError } = await (supabase as any)
      .from('maya_products')
      .select('*')
      .eq('id', productId)
      .single();

    if (fetchError) {
      if (fetchError.code === 'PGRST116') {
        return NextResponse.json(
          { error: 'Product not found' },
          { status: 404 }
        );
      }
      console.error('Error fetching product for update:', fetchError);
      return NextResponse.json(
        { error: 'Failed to fetch product' },
        { status: 500 }
      );
    }

    // Handle slug update
    let slug = body.slug;
    if (body.name && !slug) {
      slug = generateSlug(body.name);
    }
    if (slug && slug !== existingProduct.slug) {
      slug = await ensureUniqueSlug(supabase, slug, productId);
    }

    // Prepare update data
    const updateData: any = {};
    
    if (body.name !== undefined) updateData.name = body.name;
    if (body.description !== undefined) updateData.description = body.description;
    if (body.image_url !== undefined) updateData.image_url = body.image_url;
    if (body.affiliate_link !== undefined) updateData.affiliate_link = body.affiliate_link;
    if (body.original_price !== undefined) updateData.original_price = body.original_price;
    if (body.sale_price !== undefined) updateData.sale_price = body.sale_price;
    if (body.platform !== undefined) updateData.platform = body.platform;
    if (body.tags !== undefined) updateData.tags = body.tags;
    if (body.category !== undefined) updateData.category = body.category;
    if (body.is_active !== undefined) updateData.is_active = body.is_active;
    if (body.meta_title !== undefined) updateData.meta_title = body.meta_title;
    if (body.meta_description !== undefined) updateData.meta_description = body.meta_description;
    if (slug) updateData.slug = slug;

    const { data: product, error } = await (supabase as any)
      .from('maya_products')
      .update(updateData)
      .eq('id', productId)
      .select()
      .single();

    if (error) {
      console.error('Error updating product:', error);
      return NextResponse.json(
        { error: 'Failed to update product' },
        { status: 500 }
      );
    }

    return NextResponse.json(product);
  } catch (error) {
    console.error('Error in product PUT:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createSupabaseClient();
    const productId = params.id;

    const { error } = await (supabase as any)
      .from('maya_products')
      .delete()
      .eq('id', productId);

    if (error) {
      console.error('Error deleting product:', error);
      return NextResponse.json(
        { error: 'Failed to delete product' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error in product DELETE:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
} 