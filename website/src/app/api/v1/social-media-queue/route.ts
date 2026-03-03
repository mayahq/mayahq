import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';

export async function GET(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { session } } = await supabase.auth.getSession();

    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const url = new URL(request.url);
    const status = url.searchParams.get('status');
    const limit = parseInt(url.searchParams.get('limit') || '50');
    const offset = parseInt(url.searchParams.get('offset') || '0');

    let query = supabase
      .from('social_media_posting_queue')
      .select(`
        *,
        feed_items:feed_item_id (
          id,
          content_data,
          source_system,
          item_type,
          status
        )
      `)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (status) {
      query = query.eq('status', status);
    }

    const { data: queueItems, error } = await query;

    if (error) {
      console.error('Error fetching social media queue:', error);
      return NextResponse.json({ error: 'Failed to fetch social media queue' }, { status: 500 });
    }

    return NextResponse.json({
      items: queueItems || [],
      total: queueItems?.length || 0
    });

  } catch (error) {
    console.error('Error in social media queue API:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
} 