/**
 * LinkedIn API utilities
 *
 * Token management and posting helpers for Maya's LinkedIn integration.
 */

import { createClient } from '@supabase/supabase-js';

const BLAKE_USER_ID = '4c850152-30ef-4b1b-89b3-bc72af461e14';

interface LinkedInToken {
  access_token: string;
  person_urn: string | null;
  expires_at: string;
  refresh_token: string | null;
}

/**
 * Get the current LinkedIn access token for Blake.
 * Automatically refreshes if expired (and refresh token is valid).
 */
export async function getLinkedInToken(): Promise<LinkedInToken | null> {
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
    console.error('[LinkedIn] No token found:', error?.message);
    return null;
  }

  // Check if token is expired or expiring soon (within 1 day)
  const expiresAt = new Date(token.expires_at);
  const oneDayFromNow = new Date(Date.now() + 24 * 60 * 60 * 1000);

  if (expiresAt < oneDayFromNow && token.refresh_token) {
    console.log('[LinkedIn] Token expiring soon, refreshing...');
    const refreshed = await refreshLinkedInToken(token.refresh_token, token.id);
    if (refreshed) {
      return refreshed;
    }
  }

  return {
    access_token: token.access_token,
    person_urn: token.person_urn,
    expires_at: token.expires_at,
    refresh_token: token.refresh_token,
  };
}

/**
 * Refresh the LinkedIn access token
 */
async function refreshLinkedInToken(
  refreshToken: string,
  tokenId: string
): Promise<LinkedInToken | null> {
  try {
    const response = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: process.env.LINKEDIN_CLIENT_ID!,
        client_secret: process.env.LINKEDIN_CLIENT_SECRET!,
      }),
    });

    if (!response.ok) {
      console.error('[LinkedIn] Refresh failed:', await response.text());
      return null;
    }

    const newTokens = await response.json();

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const expiresAt = new Date(Date.now() + newTokens.expires_in * 1000);
    const refreshExpiresAt = newTokens.refresh_token_expires_in
      ? new Date(Date.now() + newTokens.refresh_token_expires_in * 1000)
      : null;

    const { data: updated, error } = await supabase
      .from('oauth_tokens')
      .update({
        access_token: newTokens.access_token,
        refresh_token: newTokens.refresh_token || refreshToken,
        expires_at: expiresAt.toISOString(),
        refresh_token_expires_at: refreshExpiresAt?.toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', tokenId)
      .select()
      .single();

    if (error) {
      console.error('[LinkedIn] Failed to store refreshed token:', error);
      return null;
    }

    return {
      access_token: updated.access_token,
      person_urn: updated.person_urn,
      expires_at: updated.expires_at,
      refresh_token: updated.refresh_token,
    };
  } catch (e) {
    console.error('[LinkedIn] Refresh exception:', e);
    return null;
  }
}

/**
 * Post to LinkedIn
 */
export async function postToLinkedIn(
  text: string,
  options?: {
    imageUrl?: string;
    articleUrl?: string;
    articleTitle?: string;
    articleDescription?: string;
  }
): Promise<{ success: boolean; postId?: string; error?: string }> {
  const token = await getLinkedInToken();
  if (!token) {
    return { success: false, error: 'No LinkedIn token available' };
  }

  if (!token.person_urn) {
    return { success: false, error: 'No person URN - re-authorize LinkedIn' };
  }

  // Build the post payload
  const payload: Record<string, unknown> = {
    author: token.person_urn,
    lifecycleState: 'PUBLISHED',
    specificContent: {
      'com.linkedin.ugc.ShareContent': {
        shareCommentary: {
          text,
        },
        shareMediaCategory: 'NONE',
      },
    },
    visibility: {
      'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC',
    },
  };

  // Add article/link if provided
  if (options?.articleUrl) {
    const content = payload.specificContent as Record<string, Record<string, unknown>>;
    content['com.linkedin.ugc.ShareContent'].shareMediaCategory = 'ARTICLE';
    content['com.linkedin.ugc.ShareContent'].media = [{
      status: 'READY',
      originalUrl: options.articleUrl,
      title: { text: options.articleTitle || '' },
      description: { text: options.articleDescription || '' },
    }];
  }

  try {
    const response = await fetch('https://api.linkedin.com/v2/ugcPosts', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token.access_token}`,
        'Content-Type': 'application/json',
        'X-Restli-Protocol-Version': '2.0.0',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[LinkedIn] Post failed:', errorText);
      return { success: false, error: errorText };
    }

    const result = await response.json();
    return {
      success: true,
      postId: result.id,
    };
  } catch (e) {
    console.error('[LinkedIn] Post exception:', e);
    return { success: false, error: String(e) };
  }
}
