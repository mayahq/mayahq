// URL polyfills are loaded in the app entry; no need to import polyfills here
import AsyncStorage from '@react-native-async-storage/async-storage'
import { createClient } from '@supabase/supabase-js'
import Constants from 'expo-constants'

// Initialize Supabase
// Read environment variables from Expo Constants first
let supabaseUrl = Constants.expoConfig?.extra?.supabaseUrl as string
let supabaseAnonKey = Constants.expoConfig?.extra?.supabaseAnonKey as string

// If not found in Constants, try process.env (supports both EXPO_PUBLIC and NEXT_PUBLIC prefixes)
if (!supabaseUrl) {
  supabaseUrl = (process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL) as string
  console.log('Using process.env for supabaseUrl:', supabaseUrl ? 'Found' : 'Not found')
}

if (!supabaseAnonKey) {
  supabaseAnonKey = (process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) as string
  console.log('Using process.env for supabaseAnonKey:', supabaseAnonKey ? 'Found' : 'Not found')
}

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Missing Supabase environment variables. Please set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY in your .env.local file.')
}

export const supabase = createClient(
  supabaseUrl || '',
  supabaseAnonKey || '',
  {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
    realtime: {
      params: {
        eventsPerSecond: 10,
      },
    },
    global: {
      headers: {
        'X-Client-Info': 'supabase-js-react-native',
      },
    },
  }
) 