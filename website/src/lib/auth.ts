import { createClient } from '@/lib/supabase/client'
import { useEffect, useState } from 'react'
import { User as SupabaseUser } from '@supabase/supabase-js'

export interface User {
  id: string
  name?: string
  email?: string
  avatar_url?: string
}

export async function getUser(userId: string): Promise<User | null> {
  try {
    const supabase = createClient()
    
    // First try to get from profiles table
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, name, avatar_url')
      .eq('id', userId)
      .single()
      
    if (profile) {
      return {
        id: profile.id,
        name: profile.name || undefined,
        avatar_url: profile.avatar_url || undefined
      }
    }
    
    // If no profile found but we have a valid ID, return basic user
    if (userId) {
      return {
        id: userId
      }
    }
    
    return null
    
  } catch (error) {
    console.error('Error getting user:', error)
    return null
  }
}

export function useAuth() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    // Get initial session
    const getInitialSession = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      
      if (session?.user) {
        const userData = await getUser(session.user.id)
        setUser(userData)
      }
      setLoading(false)
    }

    getInitialSession()

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (session?.user) {
          const userData = await getUser(session.user.id)
          setUser(userData)
        } else {
          setUser(null)
        }
        setLoading(false)
      }
    )

    return () => subscription.unsubscribe()
  }, [supabase])

  return {
    user,
    loading,
    supabase
  }
} 