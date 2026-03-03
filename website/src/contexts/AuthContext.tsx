'use client'

import { createBrowserClient } from '@supabase/ssr';
import { type Database } from '@/lib/database.types';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { Session, User, SupabaseClient } from '@supabase/supabase-js';
import type { Profile } from '@/types/feed-types';

interface AuthProviderProps {
  children: React.ReactNode;
  initialSession: Session | null; 
}

interface AuthContextType {
  authUserId: string | null;
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  supabase: SupabaseClient<Database>; 
}

// Client-side Supabase instance for AuthContext internal use and for consumers
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createBrowserClient<Database>(supabaseUrl, supabaseKey);
console.log('[AuthContext] Initialized createBrowserClient for AuthProvider');

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children, initialSession }: AuthProviderProps) => {
  const [sessionState, setSessionState] = useState<Session | null>(initialSession);
  const [user, setUser] = useState<User | null>(initialSession?.user ?? null);
  const [authUserId, setAuthUserId] = useState<string | null>(initialSession?.user?.id ?? null);
  const [profile, setProfile] = useState<Profile | null>(null);
  // If we have an initialSession, we are not "loading" the session itself initially.
  // Profile fetching will have its own loading state if needed, or AuthProvider consumers check profile directly.
  const [loading, setLoading] = useState(!initialSession); 

  const fetchProfile = async (userId: string) => {
    if (!supabase) return;
    console.log(`[AuthContext] Fetching profile for user: ${userId}`);
    try {
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();
      if (profileError && profileError.code !== 'PGRST116') {
        console.error('[AuthContext] Error fetching profile:', profileError);
        setProfile(null);
      } else if (profileData) {
        console.log('[AuthContext] Profile fetched:', profileData.name);
        setProfile(profileData as Profile);
      } else {
        console.log('[AuthContext] No profile found for user:', userId);
        setProfile(null);
      }
    } catch (e) {
      console.error('[AuthContext] Exception fetching profile:', e);
      setProfile(null);
    }
  };

  useEffect(() => {
    let isMounted = true;
    let refreshTimer: NodeJS.Timeout | null = null;
    
    console.log('[AuthContext] useEffect triggered. initialSession:', initialSession ? `User: ${initialSession.user.id}` : 'null');

    const setupSessionRefresh = (session: Session) => {
      if (refreshTimer) {
        clearTimeout(refreshTimer);
      }
      
      // Set up automatic session refresh 5 minutes before expiry
      if (session.expires_at) {
        const expiresAt = new Date(session.expires_at * 1000);
        const now = new Date();
        const timeUntilExpiry = expiresAt.getTime() - now.getTime();
        const fiveMinutes = 5 * 60 * 1000;
        
        const refreshDelay = Math.max(timeUntilExpiry - fiveMinutes, 60000); // At least 1 minute delay
        
        refreshTimer = setTimeout(async () => {
          if (isMounted) {
            console.log('[AuthContext] Auto-refreshing session');
            try {
              await supabase.auth.refreshSession();
            } catch (error) {
              console.error('[AuthContext] Failed to auto-refresh session:', error);
            }
          }
        }, refreshDelay);
      }
    };

    // If initialSession was provided and has a user, fetch their profile.
    // The session state itself is already initialized by useState.
    if (initialSession?.user) {
      if (isMounted) {
        setLoading(true); // Set loading true for profile fetch
        setupSessionRefresh(initialSession);
        fetchProfile(initialSession.user.id).finally(() => {
          if (isMounted) setLoading(false);
        });
      }
    } else {
      // No initial session from server, so auth state is initially loading.
      if (isMounted) setLoading(true);
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, currentSession) => {
        if (!isMounted) return;
        console.log('[AuthContext] onAuthStateChange event:', event, 'New Session:', 
          currentSession ? `User: ${currentSession.user.id}` : 'null');

        setSessionState(currentSession);
        setUser(currentSession?.user ?? null);
        setAuthUserId(currentSession?.user?.id ?? null);

        if (currentSession?.user) {
          // If user changes or session appears, fetch profile and setup refresh
          setupSessionRefresh(currentSession);
          fetchProfile(currentSession.user.id).finally(() => {
            if (isMounted) setLoading(false);
          });
        } else {
          // No session or user signed out, clear profile and stop loading.
          if (refreshTimer) {
            clearTimeout(refreshTimer);
            refreshTimer = null;
          }
          setProfile(null);
          if (isMounted) setLoading(false);
        }
      }
    );

    return () => {
      isMounted = false;
      if (refreshTimer) {
        clearTimeout(refreshTimer);
      }
      console.log('[AuthContext] Unsubscribing from onAuthStateChange.');
      subscription.unsubscribe();
    };
  // initialSession can be a dependency if we want to re-fetch profile if it changes, 
  // but typically RootLayout provides it once. Supabase client is stable.
  }, [initialSession, supabase]); // React to initialSession changes

  const value = {
    authUserId,
    user,
    session: sessionState,
    profile,
    loading,
    supabase,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}; 