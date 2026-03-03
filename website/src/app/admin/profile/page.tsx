import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { Database } from '@/lib/database.types'
import { ProfileForm } from './profile-form'
import { redirect } from 'next/navigation'

export default async function ProfilePage() {
  const cookieStore = cookies()
  
  // Create a read-only server client for initial data fetching
  // Auth and cookie management is handled by middleware
  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value
        },
        set(name: string, value: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value, ...options })
          } catch (error) {
            // The `set` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing user sessions.
          }
        },
        remove(name: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value: '', ...options })
          } catch (error) {
            // The `remove` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing user sessions.
          }
        },
      }
    }
  )
  
  // Get user session (read-only operation)
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    return redirect('/login')
  }

  // Get user profile (read-only operation)
  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  // If no profile exists, create one
  if (!profile) {
    const { data: newProfile, error } = await supabase
      .from('profiles')
      .insert([
        {
          id: user.id,
          name: user?.user_metadata?.full_name || 'Maya User',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }
      ])
      .select()
      .single()

    if (error) {
      console.error('Error creating profile:', error)
      throw error
    }

    return (
      <div className="space-y-6">
        <div>
          <h3 className="text-lg font-medium text-white">Profile</h3>
          <p className="text-sm text-muted-foreground">
            Update your profile information and social media links.
          </p>
        </div>
        <ProfileForm profile={newProfile} />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium text-white">Profile</h3>
        <p className="text-sm text-muted-foreground">
          Update your profile information and social media links.
        </p>
      </div>
      <ProfileForm profile={profile} />
    </div>
  )
} 