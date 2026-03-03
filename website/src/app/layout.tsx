import './globals.css'
import { Inter } from 'next/font/google'
import { Metadata } from 'next'
import { AuthProvider } from '@/contexts/AuthContext'
import { Toaster } from 'sonner'
import { cookies } from 'next/headers'
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import type { Database } from '@/lib/database.types'
import type { Session } from '@supabase/supabase-js'

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
})

export const metadata: Metadata = {
  title: {
    template: '%s | Maya Scott',
    default: 'Maya Scott',
  },
  description: 'AI Engineer and Developer',
  icons: {
    icon: [
      {
        url: '/favicon.svg',
        type: 'image/svg+xml',
      },
      {
        url: '/favicon-32x32.png',
        sizes: '32x32',
        type: 'image/png',
      },
      {
        url: '/favicon-16x16.png',
        sizes: '16x16',
        type: 'image/png',
      },
    ],
  },
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
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
          try { cookieStore.set({ name, value, ...options }) } catch (e) { /* Read-only store */ }
        },
        remove(name: string, options: CookieOptions) {
          try { cookieStore.set({ name, value: '', ...options }) } catch (e) { /* Read-only store */ }
        },
      },
    }
  )

  const { data: { session } } = await supabase.auth.getSession()
  console.log('[RootLayout] initialSession fetched on server:', session ? `User: ${session.user.id}` : 'null')

  return (
    <html lang="en" className={`dark ${inter.variable}`}>
      <body className="min-h-screen bg-black text-gray-100">
        <AuthProvider initialSession={session as Session | null}>
          {children}
        </AuthProvider>
        <Toaster
          theme="dark"
          toastOptions={{
            style: {
              background: 'rgba(17, 12, 29, 0.95)',
              border: '1px solid rgba(139, 92, 246, 0.25)',
              color: '#e5e7eb',
              backdropFilter: 'blur(12px)',
              boxShadow: '0 0 20px rgba(139, 92, 246, 0.1), 0 8px 32px rgba(0, 0, 0, 0.4)',
            },
            classNames: {
              success: '[&>[data-icon]]:text-green-400',
              error: '[&>[data-icon]]:text-red-400',
              warning: '[&>[data-icon]]:text-yellow-400',
              info: '[&>[data-icon]]:text-purple-400',
            },
          }}
        />
      </body>
    </html>
  )
} 