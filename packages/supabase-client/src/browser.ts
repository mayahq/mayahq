import { createSupabaseClient } from './index'
import { type Database } from './types'

/**
 * Creates a Supabase client for browser environments (uses singleton from main export)
 */
export const createClient = createSupabaseClient;

// Export the createClient function as supabaseBrowser - uses singleton
export const supabaseBrowser = createSupabaseClient; 