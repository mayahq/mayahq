'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { motion } from 'framer-motion'
import {
  Newspaper,
  RefreshCw,
  Play,
  Loader2,
  CheckCircle2,
  Clock,
  Send,
  XCircle,
} from 'lucide-react'
import { DigestRunHeader } from './components/digest-run-header'
import { DigestPostCard } from './components/digest-post-card'
import { DigestPostModal } from './components/digest-post-modal'

const MEMORY_WORKER_URL =
  process.env.NEXT_PUBLIC_MEMORY_WORKER_URL || 'http://localhost:3002'

interface DigestRun {
  id: string
  run_date: string
  status: string
  sources_used: string[] | null
  post_count: number
  error: string | null
  created_at: string
  completed_at: string | null
}

interface DigestPost {
  id: string
  run_id: string
  topic: string
  tags: string[] | null
  x_content: string | null
  linkedin_content: string | null
  source_urls: string[] | null
  source_context: Record<string, any> | null
  image_prompt: string | null
  image_url: string | null
  status: string
  x_post_id: string | null
  linkedin_post_id: string | null
  approved_at: string | null
  posted_at: string | null
  created_at: string
}

export default function DigestPage() {
  const { supabase, user } = useAuth()
  const [runs, setRuns] = useState<DigestRun[]>([])
  const [posts, setPosts] = useState<DigestPost[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isRunning, setIsRunning] = useState(false)
  const [filter, setFilter] = useState<string>('all')
  const [selectedPost, setSelectedPost] = useState<DigestPost | null>(null)

  const fetchData = useCallback(async () => {
    if (!supabase) return

    try {
      const [runsResult, postsResult] = await Promise.all([
        supabase
          .from('digest_runs')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(20),
        supabase
          .from('digest_posts')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(100),
      ])

      if (runsResult.error) throw runsResult.error
      if (postsResult.error) throw postsResult.error

      setRuns((runsResult.data || []) as DigestRun[])
      setPosts((postsResult.data || []) as DigestPost[])
    } catch (err) {
      console.error('Error fetching digest data:', err)
      toast.error('Failed to load digest data')
    } finally {
      setIsLoading(false)
    }
  }, [supabase])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Poll for active runs
  useEffect(() => {
    const activeRun = runs.find(
      (r) => r.status === 'researching' || r.status === 'generating' || r.status === 'pending'
    )
    if (!activeRun) return

    const interval = setInterval(fetchData, 5000)
    return () => clearInterval(interval)
  }, [runs, fetchData])

  const triggerRun = async () => {
    if (!supabase || !user) return

    setIsRunning(true)
    try {
      const { data: session } = await supabase.auth.getSession()
      const token = session?.session?.access_token

      const response = await fetch(`${MEMORY_WORKER_URL}/api/v1/digest/run`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      })

      if (!response.ok) {
        const err = await response.json()
        throw new Error(err.error || 'Failed to trigger digest')
      }

      toast.success('Digest run started')
      await fetchData()
    } catch (err: any) {
      console.error('Error triggering digest:', err)
      toast.error(err.message || 'Failed to trigger digest run')
    } finally {
      setIsRunning(false)
    }
  }

  const approvePost = async (postId: string) => {
    if (!supabase) return

    const { error } = await supabase
      .from('digest_posts')
      .update({ status: 'approved', approved_at: new Date().toISOString() })
      .eq('id', postId)

    if (error) {
      toast.error('Failed to approve post')
      return
    }

    toast.success('Post approved')
    await fetchData()
  }

  const rejectPost = async (postId: string) => {
    if (!supabase) return

    const { error } = await supabase
      .from('digest_posts')
      .update({ status: 'rejected' })
      .eq('id', postId)

    if (error) {
      toast.error('Failed to reject post')
      return
    }

    toast.success('Post rejected')
    await fetchData()
  }

  const editPost = async (
    postId: string,
    xContent: string,
    linkedinContent: string
  ) => {
    if (!supabase) return

    const { error } = await supabase
      .from('digest_posts')
      .update({ x_content: xContent, linkedin_content: linkedinContent })
      .eq('id', postId)

    if (error) {
      toast.error('Failed to save edits')
      return
    }

    toast.success('Post updated')
    await fetchData()
  }

  const editPrompt = async (postId: string, imagePrompt: string) => {
    if (!supabase) return

    const { error } = await supabase
      .from('digest_posts')
      .update({ image_prompt: imagePrompt })
      .eq('id', postId)

    if (error) {
      toast.error('Failed to save prompt')
      return
    }

    toast.success('Image prompt updated')
    await fetchData()
  }

  const publishPost = async (postId: string) => {
    if (!supabase || !user) return

    try {
      const { data: session } = await supabase.auth.getSession()
      const token = session?.session?.access_token

      const response = await fetch(
        `${MEMORY_WORKER_URL}/api/v1/digest/post/${postId}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
        }
      )

      if (!response.ok) {
        const err = await response.json()
        throw new Error(err.error || 'Failed to post')
      }

      const result = await response.json()

      if (result.result?.x?.success || result.result?.linkedin?.success) {
        toast.success('Post published successfully')
      } else {
        toast.error('Post publish failed on all platforms')
      }

      await fetchData()
    } catch (err: any) {
      console.error('Error publishing post:', err)
      toast.error(err.message || 'Failed to publish post')
    }
  }

  const generateImage = async (postId: string) => {
    if (!supabase || !user) return

    try {
      const { data: session } = await supabase.auth.getSession()
      const token = session?.session?.access_token

      const response = await fetch(
        `${MEMORY_WORKER_URL}/api/v1/digest/post/${postId}/generate-image`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
        }
      )

      if (!response.ok) {
        const err = await response.json()
        throw new Error(err.error || 'Failed to generate image')
      }

      toast.success('Image generated')
      await fetchData()
    } catch (err: any) {
      console.error('Error generating image:', err)
      toast.error(err.message || 'Failed to generate image')
    }
  }

  // Stats
  const pendingCount = posts.filter((p) => p.status === 'pending_review').length
  const approvedCount = posts.filter((p) => p.status === 'approved').length
  const postedCount = posts.filter((p) => p.status === 'posted').length
  const rejectedCount = posts.filter((p) => p.status === 'rejected').length

  // Filter posts
  const filteredPosts =
    filter === 'all' ? posts : posts.filter((p) => p.status === filter)

  // Group posts by run
  const postsByRun = new Map<string, DigestPost[]>()
  for (const post of filteredPosts) {
    const group = postsByRun.get(post.run_id) || []
    group.push(post)
    postsByRun.set(post.run_id, group)
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-purple-400" />
          <span className="text-sm text-gray-400">Loading digest...</span>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Newspaper className="h-6 w-6 text-purple-400" />
          <h1 className="text-lg font-bold text-gray-100">Daily Digest</h1>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={fetchData}
            className="inline-flex items-center gap-1.5 rounded-lg bg-gray-800 px-3 py-2 text-xs font-medium text-gray-400 hover:bg-gray-700 transition-colors"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </button>
          <button
            onClick={triggerRun}
            disabled={isRunning}
            className="inline-flex items-center gap-1.5 rounded-lg bg-purple-500/20 px-3 py-2 text-xs font-medium text-purple-400 hover:bg-purple-500/30 transition-colors disabled:opacity-50"
          >
            {isRunning ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Play className="h-3.5 w-3.5" />
            )}
            Run Digest
          </button>
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-4 gap-3">
        {[
          {
            label: 'Pending',
            count: pendingCount,
            icon: Clock,
            color: 'text-yellow-400',
            bg: 'bg-yellow-500/10',
          },
          {
            label: 'Approved',
            count: approvedCount,
            icon: CheckCircle2,
            color: 'text-green-400',
            bg: 'bg-green-500/10',
          },
          {
            label: 'Posted',
            count: postedCount,
            icon: Send,
            color: 'text-blue-400',
            bg: 'bg-blue-500/10',
          },
          {
            label: 'Rejected',
            count: rejectedCount,
            icon: XCircle,
            color: 'text-red-400',
            bg: 'bg-red-500/10',
          },
        ].map((stat) => {
          const Icon = stat.icon
          return (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-lg border border-gray-800 bg-gray-900/50 p-3"
            >
              <div className="flex items-center gap-2">
                <div className={cn('rounded-md p-1.5', stat.bg)}>
                  <Icon className={cn('h-4 w-4', stat.color)} />
                </div>
                <div>
                  <p className="text-lg font-bold text-gray-100">
                    {stat.count}
                  </p>
                  <p className="text-xs text-gray-500">{stat.label}</p>
                </div>
              </div>
            </motion.div>
          )
        })}
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-1 border-b border-gray-800 pb-px">
        {[
          { key: 'all', label: 'All' },
          { key: 'pending_review', label: 'Pending' },
          { key: 'approved', label: 'Approved' },
          { key: 'posted', label: 'Posted' },
          { key: 'rejected', label: 'Rejected' },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setFilter(tab.key)}
            className={cn(
              'px-3 py-2 text-xs font-medium transition-colors rounded-t-md',
              filter === tab.key
                ? 'text-purple-400 bg-purple-500/10 border-b-2 border-purple-400'
                : 'text-gray-500 hover:text-gray-300'
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Runs + Posts */}
      {runs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Newspaper className="h-12 w-12 text-gray-700 mb-3" />
          <h3 className="text-sm font-medium text-gray-400 mb-1">
            No digest runs yet
          </h3>
          <p className="text-xs text-gray-600 max-w-xs">
            Click &quot;Run Digest&quot; to research trending topics and
            generate social media posts.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {runs.map((run) => {
            const runPosts = postsByRun.get(run.id) || []
            // Skip runs with no matching posts if filter is active
            if (filter !== 'all' && runPosts.length === 0) return null

            return (
              <motion.div
                key={run.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-3"
              >
                <DigestRunHeader run={run} />

                {runPosts.length > 0 && (
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                    {runPosts.map((post) => (
                      <DigestPostCard
                        key={post.id}
                        post={post}
                        onApprove={approvePost}
                        onReject={rejectPost}
                        onEdit={editPost}
                        onEditPrompt={editPrompt}
                        onPost={publishPost}
                        onGenerateImage={generateImage}
                        onClick={() => setSelectedPost(post)}
                      />
                    ))}
                  </div>
                )}
              </motion.div>
            )
          })}
        </div>
      )}

      {/* Detail Modal */}
      {selectedPost && (
        <DigestPostModal
          post={posts.find((p) => p.id === selectedPost.id) || selectedPost}
          open={!!selectedPost}
          onClose={() => setSelectedPost(null)}
          onApprove={approvePost}
          onReject={rejectPost}
          onEdit={editPost}
          onEditPrompt={editPrompt}
          onPost={publishPost}
          onGenerateImage={generateImage}
        />
      )}
    </div>
  )
}
