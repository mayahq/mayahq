import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseClient } from '@mayahq/supabase-client';

// Validate API key
function validateApiKey(request: NextRequest): boolean {
  const apiKey = request.headers.get('x-api-key');
  const expectedKey = process.env.CLAWDBOT_API_KEY;

  if (!expectedKey) {
    console.error('CLAWDBOT_API_KEY not configured');
    return false;
  }

  return apiKey === expectedKey;
}

interface InspoImageUpdate {
  image_url?: string;
  caption?: string;
  likes?: number;
  score?: number;
  is_shown?: boolean;
}

// GET /api/inspo/images/:id - Get single image
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!validateApiKey(request)) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }

  try {
    const { id } = await params;
    const supabase = createSupabaseClient();

    const { data: image, error } = await (supabase as any)
      .from('inspo_images')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json(
          { error: 'Image not found' },
          { status: 404 }
        );
      }
      console.error('Error fetching inspo image:', error);
      return NextResponse.json(
        { error: 'Failed to fetch image' },
        { status: 500 }
      );
    }

    return NextResponse.json(image);
  } catch (error) {
    console.error('Error in inspo image GET:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// PATCH /api/inspo/images/:id - Update image
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!validateApiKey(request)) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }

  try {
    const { id } = await params;
    const supabase = createSupabaseClient();
    const body: InspoImageUpdate = await request.json();

    // Build update object with only provided fields
    const updateData: Record<string, unknown> = {};

    if (body.image_url !== undefined) updateData.image_url = body.image_url;
    if (body.caption !== undefined) updateData.caption = body.caption;
    if (body.likes !== undefined) updateData.likes = body.likes;
    if (body.score !== undefined) updateData.score = body.score;

    // Special handling for is_shown - also set date_shown
    if (body.is_shown !== undefined) {
      updateData.is_shown = body.is_shown;
      if (body.is_shown === true) {
        updateData.date_shown = new Date().toISOString();
      }
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { error: 'No valid fields to update' },
        { status: 400 }
      );
    }

    const { data: image, error } = await (supabase as any)
      .from('inspo_images')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json(
          { error: 'Image not found' },
          { status: 404 }
        );
      }
      console.error('Error updating inspo image:', error);
      return NextResponse.json(
        { error: 'Failed to update image' },
        { status: 500 }
      );
    }

    return NextResponse.json(image);
  } catch (error) {
    console.error('Error in inspo image PATCH:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// DELETE /api/inspo/images/:id - Delete image
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!validateApiKey(request)) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }

  try {
    const { id } = await params;
    const supabase = createSupabaseClient();

    const { error } = await (supabase as any)
      .from('inspo_images')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting inspo image:', error);
      return NextResponse.json(
        { error: 'Failed to delete image' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error in inspo image DELETE:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
