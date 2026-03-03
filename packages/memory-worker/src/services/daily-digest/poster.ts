/**
 * Daily Digest Poster
 * Publishes approved posts to X (Twitter) and LinkedIn
 */

import crypto from 'crypto';
import axios from 'axios';

// --- X/Twitter (OAuth 1.0a) ---

interface OAuthParams {
  oauth_consumer_key: string;
  oauth_nonce: string;
  oauth_signature_method: string;
  oauth_timestamp: string;
  oauth_token: string;
  oauth_version: string;
  [key: string]: string;
}

function generateOAuthSignature(
  method: string,
  url: string,
  params: OAuthParams,
  consumerSecret: string,
  tokenSecret: string
): string {
  // Sort parameters alphabetically
  const sortedParams = Object.keys(params)
    .sort()
    .map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`)
    .join('&');

  const signatureBase = [
    method.toUpperCase(),
    encodeURIComponent(url),
    encodeURIComponent(sortedParams),
  ].join('&');

  const signingKey = `${encodeURIComponent(consumerSecret)}&${encodeURIComponent(tokenSecret)}`;

  return crypto
    .createHmac('sha1', signingKey)
    .update(signatureBase)
    .digest('base64');
}

function buildOAuthHeader(params: OAuthParams & { oauth_signature: string }): string {
  const headerParams = Object.keys(params)
    .filter((key) => key.startsWith('oauth_'))
    .sort()
    .map((key) => `${encodeURIComponent(key)}="${encodeURIComponent(params[key])}"`)
    .join(', ');

  return `OAuth ${headerParams}`;
}

export async function postToX(content: string): Promise<{ success: boolean; postId?: string; error?: string }> {
  const apiKey = process.env.X_API_KEY;
  const apiSecret = process.env.X_API_SECRET;
  const accessToken = process.env.X_ACCESS_TOKEN;
  const accessTokenSecret = process.env.X_ACCESS_TOKEN_SECRET;

  if (!apiKey || !apiSecret || !accessToken || !accessTokenSecret) {
    return { success: false, error: 'X API credentials not configured' };
  }

  const url = 'https://api.twitter.com/2/tweets';
  const method = 'POST';

  const oauthParams: OAuthParams = {
    oauth_consumer_key: apiKey,
    oauth_nonce: crypto.randomBytes(16).toString('hex'),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_token: accessToken,
    oauth_version: '1.0',
  };

  const signature = generateOAuthSignature(method, url, oauthParams, apiSecret, accessTokenSecret);
  const authHeader = buildOAuthHeader({ ...oauthParams, oauth_signature: signature });

  try {
    console.log(`[Digest/Poster] Posting to X: "${content.slice(0, 50)}..."`);

    const response = await axios.post(
      url,
      { text: content },
      {
        headers: {
          Authorization: authHeader,
          'Content-Type': 'application/json',
        },
        timeout: 15000,
      }
    );

    const postId = response.data?.data?.id;
    console.log(`[Digest/Poster] X post successful: ${postId}`);

    return { success: true, postId };
  } catch (error: any) {
    const errMsg = error.response?.data?.detail || error.response?.data?.title || error.message;
    console.error('[Digest/Poster] X post failed:', errMsg);
    return { success: false, error: errMsg };
  }
}

// --- LinkedIn ---

export async function postToLinkedIn(
  content: string
): Promise<{ success: boolean; postId?: string; error?: string }> {
  const accessToken = process.env.LINKEDIN_ACCESS_TOKEN;
  const personUrn = process.env.LINKEDIN_PERSON_URN;

  if (!accessToken || !personUrn) {
    return { success: false, error: 'LinkedIn credentials not configured' };
  }

  try {
    console.log(`[Digest/Poster] Posting to LinkedIn: "${content.slice(0, 50)}..."`);

    const response = await axios.post(
      'https://api.linkedin.com/v2/posts',
      {
        author: personUrn,
        lifecycleState: 'PUBLISHED',
        specificContent: {
          'com.linkedin.ugc.ShareContent': {
            shareCommentary: {
              text: content,
            },
            shareMediaCategory: 'NONE',
          },
        },
        visibility: {
          'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC',
        },
      },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'X-Restli-Protocol-Version': '2.0.0',
        },
        timeout: 15000,
      }
    );

    // LinkedIn returns the post URN in the x-restli-id header or response
    const postId =
      response.headers['x-restli-id'] || response.data?.id || 'posted';

    console.log(`[Digest/Poster] LinkedIn post successful: ${postId}`);
    return { success: true, postId: String(postId) };
  } catch (error: any) {
    const errMsg =
      error.response?.data?.message || error.response?.data?.serviceErrorCode || error.message;
    console.error('[Digest/Poster] LinkedIn post failed:', errMsg);
    return { success: false, error: errMsg };
  }
}

// --- Combined Poster ---

export async function postToAllPlatforms(
  xContent: string | null,
  linkedinContent: string | null
): Promise<{
  x: { success: boolean; postId?: string; error?: string } | null;
  linkedin: { success: boolean; postId?: string; error?: string } | null;
}> {
  const results: {
    x: { success: boolean; postId?: string; error?: string } | null;
    linkedin: { success: boolean; postId?: string; error?: string } | null;
  } = {
    x: null,
    linkedin: null,
  };

  // Post to both platforms in parallel
  const [xResult, linkedinResult] = await Promise.all([
    xContent ? postToX(xContent) : Promise.resolve(null),
    linkedinContent ? postToLinkedIn(linkedinContent) : Promise.resolve(null),
  ]);

  results.x = xResult;
  results.linkedin = linkedinResult;

  return results;
}
