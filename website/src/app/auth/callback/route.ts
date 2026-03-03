import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse, type NextRequest } from 'next/server'
import { type Database } from '@/lib/database.types'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  console.log('[Auth Callback] Processing auth callback')
  
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  const next = requestUrl.searchParams.get('next') ?? '/admin'

  if (code) {
    const cookieStore = cookies()
    const supabase = createServerClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return cookieStore.get(name)?.value
          },
          set(name: string, value: string, options: CookieOptions) {
            cookieStore.set({ name, value, ...options })
          },
          remove(name: string, options: CookieOptions) {
            cookieStore.set({ name, value: '', ...options })
          },
        },
      }
    )

    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      console.log('[Auth Callback] Session exchange successful, redirecting to:', next)
      return NextResponse.redirect(new URL(next, request.url))
    } else {
      console.error('[Auth Callback] Session exchange error:', error)
    }
  }

  // If no code or error, redirect to login
  console.log('[Auth Callback] No code or error occurred, redirecting to login')
  return NextResponse.redirect(new URL('/login', request.url))
}

export async function POST(request: NextRequest) {
  console.log('[Auth Callback] POST - Manual session refresh triggered')
  
  const cookieStore = cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value
        },
        set(name: string, value: string, options: CookieOptions) {
          cookieStore.set({ name, value, ...options })
        },
        remove(name: string, options: CookieOptions) {
          cookieStore.set({ name, value: '', ...options })
        },
      },
    }
  )

  try {
    const { data: { session }, error } = await supabase.auth.getSession()
    
    if (error) {
      console.error('[Auth Callback] POST - Session error:', error)
      return NextResponse.json({ error: error.message }, { status: 401 })
    }

    if (session) {
      console.log('[Auth Callback] POST - Session found:', session.user.id)
      return NextResponse.json({ 
        success: true, 
        user: session.user,
        session: { 
          access_token: session.access_token,
          expires_at: session.expires_at 
        }
      })
    } else {
      console.log('[Auth Callback] POST - No session found')
      return NextResponse.json({ error: 'No session found' }, { status: 401 })
    }
  } catch (error) {
    console.error('[Auth Callback] POST - Unexpected error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
} 