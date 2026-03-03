import { createClient as supabaseCreateClient, SupabaseClient } from '@supabase/supabase-js';
import { createBrowserClient as supabaseCreateBrowserClient } from '@supabase/ssr';
import type { Database, Json, Tables, Profile, FeedItem, FeedItemLike, FeedItemComment, ImagePromptComponent, MoodDefinition, MoodEngineConfigSetting } from './types/index';

// Re-export all types from types directory for consumers of the package
export * from './types/index'; 

// Re-export all chat functions
export * from './chat';

// Re-export all image analysis functions
export * from './image-analysis';

// Re-export all media functions
export * from './media';

// Re-export all memory functions
export * from './memories';

// Re-export all auth functions
export * from './auth';

// Singleton instance FOR THE BROWSER
let browserSupabaseInstance: SupabaseClient<Database> | null = null;

export const createSupabaseClient = (): SupabaseClient<Database> => {
  if (typeof window !== 'undefined') {
    // BROWSER/REACT NATIVE environment: Ensure singleton for createBrowserClient
    if (browserSupabaseInstance) {
      // console.log('[Supabase Client] Returning EXISTING BROWSER instance');
      return browserSupabaseInstance;
    }
    // console.log('[Supabase Client] Creating NEW BROWSER instance');
    
    // Support both Next.js (NEXT_PUBLIC_) and React Native (EXPO_PUBLIC_) env vars
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL!;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;
    
    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Browser/React Native: Missing Supabase URL or Anon Key from NEXT_PUBLIC_ or EXPO_PUBLIC_ env vars.');
    }
    browserSupabaseInstance = supabaseCreateBrowserClient<Database>(supabaseUrl, supabaseKey);
    return browserSupabaseInstance;
  } else {
    // SERVER environment (Node.js, e.g., for utility scripts or non-request-specific server tasks)
    // This will create a NEW, regular supabase-js client instance each time it's called on the server.
    // Server Actions, Route Handlers, and Middleware should use their own specific
    // createServerClient({ cookies }) from '@supabase/ssr' for request-bound operations.
    // console.log('[Supabase Client] Creating new SERVER instance (regular supabase-js client)');
    const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL!;
    // For server, prefer SUPABASE_SERVICE_ROLE_KEY if available and appropriate, otherwise anon.
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;
    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Server: Missing Supabase URL or Key.');
    }
    return supabaseCreateClient<Database>(supabaseUrl, supabaseKey);
  }
};

// Export our createClient function as the default for compatibility
export const createClient = createSupabaseClient;

// Add back supabaseBrowser export for chat-sdk compatibility
// When called in a browser context by chat-sdk, this will return the browserSupabaseInstance singleton.
export const supabaseBrowser = createSupabaseClient;

// If the SupabaseClient type itself needs to be exported from this package, 
// it can be re-exported from '@supabase/supabase-js' like this:
export type { SupabaseClient };

// Re-export Database and specific table types that chat-sdk needs
export type { Database, Message, Room } from './types/index';

// Remove the projectRef export if it's not being used, to simplify.
// export const projectRef: string = (() => {
//   const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL || '';
//   const match = url.match(/^https?:\/\/(.*?)\.supabase\.co/);
//   const ref = match ? match[1] : '';
//   // console.log('[Supabase Client] Project URL:', url, '-> Project Ref:', ref);
//   return ref;
// })(); 