import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase/client'
import { Session, User } from '@supabase/supabase-js'
import * as WebBrowser from 'expo-web-browser'
import { makeRedirectUri } from 'expo-auth-session'

export interface AuthState {
  session: Session | null
  user: User | null
  loading: boolean
  signInWithEmail: (email: string, password: string) => Promise<void>
  signUpWithEmail: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
  refreshSession: () => Promise<void>
}

export function useAuth(): AuthState {
  const [session, setSession] = useState<Session | null>(null)
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  // Get the redirect URL for the OAuth flow
  const redirectUrl = makeRedirectUri({
    scheme: 'mayahq'
  })

  // Fetch current session and set up listener
  useEffect(() => {
    setLoading(true)

    // Get the current session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setUser(session?.user ?? null)
      setLoading(false)
    })

    // Set up auth listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session)
        setUser(session?.user ?? null)
        setLoading(false)
      }
    )

    // Clean up on unmount
    return () => {
      subscription.unsubscribe()
    }
  }, [])

  // Sign in with email and password
  const signInWithEmail = async (email: string, password: string) => {
    setLoading(true)
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (error) {
        throw new Error(error.message)
      }
    } catch (error) {
      console.error('Error signing in:', error)
      throw error
    } finally {
      setLoading(false)
    }
  }

  // Sign up with email and password
  const signUpWithEmail = async (email: string, password: string) => {
    setLoading(true)
    try {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: redirectUrl,
        },
      })

      if (error) {
        throw new Error(error.message)
      }
    } catch (error) {
      console.error('Error signing up:', error)
      throw error
    } finally {
      setLoading(false)
    }
  }

  // Sign out
  const signOut = async () => {
    try {
      await supabase.auth.signOut()
    } catch (error) {
      console.error('Error signing out:', error)
      throw error
    }
  }

  // Refresh the session manually (useful after certain actions)
  const refreshSession = async () => {
    try {
      const { data, error } = await supabase.auth.refreshSession()
      if (error) {
        throw error
      }
      setSession(data.session)
      setUser(data.session?.user ?? null)
    } catch (error) {
      console.error('Error refreshing session:', error)
    }
  }

  return {
    session,
    user,
    loading,
    signInWithEmail,
    signUpWithEmail,
    signOut,
    refreshSession
  }
} 