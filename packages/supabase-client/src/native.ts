import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { type Database } from './types'

// AsyncStorage will be provided by the consuming app
let AsyncStorage: any = null

/**
 * Set the AsyncStorage implementation
 * This should be called before using createNativeClient
 */
export const setAsyncStorage = (storage: any) => {
  AsyncStorage = storage
}

/**
 * Creates a Supabase client for React Native environments
 */
export const createNativeClient = (
  supabaseUrl: string,
  supabaseAnonKey: string
) => {
  if (!AsyncStorage) {
    console.error('AsyncStorage not set. Call setAsyncStorage first.')
  }

  return createSupabaseClient<Database>(supabaseUrl, supabaseAnonKey, {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  })
}

// Helper for Expo apps that use Constants
export const createExpoClient = (
  supabaseUrl: string,
  supabaseAnonKey: string
) => {
  return createNativeClient(supabaseUrl, supabaseAnonKey)
} 