import Image from 'next/image'
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { type Database } from '@/lib/database.types'
import { SocialIcon } from '@/components/social-icon'
import type { SupabaseClient } from '@supabase/supabase-js'

type ProfileType = Database['public']['Tables']['profiles']['Row']

async function getLinksAndSocials(supabase: SupabaseClient<Database>, userId: string) {
  const [linksResponse, socialsResponse] = await Promise.all([
    supabase
      .from('links')
      .select('*')
      .eq('is_active', true)
      .order('order'),
    supabase
      .from('socials')
      .select('*'),
  ])

  return {
    links: linksResponse.data ?? [],
    socials: socialsResponse.data ?? [],
  }
}

export async function Profile({ profile }: { profile: ProfileType }) {
  const cookieStore = cookies()
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
            cookieStore.set(name, value, options)
          } catch (error) {
            // Errors can be ignored in Server Components
          }
        },
        remove(name: string, options: CookieOptions) {
          try {
            cookieStore.set(name, '', options)
          } catch (error) {
            // Errors can be ignored in Server Components
          }
        },
      },
    }
  )
  
  const { links, socials } = await getLinksAndSocials(supabase, profile.id)

  return (
    <div className="min-h-screen bg-background py-12 sm:py-16">
      <div className="mx-auto max-w-7xl px-4 text-center sm:px-6 lg:px-8">
        <div className="space-y-8 sm:space-y-12">
          {/* Profile Header */}
          <div className="space-y-4">
            <div className="relative mx-auto h-24 w-24 sm:h-32 sm:w-32">
              <Image
                src={profile.avatar_url || '/placeholder-avatar.png'}
                alt={profile.name}
                className="rounded-full object-cover"
                fill
                priority
                sizes="(min-width: 640px) 128px, 96px"
              />
            </div>
            <div>
              <h1 className="text-2xl font-bold sm:text-3xl">{profile.name}</h1>
              {profile.bio && (
                <p className="mt-2 text-muted-foreground">{profile.bio}</p>
              )}
            </div>
          </div>

          {/* Social Icons */}
          {socials.length > 0 && (
            <div className="flex justify-center gap-4">
              {socials.map((social) => (
                <a
                  key={social.id}
                  href={social.url || '#'}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-muted-foreground transition-colors hover:text-foreground"
                >
                  <SocialIcon platform={social.platform || ''} className="h-6 w-6" />
                </a>
              ))}
            </div>
          )}

          {/* Links */}
          <div className="space-y-4">
            {links.map((link) => (
              <a
                key={link.id}
                href={link.url || '#'}
                target="_blank"
                rel="noopener noreferrer"
                className="group block"
              >
                <div className="mx-auto max-w-xl overflow-hidden rounded-lg border bg-card p-4 transition-all hover:scale-105 hover:shadow-lg">
                  <div className="flex items-center gap-4">
                    {link.image_url && (
                      <div className="relative h-12 w-12 shrink-0">
                        <Image
                          src={link.image_url}
                          alt={link.title || ''}
                          className="rounded object-cover"
                          fill
                          sizes="48px"
                        />
                      </div>
                    )}
                    <div className="flex-1 text-left">
                      <h3 className="font-medium group-hover:text-primary">
                        {link.title}
                      </h3>
                    </div>
                  </div>
                </div>
              </a>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
} 