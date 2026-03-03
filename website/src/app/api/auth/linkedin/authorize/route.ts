import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

const LINKEDIN_CLIENT_ID = process.env.LINKEDIN_CLIENT_ID!;
const LINKEDIN_REDIRECT_URI = 'https://mayascott.ai/api/auth/linkedin/callback';
const BLAKE_USER_ID = '4c850152-30ef-4b1b-89b3-bc72af461e14';

// Scopes for posting + profile access
const SCOPES = [
  'openid',
  'profile',
  'email',
  'w_member_social',  // Post on behalf of member
].join(' ');

export async function GET() {
  const cookieStore = cookies();

  // Generate state for CSRF protection (use Blake's hardcoded ID - single user system)
  const state = Buffer.from(JSON.stringify({
    userId: BLAKE_USER_ID,
    timestamp: Date.now(),
  })).toString('base64url');

  // Store state in cookie for verification
  cookieStore.set('linkedin_oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 10, // 10 minutes
    path: '/',
  });

  // Build LinkedIn authorization URL
  const authUrl = new URL('https://www.linkedin.com/oauth/v2/authorization');
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('client_id', LINKEDIN_CLIENT_ID);
  authUrl.searchParams.set('redirect_uri', LINKEDIN_REDIRECT_URI);
  authUrl.searchParams.set('state', state);
  authUrl.searchParams.set('scope', SCOPES);

  return NextResponse.redirect(authUrl.toString());
}
