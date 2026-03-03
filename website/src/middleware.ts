import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { cookies as nextCookies } from 'next/headers'; // Import with an alias

// We need to ensure cookie names are consistent
const SESSION_COOKIE_NAME = 'sb-dlaczmexhnoxfggpzxkl-auth-token';

export async function middleware(request: NextRequest) {
  // Skip middleware entirely for OPTIONS requests (CORS preflight)
  // Return 200 with CORS headers to allow cross-origin requests
  if (request.method === 'OPTIONS') {
    return new NextResponse(null, {
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Maya-Mobile-App, Accept',
        'Access-Control-Max-Age': '86400',
      },
    });
  }

  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          // The `set` method is called by the Supabase client when it needs to set a cookie.
          // This is working with the Next.js Response object, so it should be fine.
          response.cookies.set({ name, value, ...options });
        },
        remove(name: string, options: CookieOptions) {
          // The `delete` method is called by the Supabase client when it needs to delete a cookie.
          response.cookies.set({ name, value: '', ...options });
        },
      },
    }
  );

  const { data: { session }, error: sessionError } = await supabase.auth.getSession();
  
  if (sessionError) {
    console.error('[Middleware] Error getting/refreshing session:', sessionError.message);
  }
  
  // If we have a session but it's close to expiring, try to refresh it
  if (session && session.expires_at) {
    const expiresAt = new Date(session.expires_at * 1000);
    const now = new Date();
    const timeUntilExpiry = expiresAt.getTime() - now.getTime();
    const fiveMinutes = 5 * 60 * 1000; // 5 minutes in milliseconds
    
    // If session expires in less than 5 minutes, try to refresh
    if (timeUntilExpiry < fiveMinutes) {
      console.log('[Middleware] Session expiring soon, attempting refresh');
      try {
        const { data: { session: refreshedSession }, error: refreshError } = await supabase.auth.refreshSession();
        if (refreshError) {
          console.error('[Middleware] Failed to refresh session:', refreshError.message);
        } else if (refreshedSession) {
          console.log('[Middleware] Session refreshed successfully');
        }
      } catch (error) {
        console.error('[Middleware] Exception during session refresh:', error);
      }
    }
  }
  // if (userError) {
  //   // It's not necessarily an error if no user is found, but log actual errors.
  //   if (userError.message !== 'No active session') { // Or similar message indicating no user vs. an actual error
  //     console.error('[Middleware] Error getting user:', userError.message);
  //   }
  // }

  const { pathname } = request.nextUrl;

  // Protect /admin routes
  if (pathname.startsWith('/admin')) {
    if (!session) {
    // if (!user) {
      // console.log(`[Middleware] No session, redirecting from ${pathname} to /login.`);
      const redirectUrl = new URL('/login', request.url);
      redirectUrl.searchParams.set('next', pathname);
      return NextResponse.redirect(redirectUrl);
    }
    // console.log(`[Middleware] Session found for /admin path: ${session.user.id}`);
  }
  
  // Allow auth-specific, public, and Maya API routes
  if (pathname.startsWith('/api/auth/') ||
      pathname.startsWith('/api/public/') ||
      pathname.startsWith('/api/maya-chat-v3') ||
      pathname.startsWith('/api/voice/') ||
      pathname.startsWith('/api/debug-maya')) {
    return response;
  }

  // Example protection for other API routes
  if (pathname.startsWith('/api/') && !pathname.startsWith('/api/auth') && !pathname.startsWith('/api/public') && !session) {
    // console.log(`[Middleware] No session for protected API route ${pathname}. Returning 401.`);
    return new NextResponse(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  }

  // For all other paths, return the response which may have updated cookies from getSession()
  return response;
}

export const config = {
  matcher: [
    // Match all request paths except for the ones starting with /_next/static, /_next/image, /favicon.ico, or static assets
    '/((?!_next/static|_next/image|favicon.ico|.*\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
    // Match all /admin paths
    '/admin/:path*',
    // Match all /api paths. The middleware logic will differentiate auth/public from protected ones.
    '/api/:path*',
  ],
}; 