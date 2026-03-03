import { Metadata } from 'next'
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { DataTable } from '@/components/ui/data-table'
import { Button } from '@/components/ui/button'
import { Plus } from 'lucide-react'
import { columns } from './columns'
import Link from 'next/link'
import { type Database } from '@/lib/database.types'
import { redirect } from 'next/navigation'

export const metadata: Metadata = {
  title: 'Manage Posts | Admin',
  description: 'Manage your blog posts',
}

export default async function PostsPage() {
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
            // The `set` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing user sessions.
          }
        },
        remove(name: string, options: CookieOptions) {
          try {
            cookieStore.set(name, '', options)
          } catch (error) {
            // The `remove` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing user sessions.
          }
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return redirect('/login?next=/admin/posts')
  }

  const { data: posts } = await supabase
    .from('posts')
    .select('*')
    .order('created_at', { ascending: false })

  // Calculate post stats
  const regularPosts = posts?.filter(post => (post as any).post_type !== 'chapter') || []
  const chapters = posts?.filter(post => (post as any).post_type === 'chapter') || []
  const drafts = posts?.filter(post => post.status === 'draft') || []
  const published = posts?.filter(post => post.status === 'published') || []

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-white">Posts</h1>
          <p className="text-sm text-gray-400">Manage your blog posts and chapters</p>
          <div className="flex items-center gap-4 mt-2 text-sm">
            <span className="text-purple-400">{posts?.length || 0} total</span>
            <span className="text-blue-400">{chapters.length} chapters</span>
            <span className="text-green-400">{published.length} published</span>
            <span className="text-yellow-400">{drafts.length} drafts</span>
          </div>
        </div>
        <Button asChild>
          <Link href="/admin/posts/new">
            <Plus className="w-4 h-4 mr-2" />
            New Post
          </Link>
        </Button>
      </div>

      <DataTable
        columns={columns}
        data={posts || []}
      />
    </div>
  )
} 