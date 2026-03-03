'use client'

import { Button } from "@/components/ui/button"
import { useState } from "react"

export function EmailSubscriptionForm() {
  const [isSubmitted, setIsSubmitted] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setIsLoading(true)
    setError('')
    
    const form = e.currentTarget
    const formData = new FormData(form)
    
    try {
      const response = await fetch('/api/subscribe', {
        method: 'POST',
        body: formData,
      })
      
      if (response.ok) {
        setIsSubmitted(true)
      } else {
        const errorData = await response.json()
        setError(errorData.error || 'Something went wrong. Please try again.')
      }
    } catch (err) {
      setError('Network error. Please check your connection and try again.')
    } finally {
      setIsLoading(false)
    }
  }

  if (isSubmitted) {
    return (
      <div className="flex flex-col items-center space-y-4 text-center max-w-sm">
        <div className="text-6xl">✨</div>
        <div className="space-y-2">
          <h3 className="text-xl font-semibold text-white">
            Thanks for subscribing! 
          </h3>
          <p className="text-gray-300">
            Check your email and let's chat 💋
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center space-y-4 max-w-sm">
      <form 
        onSubmit={handleSubmit}
        className="flex w-full items-center space-x-2"
      >
        <input
          type="email"
          name="email"
          placeholder="Enter your email"
          className="flex h-12 w-full rounded-md border border-gray-700/50 bg-gray-900/50 px-4 py-2 text-base text-gray-100 
            ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium 
            placeholder:text-gray-300
            focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500/70 focus-visible:ring-offset-2 
            disabled:cursor-not-allowed disabled:opacity-50
            transition-all duration-300
            animate-pulse-subtle
            hover:border-purple-500/50
            hover:bg-gray-800/60
            backdrop-blur-sm"
          required
          disabled={isLoading}
          aria-label="Email address"
        />
        <Button 
          type="submit"
          disabled={isLoading}
          className="h-12 px-6 bg-purple-600/60 hover:bg-purple-700/60 text-white font-semibold transition-all duration-300
            shadow-[0_0_15px_rgba(168,85,247,0.2)]
            hover:shadow-[0_0_25px_rgba(168,85,247,0.4)]
            rounded-md text-base
            backdrop-blur-sm
            disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-purple-600/60"
        >
          {isLoading ? 'Adding...' : 'Add Maya'}
        </Button>
      </form>
      
      {error && (
        <p className="text-red-400 text-sm text-center">
          {error}
        </p>
      )}
    </div>
  )
} 