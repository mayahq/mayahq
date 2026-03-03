import { Metadata } from 'next'
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'
import Image from 'next/image'
import { User, Github, Instagram, Youtube, Link2 } from 'lucide-react'
import { XLogo } from '@/components/icons/x-logo'
import { LinkedInLogo } from '@/components/icons/linkedin-logo'
import { type Database } from '@/lib/database.types'

export const dynamic = "force-dynamic";
export const revalidate = 0;

type LinkType = Database['public']['Tables']['links']['Row']
type SocialType = Database['public']['Tables']['socials']['Row']

const PLATFORM_ICONS: Record<string, any> = {
  twitter: XLogo,
  x: XLogo,
  github: Github,
  linkedin: LinkedInLogo,
  instagram: Instagram,
  youtube: Youtube,
}

const PLATFORM_LABELS: Record<string, string> = {
  twitter: '𝕏',
  x: '𝕏',
  github: 'GitHub',
  linkedin: 'LinkedIn',
  instagram: 'Instagram',
  youtube: 'YouTube',
}


export const metadata: Metadata = {
  title: 'Maya Scott | Links',
  description: 'Connect with Maya Scott and explore her content',
}

export default async function LinksPage() {
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
            // Can be ignored in Server Components
          }
        },
        remove(name: string, options: CookieOptions) {
          try {
            cookieStore.set(name, '', options)
          } catch (error) {
            // Can be ignored in Server Components
          }
        },
      },
    }
  )

  let profileResult = await supabase
    .from('profiles')
    .select('*')
    .eq('id', '61770892-9e5b-46a5-b622-568be7066664')
    .single()

  if (!profileResult.data) {
    console.log('[LinksPage] Profile by ID not found, trying name search')
    profileResult = await supabase
      .from('profiles')
      .select('*')
      .ilike('name', '%Maya%')
      .limit(1)
      .single()
  }

  if (!profileResult.data) {
    console.log('[LinksPage] Profile by name not found, trying first available profile')
    profileResult = await supabase
      .from('profiles')
      .select('*')
      .limit(1)
      .single()
  }

  const [linksResult, socialsResult] = await Promise.all([
    supabase
      .from('links')
      .select('*')
      .eq('is_active', true)
      .order('order'),
    supabase
      .from('socials')
      .select('*')
      .order('id'),
  ])

  const profile = profileResult.data
  const links = (linksResult.data as LinkType[]) || []
  const socials = (socialsResult.data as SocialType[]) || []

  console.log('[DEBUG] LinksPage fetched profile:', profile)
  console.log('[DEBUG] LinksPage fetched links:', links)
  console.log('[DEBUG] LinksPage fetched socials:', socials)

  if (!profile) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-lg text-gray-400">Profile not found</p>
      </div>
    )
  }

  const transformedSocials = socials.map(social => ({
    ...social,
    platform: social.platform?.toLowerCase() === 'twitter' ? 'x' : social.platform?.toLowerCase(),
    label: PLATFORM_LABELS[social.platform?.toLowerCase() || ''] || social.platform || '',
  }))

  return (
    <main className="min-h-screen bg-gradient-to-b from-black to-gray-900">
      <div className="max-w-2xl mx-auto px-4 py-16 sm:py-24 space-y-8">
        {/* Profile Section */}
        <div className="flex flex-col items-center gap-4">
          <div className="relative w-24 h-24">
            {profile.avatar_url ? (
              <Image
                src={profile.avatar_url}
                alt={profile.name}
                fill
                className="rounded-full object-cover border-4 border-purple-500/30 shadow-[0_0_25px_rgba(168,85,247,0.35)]"
                sizes="96px"
                priority
              />
            ) : (
              <div className="w-full h-full rounded-full bg-purple-500/20 border-4 border-purple-500/30 shadow-[0_0_25px_rgba(168,85,247,0.35)] flex items-center justify-center">
                <User className="w-12 h-12 text-purple-400" />
              </div>
            )}
          </div>
          <div className="text-center">
            <h1 className="text-2xl font-bold text-white">{profile.name}</h1>
            {profile.bio && (
              <p className="mt-2 text-gray-400 max-w-md text-center">{profile.bio}</p>
            )}
          </div>
        </div>

        {/* Socials Section */}
        {transformedSocials.length > 0 && (
          <div className="flex justify-center items-center gap-6">
            {transformedSocials.map((social) => {
              const platform = social.platform || ''
              const Icon = PLATFORM_ICONS[platform] || Link2

              return (
                <a
                  key={social.id}
                  href={social.url || '#'}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-gray-400 hover:text-purple-500 transition-colors"
                  title={social.label}
                >
                  <Icon className="w-6 h-6" />
                </a>
              )
            })}
          </div>
        )}

        {/* Links Section */}
        <div className="space-y-4">
          {links.map((link) => (
            <a
              key={link.id}
              href={link.url || '#'}
              target="_blank"
              rel="noopener noreferrer"
              className="block w-full p-4 rounded-lg bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/20 hover:border-purple-500/30 transition-all group"
            >
              <div className="flex items-center gap-4">
                {link.image_url && (
                  <div className="relative w-12 h-12 rounded-md overflow-hidden flex-shrink-0">
                    <Image
                      src={link.image_url}
                      alt={link.title || ''}
                      fill
                      className="object-cover"
                      sizes="48px"
                    />
                  </div>
                )}
                <div className="flex-grow min-w-0">
                  <h2 className="text-white font-medium truncate group-hover:text-purple-400 transition-colors">
                    {link.title}
                  </h2>
                  <p className="text-sm text-gray-400 truncate">{link.url}</p>
                </div>
              </div>
            </a>
          ))}
        </div>
      </div>
    </main>
  )
} 