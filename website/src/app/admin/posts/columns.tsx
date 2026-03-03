'use client'

import { ColumnDef } from '@tanstack/react-table'
import { Database } from '@/lib/database.types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { MoreHorizontal, Pencil, Eye, Trash2, Calendar, Clock } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import Image from 'next/image'
import { format } from 'date-fns'
import { useAuth } from '@/contexts/AuthContext'

type Post = Database['public']['Tables']['posts']['Row']

// Create a new ActionCell component
function ActionCell({ row }: { row: any }) {
  const router = useRouter()
  const post = row.original
  const { supabase } = useAuth()

  const handleDelete = async () => {
    if (!supabase) {
      toast.error('Supabase client not available. Cannot delete post.')
      return
    }
    if (!confirm('Are you sure you want to delete this post? This action cannot be undone.')) return

    try {
      const { error } = await supabase
        .from('posts')
        .delete()
        .eq('id', post.id)

      if (error) throw error

      toast.success('Post deleted successfully')
      router.refresh()
    } catch (error) {
      console.error('Error deleting post:', error)
      toast.error('Failed to delete post')
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="h-8 w-8 p-0 hover:bg-purple-500/10">
          <span className="sr-only">Open menu</span>
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[160px]">
        <DropdownMenuItem asChild>
          <Link href={`/blog/${post.slug}`} className="flex items-center cursor-pointer">
            <Eye className="mr-2 h-4 w-4" />
            View Post
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href={`/admin/posts/${post.slug}/edit`} className="flex items-center cursor-pointer">
            <Pencil className="mr-2 h-4 w-4" />
            Edit Post
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem 
          onClick={handleDelete}
          className="text-red-600 focus:text-red-600 focus:bg-red-600/10"
        >
          <Trash2 className="mr-2 h-4 w-4" />
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export const columns: ColumnDef<Post>[] = [
  {
    accessorKey: 'cover_image',
    header: '',
    cell: ({ row }) => {
      const post = row.original
      return (
        <div className="relative w-16 h-16 rounded-md overflow-hidden">
          {post.cover_image ? (
            <Image
              src={post.cover_image}
              alt={post.title}
              fill
              className="object-cover"
              sizes="64px"
            />
          ) : (
            <div className="w-full h-full bg-purple-500/10 flex items-center justify-center">
              <span className="text-xs text-purple-400">No image</span>
            </div>
          )}
        </div>
      )
    },
  },
  {
    accessorKey: 'title',
    header: 'Title',
    cell: ({ row }) => {
      const post = row.original
      const postType = (post as any).post_type || 'regular'
      
      return (
        <div className="flex flex-col max-w-[500px]">
          <div className="flex items-center gap-2">
            <span className="font-medium text-white truncate">{post.title}</span>
            {postType === 'chapter' && (
              <Badge variant="outline" className="text-xs bg-purple-500/20 text-purple-300 border-purple-500/30">
                Chapter
              </Badge>
            )}
          </div>
          {post.description && (
            <span className="text-sm text-gray-400 truncate">{post.description}</span>
          )}
          <span className="text-xs text-purple-400 mt-1">/{post.slug}</span>
        </div>
      )
    },
  },
  {
    accessorKey: 'status',
    header: 'Status',
    cell: ({ row }) => {
      const status = row.getValue('status') as string
      return (
        <Badge 
          variant={status === 'published' ? 'default' : 'secondary'}
          className={status === 'published' ? 'bg-green-500/20 text-green-400 hover:bg-green-500/30' : ''}
        >
          {status === 'published' ? 'Published' : 'Draft'}
        </Badge>
      )
    },
  },
  {
    accessorKey: 'published_at',
    header: 'Published',
    cell: ({ row }) => {
      const post = row.original
      const date = post.published_at || post.created_at

      return (
        <div className="flex items-center gap-2 text-sm text-gray-400">
          <Calendar className="w-4 h-4" />
          <span>{format(new Date(date), 'MMM d, yyyy')}</span>
          <Clock className="w-4 h-4 ml-2" />
          <span>{format(new Date(date), 'h:mm a')}</span>
        </div>
      )
    },
  },
  {
    id: 'actions',
    cell: ({ row }) => <ActionCell row={row} />,
  },
] 