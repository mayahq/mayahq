import { Metadata } from 'next'
import { PostForm } from '../components/post-form'

export const metadata: Metadata = {
  title: 'New Post | Admin',
  description: 'Create a new blog post',
}

export default function NewPostPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-white">New Post</h1>
        <p className="text-sm text-gray-400">Create a new blog post</p>
      </div>

      <PostForm />
    </div>
  )
} 