import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { type cookies } from 'next/headers'; // Import the type if not already available globally for route handlers
import { NextResponse } from 'next/server';
import { type Database } from '@/lib/database.types';

export async function GET(request: Request) {
  const cookieStore = (await import('next/headers')).cookies(); // Dynamically import for Route Handlers
  
  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          // Route Handlers are server-side, this set is for potential session refresh by Supabase client
          // It might try to set cookies on the response, but GET handlers usually don't modify response cookies this way directly.
          // For setting cookies in response, you'd typically use response.cookies.set in a NextResponse.
          // However, for Supabase createServerClient, providing these functions is necessary for its internal operations.
          // We will rely on the initial cookie setting by login/middleware primarily.
          try {
            cookieStore.set({ name, value, ...options });
          } catch (e) { /* Read-only store, ignore */ }
        },
        remove(name: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value: '', ...options });
          } catch (e) { /* Read-only store, ignore */ }
        },
      },
    }
  );

  try {
    const { data: { session }, error } = await supabase.auth.getSession();

    if (error) {
      console.error('[API /auth/session] Error getting session:', error.message);
      return NextResponse.json({ user: null, session: null, error: error.message }, { status: 500 });
    }

    if (session) {
      // console.log('[API /auth/session] Session found:', session.user.id);
      return NextResponse.json({ user: session.user, session });
    } else {
      // console.log('[API /auth/session] No session found.');
      return NextResponse.json({ user: null, session: null });
    }
  } catch (e: any) {
    console.error('[API /auth/session] Exception:', e.message);
    return NextResponse.json({ user: null, session: null, error: e.message }, { status: 500 });
  }
} 