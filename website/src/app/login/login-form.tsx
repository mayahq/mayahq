'use client'

import { useState, useTransition } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { loginWithPassword } from './actions'

export function LoginForm() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string; data?: any } | null>(null)
  
  const [isPending, startTransition] = useTransition()

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setMessage(null)

    startTransition(async () => {
      const formData = new FormData()
      formData.append('email', email)
      formData.append('password', password)

      const result = await loginWithPassword(formData)

      if (result?.error) {
        console.error('Login form received error from server action:', result.error)
        setMessage({ type: 'error', text: result.error.message, data: result.error })
      } else {
        // If successful, the server action handles the redirect.
        // Optionally, you could show a success message before redirect, but redirect is usually immediate.
        // setMessage({ type: 'success', text: 'Login successful, redirecting...'});
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <label htmlFor="email" className="block text-sm font-medium text-foreground">
          Email address
        </label>
        <div className="mt-1">
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={isPending}
            className="block w-full rounded-md border bg-background text-foreground border-input px-3 py-2 shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
      </div>

      <div>
        <label htmlFor="password" className="block text-sm font-medium text-foreground">
          Password
        </label>
        <div className="mt-1">
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={isPending}
            className="block w-full rounded-md border bg-background text-foreground border-input px-3 py-2 shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
      </div>

      <Button
        type="submit"
        disabled={isPending}
        className="w-full"
      >
        {isPending ? 'Signing in...' : 'Sign in'}
      </Button>

      {message && (
        <div
          className={`p-4 rounded-md ${
            message.type === 'success'
              ? 'bg-green-900/50 text-green-200'
              : message.type === 'info'
              ? 'bg-blue-900/50 text-blue-200'
              : 'bg-red-900/50 text-red-200'
          }`}
        >
          <p>{message.text}</p>
          {message.data && <pre className="mt-2 text-xs whitespace-pre-wrap break-all">{JSON.stringify(message.data, null, 2)}</pre>}
        </div>
      )}

      <div className="text-sm text-center">
        <p className="text-sm text-gray-600">
          Don&apos;t have an account?{' '}
          <Link href="/signup" className="text-blue-600 hover:underline">
            Sign up
          </Link>
        </p>
      </div>
    </form>
  )
} 