import { NextResponse } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { Database } from '@/lib/database.types';

const LINKEDIN_CLIENT_ID = process.env.LINKEDIN_CLIENT_ID!;
const LINKEDIN_CLIENT_SECRET = process.env.LINKEDIN_CLIENT_SECRET!;

// GET: Check token status
export async function GET() {
  const cookieStore = cookies();

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) { return cookieStore.get(name)?.value; },
        set(name: string, value: string, options: CookieOptions) {
          try { cookieStore.set({ name, value, ...options }); } catch (e) { /* */ }
        },
        remove(name: string, options: CookieOptions) {
          try { cookieStore.set({ name, value: '', ...options }); } catch (e) { /* */ }
        },
      },
    }
  );

  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { data: token, error } = await supabase
    .from('oauth_tokens')
    .select('*')
    .eq('provider', 'linkedin')
    .eq('user_id', session.user.id)
    .single();

  if (error || !token) {
    return NextResponse.json({
      connected: false,
      message: 'LinkedIn not connected',
    });
  }

  const now = new Date();
  const expiresAt = new Date(token.expires_at!);
  const refreshExpiresAt = token.refresh_token_expires_at
    ? new Date(token.refresh_token_expires_at)
    : null;

  return NextResponse.json({
    connected: true,
    person_urn: token.person_urn,
    expires_at: token.expires_at,
    expires_in_days: Math.floor((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)),
    is_expired: now > expiresAt,
    refresh_token_expires_at: token.refresh_token_expires_at,
    has_refresh_token: !!token.refresh_token,
    refresh_expired: refreshExpiresAt ? now > refreshExpiresAt : null,
    scope: token.scope,
  });
}

// POST: Refresh the token
export async function POST() {
  const cookieStore = cookies();

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!, // Service role for updates
    {
      cookies: {
        get(name: string) { return cookieStore.get(name)?.value; },
        set() {},
        remove() {},
      },
    }
  );

  // For this endpoint, we use a hardcoded Blake user ID since it's a single-user system
  // and refresh might be called by automated processes
  const BLAKE_USER_ID = '4c850152-30ef-4b1b-89b3-bc72af461e14';

  const { data: token, error } = await supabase
    .from('oauth_tokens')
    .select('*')
    .eq('provider', 'linkedin')
    .eq('user_id', BLAKE_USER_ID)
    .single();

  if (error || !token) {
    return NextResponse.json({ error: 'LinkedIn not connected' }, { status: 404 });
  }

  if (!token.refresh_token) {
    return NextResponse.json({ error: 'No refresh token available' }, { status: 400 });
  }

  // Check if refresh token is expired
  if (token.refresh_token_expires_at) {
    const refreshExpires = new Date(token.refresh_token_expires_at);
    if (new Date() > refreshExpires) {
      return NextResponse.json({
        error: 'Refresh token expired',
        message: 'Maya needs to re-authorize at /api/auth/linkedin/authorize',
      }, { status: 400 });
    }
  }

  try {
    const tokenResponse = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: token.refresh_token,
        client_id: LINKEDIN_CLIENT_ID,
        client_secret: LINKEDIN_CLIENT_SECRET,
      }),
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error('[LinkedIn Refresh] Failed:', errorText);
      return NextResponse.json({ error: 'Token refresh failed', details: errorText }, { status: 500 });
    }

    const newTokens = await tokenResponse.json();
    console.log('[LinkedIn Refresh] New token expires_in:', newTokens.expires_in);

    const expiresAt = new Date(Date.now() + newTokens.expires_in * 1000);
    const refreshExpiresAt = newTokens.refresh_token_expires_in
      ? new Date(Date.now() + newTokens.refresh_token_expires_in * 1000)
      : null;

    const { error: updateError } = await supabase
      .from('oauth_tokens')
      .update({
        access_token: newTokens.access_token,
        refresh_token: newTokens.refresh_token || token.refresh_token,
        expires_at: expiresAt.toISOString(),
        refresh_token_expires_at: refreshExpiresAt?.toISOString() || token.refresh_token_expires_at,
        updated_at: new Date().toISOString(),
      })
      .eq('id', token.id);

    if (updateError) {
      console.error('[LinkedIn Refresh] Failed to update:', updateError);
      return NextResponse.json({ error: 'Failed to store refreshed token' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      expires_at: expiresAt.toISOString(),
      expires_in_days: Math.floor(newTokens.expires_in / (60 * 60 * 24)),
    });

  } catch (e) {
    console.error('[LinkedIn Refresh] Exception:', e);
    return NextResponse.json({ error: 'Token refresh failed' }, { status: 500 });
  }
}
