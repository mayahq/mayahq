import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { Database } from '@mayahq/supabase-client';

export async function POST(
  request: NextRequest,
  { params }: { params: { itemId: string } }
) {
  try {
    const cookieStore = cookies();
    const supabase = createServerClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return cookieStore.get(name)?.value;
          },
          set(name: string, value: string, options: CookieOptions) {
            cookieStore.set({ name, value, ...options });
          },
          remove(name: string, options: CookieOptions) {
            cookieStore.set({ name, value: '', ...options });
          },
        },
      }
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      console.error('[API Schedule Social Posts] Auth error:', authError);
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { platformIds } = await request.json();

    if (!platformIds || !Array.isArray(platformIds) || platformIds.length === 0) {
      return NextResponse.json({ error: 'Platform IDs are required' }, { status: 400 });
    }

    const { itemId } = params;

    // First, verify the feed item exists and is approved
    const { data: feedItem, error: feedItemError } = await supabase
      .from('feed_items')
      .select('*')
      .eq('id', itemId)
      .single();

    if (feedItemError || !feedItem) {
      console.error('[API Schedule Social Posts] Feed item error:', feedItemError);
      return NextResponse.json({ error: 'Feed item not found' }, { status: 404 });
    }

    if (feedItem.status !== 'approved' && feedItem.status !== 'approved_for_posting') {
      return NextResponse.json({ error: 'Feed item must be approved before scheduling social posts' }, { status: 400 });
    }

    // Get platform configurations - using type assertion for new table
    const { data: platforms, error: platformsError } = await (supabase as any)
      .from('social_media_platforms')
      .select('*')
      .in('id', platformIds);

    if (platformsError) {
      console.error('[API Schedule Social Posts] Error fetching platforms:', platformsError);
      return NextResponse.json({ error: 'Failed to fetch platform configurations' }, { status: 500 });
    }

    if (!platforms || platforms.length !== platformIds.length) {
      console.error('[API Schedule Social Posts] Platform count mismatch:', { 
        requested: platformIds.length, 
        found: platforms?.length || 0,
        platformIds,
        foundPlatforms: platforms?.map((p: any) => p.id) || []
      });
      return NextResponse.json({ error: 'Some platform IDs are invalid' }, { status: 400 });
    }

    // Create queue entries for each platform
    const queueEntries = platforms.map((platform: any) => ({
      feed_item_id: itemId,
      platform_id: platform.id,
      status: 'pending',
      scheduled_for: new Date().toISOString(),
      content_data: {
        text: (feedItem.content_data as any)?.processed_content || (feedItem.content_data as any)?.text || '',
        platform_name: platform.name,
        source_metadata: (feedItem.content_data as any)?.source_metadata || null,
        source_url: (feedItem.content_data as any)?.source_url || null,
        original_title: (feedItem.content_data as any)?.original_title || null,
        source_type: (feedItem.content_data as any)?.source_type || null,
        original_feed_item: {
          id: feedItem.id,
          source_system: feedItem.source_system,
          item_type: feedItem.item_type,
          full_content_data: feedItem.content_data
        }
      },
      post_metadata: {
        platform_config: platform.config,
        created_by_user_id: user.id
      },
      attempts: 0,
      max_attempts: 3
    }));

    console.log('[API Schedule Social Posts] Creating queue entries:', queueEntries);

    // Insert queue entries - using type assertion for new table
    const { data: insertedEntries, error: insertError } = await (supabase as any)
      .from('social_media_posting_queue')
      .insert(queueEntries)
      .select();

    if (insertError) {
      console.error('[API Schedule Social Posts] Error inserting queue entries:', insertError);
      return NextResponse.json({ error: 'Failed to schedule social media posts', details: insertError.message }, { status: 500 });
    }

    console.log('[API Schedule Social Posts] Successfully inserted entries:', insertedEntries);

    // Update feed item status to indicate it's been scheduled for posting
    const { error: updateError } = await supabase
      .from('feed_items')
      .update({ 
        status: 'approved_for_posting'
        // Note: posted_to_platforms field may not exist in current schema
      })
      .eq('id', itemId);

    if (updateError) {
      console.error('[API Schedule Social Posts] Error updating feed item status:', updateError);
      // Don't fail the request since the queue entries were created successfully
    }

    return NextResponse.json({
      message: `Successfully scheduled ${insertedEntries?.length || platformIds.length} social media posts`,
      queue_entries: insertedEntries,
      platforms: platforms.map((p: any) => p.display_name).join(', ')
    });

  } catch (error) {
    console.error('[API Schedule Social Posts] Unexpected error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
} 