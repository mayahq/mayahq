import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

const LINKEDIN_CLIENT_ID = process.env.LINKEDIN_CLIENT_ID!;
const LINKEDIN_CLIENT_SECRET = process.env.LINKEDIN_CLIENT_SECRET!;
const LINKEDIN_REDIRECT_URI = 'https://mayascott.ai/api/auth/linkedin/callback';

interface LinkedInTokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  refresh_token_expires_in?: number;
  scope: string;
  token_type: string;
}

interface LinkedInUserInfo {
  sub: string;  // This is the person ID
  name?: string;
  email?: string;
  picture?: string;
}

export async function GET(request: Request) {
  const cookieStore = cookies();
  const url = new URL(request.url);

  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const error = url.searchParams.get('error');
  const errorDescription = url.searchParams.get('error_description');

  // Handle OAuth errors
  if (error) {
    console.error('[LinkedIn OAuth] Error:', error, errorDescription);
    return NextResponse.redirect(
      new URL(`/admin?linkedin_error=${encodeURIComponent(errorDescription || error)}`, request.url)
    );
  }

  if (!code || !state) {
    return NextResponse.redirect(
      new URL('/admin?linkedin_error=missing_params', request.url)
    );
  }

  // Verify state
  const storedState = cookieStore.get('linkedin_oauth_state')?.value;
  if (!storedState || storedState !== state) {
    console.error('[LinkedIn OAuth] State mismatch');
    return NextResponse.redirect(
      new URL('/admin?linkedin_error=invalid_state', request.url)
    );
  }

  // Parse state to get user ID
  let userId: string;
  try {
    const stateData = JSON.parse(Buffer.from(state, 'base64url').toString());
    userId = stateData.userId;
  } catch (e) {
    return NextResponse.redirect(
      new URL('/admin?linkedin_error=invalid_state_data', request.url)
    );
  }

  // Clear state cookie
  cookieStore.set('linkedin_oauth_state', '', { maxAge: 0, path: '/' });

  try {
    // Exchange code for tokens
    const tokenResponse = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: LINKEDIN_REDIRECT_URI,
        client_id: LINKEDIN_CLIENT_ID,
        client_secret: LINKEDIN_CLIENT_SECRET,
      }),
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error('[LinkedIn OAuth] Token exchange failed:', errorText);
      return NextResponse.redirect(
        new URL('/admin?linkedin_error=token_exchange_failed', request.url)
      );
    }

    const tokens: LinkedInTokenResponse = await tokenResponse.json();
    console.log('[LinkedIn OAuth] Got tokens, expires_in:', tokens.expires_in);

    // Fetch user info to get person URN
    const userInfoResponse = await fetch('https://api.linkedin.com/v2/userinfo', {
      headers: {
        'Authorization': `Bearer ${tokens.access_token}`,
      },
    });

    let personUrn: string | null = null;
    if (userInfoResponse.ok) {
      const userInfo: LinkedInUserInfo = await userInfoResponse.json();
      personUrn = `urn:li:person:${userInfo.sub}`;
      console.log('[LinkedIn OAuth] Person URN:', personUrn);
    }

    // Store tokens in Supabase (use regular client with service role to bypass RLS)
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);
    const refreshExpiresAt = tokens.refresh_token_expires_in
      ? new Date(Date.now() + tokens.refresh_token_expires_in * 1000)
      : null;

    const { error: upsertError } = await supabase
      .from('oauth_tokens')
      .upsert({
        provider: 'linkedin',
        user_id: userId,
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token || null,
        token_type: tokens.token_type,
        expires_at: expiresAt.toISOString(),
        refresh_token_expires_at: refreshExpiresAt?.toISOString() || null,
        scope: tokens.scope,
        person_urn: personUrn,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'provider,user_id',
      });

    if (upsertError) {
      console.error('[LinkedIn OAuth] Failed to store tokens:', upsertError);
      return NextResponse.redirect(
        new URL('/admin?linkedin_error=storage_failed', request.url)
      );
    }

    console.log('[LinkedIn OAuth] Tokens stored successfully');

    // Redirect to success page
    return NextResponse.redirect(
      new URL('/admin?linkedin_success=true', request.url)
    );

  } catch (e) {
    console.error('[LinkedIn OAuth] Exception:', e);
    return NextResponse.redirect(
      new URL('/admin?linkedin_error=unknown_error', request.url)
    );
  }
}
