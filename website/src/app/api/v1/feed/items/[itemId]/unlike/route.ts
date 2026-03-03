import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { Database } from '@mayahq/supabase-client';

export async function DELETE(
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
      console.error('[API Unlike] Auth error:', authError);
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!itemId) {
      return NextResponse.json({ error: 'Item ID is required' }, { status: 400 });
    }

    // Attempt to delete the like
    const { error: unlikeError } = await supabase
      .from('feed_item_likes')
      .delete()
      .match({ feed_item_id: itemId, user_id: user.id });

    if (unlikeError) {
      console.error(`[API Unlike] Error unliking item ${itemId} for user ${user.id}:`, unlikeError);
      return NextResponse.json({ error: 'Failed to unlike item', details: unlikeError.message }, { status: 500 });
    }

    // PostgreSQL delete doesn't typically error if no rows are found,
    // it just means there was nothing to delete (e.g., user hadn't liked it or already unliked it).
    // We can consider this a success from the client's perspective of ensuring the item is "not liked".
    console.log(`[API Unlike] Item ${itemId} unliked successfully or was not liked by user ${user.id}.`);
    return NextResponse.json({ message: 'Item unliked successfully' }, { status: 200 });

  } catch (e: any) {
    console.error(`[API Unlike] Unexpected error for item ${itemId}:`, e);
    return NextResponse.json({ error: 'Internal server error', details: e.message }, { status: 500 });
  }
} 