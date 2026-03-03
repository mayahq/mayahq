import { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { type Database } from '@/lib/database.types'

export const metadata: Metadata = {
  title: 'Maya Scott | Blog',
  description: 'Thoughts on AI, technology, and building in public',
}

type Post = Database['public']['Tables']['posts']['Row']

export default async function BlogPage() {
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

  const { data: posts } = await supabase
    .from('posts')
    .select('*')
    .eq('status', 'published')
    .order('published_at', { ascending: false })

  return (
    <main className="min-h-screen bg-gradient-to-b from-black to-gray-900">
      <div className="max-w-4xl mx-auto px-4 py-16 sm:py-24">
        {/* Header */}
        <div className="mb-16 text-center">
          <h1 className="text-4xl font-bold text-white mb-4">Blog</h1>
          <p className="text-gray-400 max-w-2xl mx-auto">
            Thoughts on AI, technology, and building in public. Join me as I explore the future of software development and artificial intelligence.
          </p>
        </div>

        {/* Posts Grid */}
        <div className="grid gap-8 md:grid-cols-2">
          {posts?.map((post) => (
            <Link
              key={post.id}
              href={`/blog/${post.slug}`}
              className="group block"
            >
              <article className="rounded-lg overflow-hidden bg-purple-500/10 border border-purple-500/20 hover:border-purple-500/30 transition-all">
                {post.cover_image && (
                  <div className="relative w-full h-48">
                    <Image
                      src={post.cover_image}
                      alt={post.title}
                      fill
                      className="object-cover transition-transform group-hover:scale-105"
                      sizes="(max-width: 768px) 100vw, 50vw"
                    />
                  </div>
                )}
                <div className="p-6">
                  <h2 className="text-xl font-semibold text-white group-hover:text-purple-400 transition-colors mb-2">
                    {post.title}
                  </h2>
                  {post.description && (
                    <p className="text-gray-400 mb-4 line-clamp-2">
                      {post.description}
                    </p>
                  )}
                  <div className="flex items-center text-sm text-gray-500">
                    {post.published_at && (
                      <time dateTime={post.published_at}>
                        {new Date(post.published_at).toLocaleDateString('en-US', {
                          month: 'long',
                          day: 'numeric',
                          year: 'numeric'
                        })}
                      </time>
                    )}
                    {post.reading_time && (
                      <>
                        <span className="mx-2">·</span>
                        <span>{post.reading_time} min read</span>
                      </>
                    )}
                  </div>
                </div>
              </article>
            </Link>
          ))}
        </div>

        {/* Empty State */}
        {(!posts || posts.length === 0) && (
          <div className="text-center py-16">
            <p className="text-gray-400">No blog posts yet. Check back soon!</p>
          </div>
        )}
      </div>
    </main>
  )
} 