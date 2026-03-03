import { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Image from 'next/image'
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { Badge } from '@/components/ui/badge'
import { format } from 'date-fns'
import { Calendar } from 'lucide-react'
import { MDXRemote } from 'next-mdx-remote/rsc'
import rehypeHighlight from 'rehype-highlight'
import rehypeSlug from 'rehype-slug'
import remarkGfm from 'remark-gfm'
import { type Database } from '@/lib/database.types'

interface Props {
  params: {
    slug: string
  }
}

type PostWithTags = Database['public']['Tables']['posts']['Row'] & {
  post_tags: Array<{
    tag: {
      name: string
      description: string | null
    }
  }>
}

function getSupabaseClient() {
  const cookieStore = cookies()
  return createServerClient<Database>(
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
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const supabase = getSupabaseClient()
  const { data: post } = await supabase
    .from('posts')
    .select('title, description, cover_image')
    .eq('slug', params.slug)
    .single()

  if (!post) {
    return {
      title: 'Post Not Found',
      description: 'The requested blog post could not be found.'
    }
  }

  return {
    title: post.title,
    description: post.description,
    openGraph: post.cover_image ? {
      images: [{ url: post.cover_image }]
    } : undefined,
    twitter: post.cover_image ? {
      card: 'summary_large_image',
      title: post.title,
      description: post.description || undefined,
      images: [post.cover_image],
    } : undefined
  }
}

export default async function BlogPost({ params }: Props) {
  const supabase = getSupabaseClient()
  
  const { data: postData } = await supabase
    .from('posts')
    .select('*, post_tags(tag:tags(name, description))') // Simplified select for join
    .eq('slug', params.slug)
    .single()

  if (!postData) {
    notFound()
  }
  
  const post = postData as PostWithTags
  const tags = post.post_tags?.map(pt => pt.tag.name) || []

  const mdxOptions = {
    mdxOptions: {
      remarkPlugins: [remarkGfm],
      rehypePlugins: [rehypeHighlight, rehypeSlug],
    },
  }

  return (
    <article className="min-h-screen">
      {/* Hero Section with Full-width Image */}
      <div className="relative w-full h-[60vh] min-h-[400px]">
        {post.cover_image ? (
          <Image
            src={post.cover_image}
            alt={post.title}
            fill
            priority
            className="object-cover"
          />
        ) : (
          <div className="w-full h-full bg-purple-500/10" />
        )}
        
        {/* Gradient Overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/50 to-transparent" />
        
        {/* Title and Meta Content */}
        <div className="absolute bottom-0 left-0 right-0 p-8 md:p-12">
          <div className="max-w-4xl mx-auto">
            <h1 className="text-4xl md:text-5xl font-bold text-white mb-4">
              {post.title}
            </h1>
            {post.description && (
              <p className="text-lg text-gray-200 mb-4">
                {post.description}
              </p>
            )}
            <div className="flex items-center gap-4 text-gray-300 mb-4">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4" />
                <time dateTime={post.published_at || post.created_at}>
                  {format(new Date(post.published_at || post.created_at), 'MMMM d, yyyy')}
                </time>
              </div>
            </div>
            {/* Tags */}
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {tags.map((tag: string) => (
                  <Badge 
                    key={tag}
                    variant="secondary" 
                    className="bg-purple-500/20 text-purple-300 hover:bg-purple-500/30"
                  >
                    {tag}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Post Content */}
      <div className="max-w-4xl mx-auto px-4 py-12">
        <div className="prose prose-invert prose-purple max-w-none">
          {post.body && <MDXRemote source={post.body} options={mdxOptions} />}
        </div>
      </div>
    </article>
  )
} 