import { Metadata } from 'next'
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { PostForm } from '../../components/post-form'
import { notFound, redirect } from 'next/navigation'
import { type Database } from '@/lib/database.types'

export const metadata: Metadata = {
  title: 'Edit Post | Admin',
  description: 'Edit your blog post',
}

interface EditPostPageProps {
  params: {
    slug: string
  }
}

export default async function EditPostPage({ params }: EditPostPageProps) {
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

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return redirect('/login?next=/admin/posts/' + params.slug + '/edit')
  }

  const { data: post } = await supabase
    .from('posts')
    .select('*')
    .eq('slug', params.slug)
    .single()

  if (!post) {
    notFound()
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-white">Edit Post</h1>
        <p className="text-sm text-gray-400">Edit your blog post</p>
      </div>

      <PostForm initialData={post} />
    </div>
  )
} 