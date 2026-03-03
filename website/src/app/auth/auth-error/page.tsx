import { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Authentication Error',
  description: 'There was a problem with authentication',
}

export default function AuthErrorPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <h1 className="mt-6 text-center text-3xl font-bold tracking-tight">
          Authentication Error
        </h1>
        <p className="mt-2 text-center text-sm text-gray-400">
          There was a problem authenticating your account.
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white/5 px-4 py-8 shadow sm:rounded-lg sm:px-10">
          <div className="text-center">
            <p className="text-gray-300 mb-4">
              Please try signing in again. If the problem persists, contact support.
            </p>
            <Link
              href="/auth/signin"
              className="inline-flex items-center rounded-md border border-transparent bg-purple-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2"
            >
              Back to Sign In
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
} 