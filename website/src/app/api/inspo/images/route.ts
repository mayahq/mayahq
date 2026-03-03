import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseClient } from '@mayahq/supabase-client';

// Maya's system user ID
const MAYA_SYSTEM_USER_ID = '61770892-9e5b-46a5-b622-568be7066664';

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

interface InspoImageCreate {
  image_url: string;
  post_url: string;
  source_account: string;
  source_hashtag: string;
  caption?: string;
  likes: number;
  score?: number;
}

// POST /api/inspo/images - Create new inspiration image
export async function POST(request: NextRequest) {
  if (!validateApiKey(request)) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }

  try {
    const supabase = createSupabaseClient();
    const body: InspoImageCreate = await request.json();

    // Validate required fields
    if (!body.image_url || !body.post_url || !body.source_account || !body.source_hashtag) {
      return NextResponse.json(
        { error: 'Missing required fields: image_url, post_url, source_account, source_hashtag' },
        { status: 400 }
      );
    }

    if (body.likes === undefined || body.likes === null) {
      return NextResponse.json(
        { error: 'likes is required' },
        { status: 400 }
      );
    }

    const insertData = {
      image_url: body.image_url,
      post_url: body.post_url,
      source_account: body.source_account,
      source_hashtag: body.source_hashtag,
      caption: body.caption || null,
      likes: body.likes,
      score: body.score ?? 0,
      is_shown: false,
      date_shown: null,
    };

    const { data: image, error } = await (supabase as any)
      .from('inspo_images')
      .insert(insertData)
      .select()
      .single();

    if (error) {
      // Handle duplicate post_url
      if (error.code === '23505') {
        return NextResponse.json(
          { error: 'Image with this post_url already exists' },
          { status: 409 }
        );
      }
      console.error('Error creating inspo image:', error);
      return NextResponse.json(
        { error: 'Failed to create image' },
        { status: 500 }
      );
    }

    // Create corresponding feed_item for unified feed display
    const { data: feedItem, error: feedError } = await (supabase as any)
      .from('feed_items')
      .insert({
        created_by_maya_profile_id: MAYA_SYSTEM_USER_ID,
        item_type: 'image_inspo',
        source_system: 'InstagramInspo',
        content_data: {
          image_url: body.image_url,
          post_url: body.post_url,
          caption: body.caption || null,
          source_account: body.source_account,
          source_hashtag: body.source_hashtag,
          likes: body.likes,
          score: body.score ?? 0,
        },
        original_context: {
          inspo_image_id: image.id,
          source_type: 'instagram_scraper',
          ingested_at: new Date().toISOString(),
        },
        status: 'approved', // Auto-approved since curated by scraper
      })
      .select('id')
      .single();

    if (feedError) {
      console.error('Error creating feed item for inspo image:', feedError);
      // Don't fail the request - inspo_image was created successfully
    } else if (feedItem) {
      // Link the feed_item back to inspo_images
      await (supabase as any)
        .from('inspo_images')
        .update({ feed_item_id: feedItem.id })
        .eq('id', image.id);

      console.log(`Created feed_item ${feedItem.id} for inspo_image ${image.id}`);
    }

    return NextResponse.json({ ...image, feed_item_id: feedItem?.id }, { status: 201 });
  } catch (error) {
    console.error('Error in inspo images POST:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// GET /api/inspo/images - Query inspiration images
export async function GET(request: NextRequest) {
  if (!validateApiKey(request)) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }

  try {
    const supabase = createSupabaseClient();
    const { searchParams } = new URL(request.url);

    // Parse query parameters
    const limit = parseInt(searchParams.get('limit') || '10');
    const offset = parseInt(searchParams.get('offset') || '0');
    const shown = searchParams.get('shown');
    const sourceAccount = searchParams.get('source_account');
    const sourceHashtag = searchParams.get('source_hashtag');
    const sortBy = searchParams.get('sort_by') || 'score';
    const sortOrder = searchParams.get('sort_order') || 'desc';
    const minScore = searchParams.get('min_score');
    const minLikes = searchParams.get('min_likes');

    // Build query
    let query = (supabase as any)
      .from('inspo_images')
      .select('*', { count: 'exact' });

    // Apply filters
    if (shown !== null && shown !== undefined && shown !== '') {
      query = query.eq('is_shown', shown === 'true');
    }
    if (sourceAccount) {
      query = query.eq('source_account', sourceAccount);
    }
    if (sourceHashtag) {
      query = query.eq('source_hashtag', sourceHashtag);
    }
    if (minScore) {
      query = query.gte('score', parseFloat(minScore));
    }
    if (minLikes) {
      query = query.gte('likes', parseInt(minLikes));
    }

    // Apply sorting and pagination
    query = query
      .order(sortBy, { ascending: sortOrder === 'asc' })
      .range(offset, offset + limit - 1);

    const { data: images, error, count } = await query;

    if (error) {
      console.error('Error fetching inspo images:', error);
      return NextResponse.json(
        { error: 'Failed to fetch images' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      images: images || [],
      total_count: count || 0,
      limit,
      offset,
    });
  } catch (error) {
    console.error('Error in inspo images GET:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
