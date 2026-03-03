import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { Database } from '@mayahq/supabase-client'; // Changed import path


export async function POST(
  request: Request,
  { params }: { params: { itemId: string } }
) {
  const { itemId } = params;
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

  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      console.error('[API Like] Auth error:', authError);
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!itemId) {
      return NextResponse.json({ error: 'Item ID is required' }, { status: 400 });
    }

    // Attempt to insert the like
    const { error: likeError } = await supabase
      .from('feed_item_likes')
      .insert({ feed_item_id: itemId, user_id: user.id });

    if (likeError) {
      // Handle potential unique constraint violation (user already liked this item)
      if (likeError.code === '23505') { // Unique violation error code for PostgreSQL
        console.log(`[API Like] User ${user.id} already liked item ${itemId}. No action taken.`);
        // Optionally, you could return a specific status or message indicating "already liked"
        // For now, treating it as a non-error for the client, as the state is effectively "liked"
        return NextResponse.json({ message: 'Item already liked' }, { status: 200 });
      }
      console.error(`[API Like] Error liking item ${itemId} for user ${user.id}:`, likeError);
      return NextResponse.json({ error: 'Failed to like item', details: likeError.message }, { status: 500 });
    }

    return NextResponse.json({ message: 'Item liked successfully' }, { status: 201 });
  } catch (e: any) {
    console.error(`[API Like] Unexpected error for item ${itemId}:`, e);
    return NextResponse.json({ error: 'Internal server error', details: e.message }, { status: 500 });
  }
} 