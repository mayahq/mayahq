import { SupabaseClient } from '@supabase/supabase-js'
import { Database } from './types'

/**
 * Signs in a user with email OTP
 */
export const signInWithOtp = async (
  client: SupabaseClient<Database>,
  email: string,
  options?: { redirectTo?: string }
) => {
  const { data, error } = await client.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: options?.redirectTo },
  })

  return { data, error }
}

/**
 * Signs out the current user
 */
export const signOut = async (client: SupabaseClient<Database>) => {
  return client.auth.signOut()
}

/**
 * Gets the current session
 */
export const getSession = async (client: SupabaseClient<Database>) => {
  return client.auth.getSession()
}

/**
 * Gets the current user
 */
export const getUser = async (client: SupabaseClient<Database>) => {
  const { data, error } = await client.auth.getUser()
  return { user: data?.user, error }
} 