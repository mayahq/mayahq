'use client'

import { useState, useEffect, useCallback } from 'react'
import Image from 'next/image'
import { cn } from '@/lib/utils'
import {
  X,
  Check,
  Send,
  Edit3,
  ExternalLink,
  Twitter,
  Linkedin,
  Loader2,
  ImageIcon,
  Download,
} from 'lucide-react'

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

interface DigestPostModalProps {
  post: DigestPost
  open: boolean
  onClose: () => void
  onApprove: (id: string) => Promise<void>
  onReject: (id: string) => Promise<void>
  onEdit: (id: string, xContent: string, linkedinContent: string) => Promise<void>
  onEditPrompt: (id: string, imagePrompt: string) => Promise<void>
  onPost: (id: string) => Promise<void>
  onGenerateImage: (id: string) => Promise<void>
}

const STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  pending_review: { bg: 'bg-yellow-500/10', text: 'text-yellow-400', label: 'Pending Review' },
  approved: { bg: 'bg-green-500/10', text: 'text-green-400', label: 'Approved' },
  rejected: { bg: 'bg-red-500/10', text: 'text-red-400', label: 'Rejected' },
  posted: { bg: 'bg-blue-500/10', text: 'text-blue-400', label: 'Posted' },
  failed: { bg: 'bg-red-500/10', text: 'text-red-400', label: 'Failed' },
}

export function DigestPostModal({
  post,
  open,
  onClose,
  onApprove,
  onReject,
  onEdit,
  onEditPrompt,
  onPost,
  onGenerateImage,
}: DigestPostModalProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [editX, setEditX] = useState(post.x_content || '')
  const [editLinkedin, setEditLinkedin] = useState(post.linkedin_content || '')
  const [isEditingPrompt, setIsEditingPrompt] = useState(false)
  const [editPrompt, setEditPrompt] = useState(post.image_prompt || '')
  const [isLoading, setIsLoading] = useState(false)
  const [isGeneratingImage, setIsGeneratingImage] = useState(false)

  const status = STATUS_STYLES[post.status] || STATUS_STYLES.pending_review
  const canEdit = post.status === 'pending_review' || post.status === 'approved'

  // Reset state when post changes
  useEffect(() => {
    setEditX(post.x_content || '')
    setEditLinkedin(post.linkedin_content || '')
    setEditPrompt(post.image_prompt || '')
    setIsEditing(false)
    setIsEditingPrompt(false)
  }, [post.id, post.x_content, post.linkedin_content, post.image_prompt])

  // Close on Escape
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    if (open) window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [open, onClose])

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [open])

  const handleApprove = async () => {
    setIsLoading(true)
    try { await onApprove(post.id) } finally { setIsLoading(false) }
  }

  const handleReject = async () => {
    setIsLoading(true)
    try { await onReject(post.id) } finally { setIsLoading(false) }
  }

  const handleSaveEdit = async () => {
    setIsLoading(true)
    try {
      await onEdit(post.id, editX, editLinkedin)
      setIsEditing(false)
    } finally { setIsLoading(false) }
  }

  const handleSavePrompt = async () => {
    setIsLoading(true)
    try {
      await onEditPrompt(post.id, editPrompt)
      setIsEditingPrompt(false)
    } finally { setIsLoading(false) }
  }

  const handlePost = async () => {
    setIsLoading(true)
    try { await onPost(post.id) } finally { setIsLoading(false) }
  }

  const handleGenerateImage = async () => {
    setIsGeneratingImage(true)
    try { await onGenerateImage(post.id) } finally { setIsGeneratingImage(false) }
  }

  const handleDownloadImage = async () => {
    if (!post.image_url) return
    try {
      const response = await fetch(post.image_url)
      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `digest-${post.topic.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.png`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      window.URL.revokeObjectURL(url)
    } catch {
      // Fallback: open in new tab
      window.open(post.image_url, '_blank')
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-xl border border-gray-800 bg-gray-950 shadow-2xl mx-4">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 z-10 rounded-full p-1.5 bg-gray-900/80 text-gray-400 hover:text-gray-200 hover:bg-gray-800 transition-colors"
        >
          <X className="h-4 w-4" />
        </button>

        {/* Image */}
        {post.image_url ? (
          <div className="relative w-full aspect-video bg-gray-900">
            <Image
              src={post.image_url}
              alt={post.topic}
              fill
              className="object-cover rounded-t-xl"
              sizes="(max-width: 768px) 100vw, 768px"
              priority
            />
            <button
              onClick={handleDownloadImage}
              className="absolute bottom-3 right-3 inline-flex items-center gap-1.5 rounded-lg bg-black/60 backdrop-blur-sm px-3 py-1.5 text-xs font-medium text-white hover:bg-black/80 transition-colors"
            >
              <Download className="h-3.5 w-3.5" />
              Download
            </button>
          </div>
        ) : post.image_prompt && post.status !== 'rejected' ? (
          <div className="p-4 bg-gray-900/50 border-b border-gray-800">
            <div className="flex items-center gap-2 mb-2">
              <ImageIcon className="h-4 w-4 text-gray-500" />
              <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Image Prompt</span>
            </div>
            {isEditingPrompt ? (
              <div className="space-y-2">
                <textarea
                  value={editPrompt}
                  onChange={(e) => setEditPrompt(e.target.value)}
                  rows={3}
                  className="w-full rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-200 focus:border-purple-500 focus:outline-none resize-none"
                />
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleSavePrompt}
                    disabled={isLoading}
                    className="rounded-md px-3 py-1.5 text-xs font-medium text-purple-400 bg-purple-500/10 hover:bg-purple-500/20 transition-colors disabled:opacity-50"
                  >
                    Save
                  </button>
                  <button
                    onClick={() => { setIsEditingPrompt(false); setEditPrompt(post.image_prompt || '') }}
                    className="rounded-md px-3 py-1.5 text-xs text-gray-400 bg-gray-800 hover:bg-gray-700 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <p
                className={cn(
                  'text-sm text-gray-400 leading-relaxed',
                  canEdit && 'cursor-pointer hover:text-gray-300 transition-colors'
                )}
                onClick={() => canEdit && setIsEditingPrompt(true)}
                title={canEdit ? 'Click to edit prompt' : undefined}
              >
                {post.image_prompt}
              </p>
            )}
          </div>
        ) : null}

        {/* Content */}
        <div className="p-5 space-y-5">
          {/* Title + Status */}
          <div className="flex items-start justify-between gap-3">
            <h2 className="text-lg font-semibold text-gray-100">{post.topic}</h2>
            <span
              className={cn(
                'inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium flex-shrink-0',
                status.bg,
                status.text
              )}
            >
              {status.label}
            </span>
          </div>

          {/* Tags */}
          {post.tags && post.tags.length > 0 && (
            <div className="flex items-center gap-1.5 flex-wrap">
              {post.tags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center rounded-full bg-gray-800 px-2 py-0.5 text-xs text-gray-400"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}

          {/* X Content */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Twitter className="h-4 w-4 text-gray-500" />
              <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">X / Twitter</span>
              {post.x_content && (
                <span className={cn('text-xs', post.x_content.length > 280 ? 'text-red-400' : 'text-gray-600')}>
                  {post.x_content.length}/280
                </span>
              )}
              {post.x_post_id && (
                <span className="text-xs text-green-400 ml-auto">Posted</span>
              )}
            </div>
            {isEditing ? (
              <textarea
                value={editX}
                onChange={(e) => setEditX(e.target.value)}
                maxLength={280}
                rows={4}
                className="w-full rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-200 focus:border-purple-500 focus:outline-none resize-none"
              />
            ) : (
              <div className="rounded-lg bg-gray-900/50 border border-gray-800 p-3">
                <p className="text-sm text-gray-200 whitespace-pre-wrap leading-relaxed">
                  {post.x_content || 'No X content'}
                </p>
              </div>
            )}
          </div>

          {/* LinkedIn Content */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Linkedin className="h-4 w-4 text-gray-500" />
              <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">LinkedIn</span>
              {post.linkedin_post_id && (
                <span className="text-xs text-green-400 ml-auto">Posted</span>
              )}
            </div>
            {isEditing ? (
              <textarea
                value={editLinkedin}
                onChange={(e) => setEditLinkedin(e.target.value)}
                rows={8}
                className="w-full rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-200 focus:border-purple-500 focus:outline-none resize-none"
              />
            ) : (
              <div className="rounded-lg bg-gray-900/50 border border-gray-800 p-3">
                <p className="text-sm text-gray-200 whitespace-pre-wrap leading-relaxed">
                  {post.linkedin_content || 'No LinkedIn content'}
                </p>
              </div>
            )}
          </div>

          {/* Sources */}
          {post.source_urls && post.source_urls.length > 0 && (
            <div className="space-y-2">
              <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Sources</span>
              <div className="flex flex-col gap-1">
                {post.source_urls.map((url, i) => {
                  let hostname = url
                  try { hostname = new URL(url).hostname.replace('www.', '') } catch {}
                  return (
                    <a
                      key={i}
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs text-purple-400 hover:text-purple-300 transition-colors"
                    >
                      <ExternalLink className="h-3 w-3 flex-shrink-0" />
                      <span className="truncate">{hostname}</span>
                      <span className="text-gray-600 truncate max-w-[300px]">{url}</span>
                    </a>
                  )
                })}
              </div>
            </div>
          )}

          {/* Metadata */}
          <div className="flex items-center gap-4 text-[11px] text-gray-600 pt-2 border-t border-gray-800">
            <span>Created: {new Date(post.created_at).toLocaleString()}</span>
            {post.approved_at && <span>Approved: {new Date(post.approved_at).toLocaleString()}</span>}
            {post.posted_at && <span>Posted: {new Date(post.posted_at).toLocaleString()}</span>}
          </div>
        </div>

        {/* Actions Bar */}
        <div className="sticky bottom-0 flex items-center justify-between p-4 border-t border-gray-800 bg-gray-950/95 backdrop-blur-sm rounded-b-xl gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            {post.status === 'pending_review' && (
              <>
                <button
                  onClick={handleApprove}
                  disabled={isLoading}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-green-500/10 px-3 py-1.5 text-xs font-medium text-green-400 hover:bg-green-500/20 transition-colors disabled:opacity-50"
                >
                  {isLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                  Approve
                </button>
                <button
                  onClick={handleReject}
                  disabled={isLoading}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-red-500/10 px-3 py-1.5 text-xs font-medium text-red-400 hover:bg-red-500/20 transition-colors disabled:opacity-50"
                >
                  <X className="h-3.5 w-3.5" />
                  Reject
                </button>
              </>
            )}

            {post.status === 'approved' && (
              <button
                onClick={handlePost}
                disabled={isLoading}
                className="inline-flex items-center gap-1.5 rounded-lg bg-purple-500/10 px-3 py-1.5 text-xs font-medium text-purple-400 hover:bg-purple-500/20 transition-colors disabled:opacity-50"
              >
                {isLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                Publish
              </button>
            )}

            {/* Image gen */}
            {post.image_prompt && !post.image_url && post.status !== 'rejected' && (
              <button
                onClick={handleGenerateImage}
                disabled={isGeneratingImage}
                className="inline-flex items-center gap-1.5 rounded-lg bg-cyan-500/10 px-3 py-1.5 text-xs font-medium text-cyan-400 hover:bg-cyan-500/20 transition-colors disabled:opacity-50"
              >
                {isGeneratingImage ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImageIcon className="h-3.5 w-3.5" />}
                {isGeneratingImage ? 'Generating...' : 'Generate Image'}
              </button>
            )}
            {post.image_prompt && post.image_url && post.status !== 'posted' && (
              <button
                onClick={handleGenerateImage}
                disabled={isGeneratingImage}
                className="inline-flex items-center gap-1.5 rounded-lg bg-gray-800 px-3 py-1.5 text-xs font-medium text-gray-400 hover:bg-gray-700 transition-colors disabled:opacity-50"
              >
                {isGeneratingImage ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImageIcon className="h-3.5 w-3.5" />}
                Regenerate Image
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            {canEdit && (
              isEditing ? (
                <>
                  <button
                    onClick={handleSaveEdit}
                    disabled={isLoading}
                    className="rounded-lg bg-purple-500/10 px-3 py-1.5 text-xs font-medium text-purple-400 hover:bg-purple-500/20 transition-colors disabled:opacity-50"
                  >
                    Save Changes
                  </button>
                  <button
                    onClick={() => { setIsEditing(false); setEditX(post.x_content || ''); setEditLinkedin(post.linkedin_content || '') }}
                    className="rounded-lg bg-gray-800 px-3 py-1.5 text-xs text-gray-400 hover:bg-gray-700 transition-colors"
                  >
                    Cancel
                  </button>
                </>
              ) : (
                <button
                  onClick={() => setIsEditing(true)}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-gray-800 px-3 py-1.5 text-xs font-medium text-gray-400 hover:bg-gray-700 transition-colors"
                >
                  <Edit3 className="h-3.5 w-3.5" />
                  Edit
                </button>
              )
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
