import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

/**
 * Maya's LinkedIn API endpoint
 *
 * Authenticated via MAYA_API_KEY header for programmatic access.
 * Bypasses Vercel's bot protection.
 */

const MAYA_API_KEY = process.env.MAYA_API_KEY; // Required - no default
const BLAKE_USER_ID = '4c850152-30ef-4b1b-89b3-bc72af461e14';
const LINKEDIN_CLIENT_ID = process.env.LINKEDIN_CLIENT_ID!;
const LINKEDIN_CLIENT_SECRET = process.env.LINKEDIN_CLIENT_SECRET!;

function verifyApiKey(request: Request): boolean {
  if (!MAYA_API_KEY) {
    console.error('[Maya LinkedIn] MAYA_API_KEY not configured');
    return false;
  }
  const apiKey = request.headers.get('x-maya-api-key') || request.headers.get('Authorization')?.replace('Bearer ', '');
  return apiKey === MAYA_API_KEY;
}

// GET: Fetch current LinkedIn token and status
export async function GET(request: Request) {
  if (!verifyApiKey(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: token, error } = await supabase
    .from('oauth_tokens')
    .select('*')
    .eq('provider', 'linkedin')
    .eq('user_id', BLAKE_USER_ID)
    .single();

  if (error || !token) {
    return NextResponse.json({
      connected: false,
      error: 'LinkedIn not connected. Blake needs to authorize at /api/auth/linkedin/authorize',
    });
  }

  const now = new Date();
  const expiresAt = new Date(token.expires_at!);
  const isExpired = now > expiresAt;

  // Return full token info for Maya
  return NextResponse.json({
    connected: true,
    access_token: token.access_token,
    person_urn: token.person_urn,
    expires_at: token.expires_at,
    expires_in_days: Math.floor((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)),
    is_expired: isExpired,
    has_refresh_token: !!token.refresh_token,
    scope: token.scope,
  });
}

// POST: Refresh the LinkedIn token
export async function POST(request: Request) {
  if (!verifyApiKey(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

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
        message: 'Blake needs to re-authorize at /api/auth/linkedin/authorize',
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
      console.error('[Maya LinkedIn] Refresh failed:', errorText);
      return NextResponse.json({ error: 'Token refresh failed', details: errorText }, { status: 500 });
    }

    const newTokens = await tokenResponse.json();

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
      console.error('[Maya LinkedIn] Failed to store refreshed token:', updateError);
      return NextResponse.json({ error: 'Failed to store refreshed token' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      access_token: newTokens.access_token,
      expires_at: expiresAt.toISOString(),
      expires_in_days: Math.floor(newTokens.expires_in / (60 * 60 * 24)),
    });

  } catch (e) {
    console.error('[Maya LinkedIn] Exception:', e);
    return NextResponse.json({ error: 'Token refresh failed' }, { status: 500 });
  }
}
