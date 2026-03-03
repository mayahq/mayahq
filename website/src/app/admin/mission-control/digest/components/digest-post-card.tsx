'use client'

import { useState } from 'react'
import Image from 'next/image'
import { cn } from '@/lib/utils'
import {
  Check,
  X,
  Send,
  Edit3,
  ExternalLink,
  Tag,
  Twitter,
  Linkedin,
  Loader2,
  ImageIcon,
  ChevronDown,
  ChevronUp,
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

interface DigestPostCardProps {
  post: DigestPost
  onApprove: (id: string) => Promise<void>
  onReject: (id: string) => Promise<void>
  onEdit: (id: string, xContent: string, linkedinContent: string) => Promise<void>
  onEditPrompt: (id: string, imagePrompt: string) => Promise<void>
  onPost: (id: string) => Promise<void>
  onGenerateImage: (id: string) => Promise<void>
  onClick?: () => void
}

const STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  pending_review: { bg: 'bg-yellow-500/10', text: 'text-yellow-400', label: 'Pending' },
  approved: { bg: 'bg-green-500/10', text: 'text-green-400', label: 'Approved' },
  rejected: { bg: 'bg-red-500/10', text: 'text-red-400', label: 'Rejected' },
  posted: { bg: 'bg-blue-500/10', text: 'text-blue-400', label: 'Posted' },
  failed: { bg: 'bg-red-500/10', text: 'text-red-400', label: 'Failed' },
}

export function DigestPostCard({
  post,
  onApprove,
  onReject,
  onEdit,
  onEditPrompt,
  onPost,
  onGenerateImage,
  onClick,
}: DigestPostCardProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [editX, setEditX] = useState(post.x_content || '')
  const [editLinkedin, setEditLinkedin] = useState(post.linkedin_content || '')
  const [isEditingPrompt, setIsEditingPrompt] = useState(false)
  const [editPrompt, setEditPrompt] = useState(post.image_prompt || '')
  const [isLoading, setIsLoading] = useState(false)
  const [isGeneratingImage, setIsGeneratingImage] = useState(false)
  const [showLinkedin, setShowLinkedin] = useState(false)

  const status = STATUS_STYLES[post.status] || STATUS_STYLES.pending_review

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

  const canEdit = post.status === 'pending_review' || post.status === 'approved'

  return (
    <div className="rounded-lg border border-gray-800 bg-gray-900/50 overflow-hidden flex flex-col hover:border-gray-700 transition-colors">
      {/* Header — clickable */}
      <div
        className="flex items-center justify-between p-3 border-b border-gray-800 cursor-pointer"
        onClick={onClick}
      >
        <h3 className="text-sm font-medium text-gray-200 truncate mr-2">
          {post.topic}
        </h3>
        <span
          className={cn(
            'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium flex-shrink-0',
            status.bg,
            status.text
          )}
        >
          {status.label}
        </span>
      </div>

      {/* Image — clickable */}
      {post.image_url ? (
        <div className="border-b border-gray-800 cursor-pointer" onClick={onClick}>
          <div className="relative w-full aspect-video">
            <Image
              src={post.image_url}
              alt={post.topic}
              fill
              className="object-cover"
              sizes="(max-width: 768px) 100vw, 33vw"
            />
          </div>
        </div>
      ) : (
        /* Image prompt + generate */
        post.image_prompt && post.status !== 'rejected' && (
          <div className="border-b border-gray-800 p-3 bg-gray-900/30">
            {isEditingPrompt ? (
              <div className="space-y-2">
                <textarea
                  value={editPrompt}
                  onChange={(e) => setEditPrompt(e.target.value)}
                  rows={3}
                  className="w-full rounded-md border border-gray-700 bg-gray-800 px-2 py-1.5 text-xs text-gray-200 focus:border-purple-500 focus:outline-none resize-none"
                />
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={handleSavePrompt}
                    disabled={isLoading}
                    className="rounded px-2 py-1 text-xs font-medium text-purple-400 bg-purple-500/10 hover:bg-purple-500/20 transition-colors disabled:opacity-50"
                  >
                    Save
                  </button>
                  <button
                    onClick={() => { setIsEditingPrompt(false); setEditPrompt(post.image_prompt || '') }}
                    className="rounded px-2 py-1 text-xs text-gray-400 bg-gray-800 hover:bg-gray-700 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-start gap-2">
                <ImageIcon className="h-3.5 w-3.5 text-gray-600 mt-0.5 flex-shrink-0" />
                <p
                  className="text-xs text-gray-500 flex-1 cursor-pointer hover:text-gray-400 transition-colors"
                  onClick={() => canEdit && setIsEditingPrompt(true)}
                  title={canEdit ? 'Click to edit prompt' : undefined}
                >
                  {post.image_prompt}
                </p>
              </div>
            )}
          </div>
        )
      )}

      {/* Tags */}
      {post.tags && post.tags.length > 0 && (
        <div className="flex items-center gap-1 px-3 pt-2 flex-wrap">
          {post.tags.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center rounded-full bg-gray-800 px-1.5 py-0.5 text-[10px] text-gray-400"
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* X Content — clickable */}
      <div className="p-3 flex-1 cursor-pointer" onClick={onClick}>
        <div className="flex items-center gap-1.5 mb-1.5">
          <Twitter className="h-3.5 w-3.5 text-gray-500" />
          <span className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">X</span>
          {post.x_content && (
            <span className={cn('text-[10px]', post.x_content.length > 280 ? 'text-red-400' : 'text-gray-600')}>
              {post.x_content.length}/280
            </span>
          )}
        </div>
        {isEditing ? (
          <textarea
            value={editX}
            onChange={(e) => setEditX(e.target.value)}
            maxLength={280}
            rows={3}
            className="w-full rounded-md border border-gray-700 bg-gray-800 px-2 py-1.5 text-xs text-gray-200 focus:border-purple-500 focus:outline-none resize-none"
          />
        ) : (
          <p className="text-xs text-gray-300 whitespace-pre-wrap leading-relaxed">
            {post.x_content || 'No X content'}
          </p>
        )}
        {post.x_post_id && (
          <p className="mt-1 text-[10px] text-green-400">Posted</p>
        )}

        {/* LinkedIn — collapsible */}
        <button
          onClick={() => setShowLinkedin(!showLinkedin)}
          className="flex items-center gap-1.5 mt-3 text-[10px] font-medium text-gray-500 uppercase tracking-wide hover:text-gray-400 transition-colors"
        >
          <Linkedin className="h-3.5 w-3.5" />
          LinkedIn
          {showLinkedin ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        </button>
        {showLinkedin && (
          <div className="mt-1.5">
            {isEditing ? (
              <textarea
                value={editLinkedin}
                onChange={(e) => setEditLinkedin(e.target.value)}
                rows={5}
                className="w-full rounded-md border border-gray-700 bg-gray-800 px-2 py-1.5 text-xs text-gray-200 focus:border-purple-500 focus:outline-none resize-none"
              />
            ) : (
              <p className="text-xs text-gray-300 whitespace-pre-wrap leading-relaxed max-h-32 overflow-y-auto">
                {post.linkedin_content || 'No LinkedIn content'}
              </p>
            )}
            {post.linkedin_post_id && (
              <p className="mt-1 text-[10px] text-green-400">Posted</p>
            )}
          </div>
        )}
      </div>

      {/* Sources */}
      {post.source_urls && post.source_urls.length > 0 && (
        <div className="px-3 pb-2">
          <div className="flex items-center gap-1.5 flex-wrap">
            {post.source_urls.map((url, i) => {
              let hostname = url
              try { hostname = new URL(url).hostname.replace('www.', '') } catch {}
              return (
                <a
                  key={i}
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-0.5 text-[10px] text-purple-400 hover:text-purple-300 truncate max-w-[140px]"
                >
                  <ExternalLink className="h-2.5 w-2.5 flex-shrink-0" />
                  {hostname}
                </a>
              )
            })}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-between p-2 border-t border-gray-800 bg-gray-900/30 gap-1 flex-wrap">
        <div className="flex items-center gap-1">
          {post.status === 'pending_review' && (
            <>
              <button
                onClick={handleApprove}
                disabled={isLoading}
                className="inline-flex items-center gap-1 rounded-md bg-green-500/10 px-2 py-1 text-[11px] font-medium text-green-400 hover:bg-green-500/20 transition-colors disabled:opacity-50"
              >
                {isLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                Approve
              </button>
              <button
                onClick={handleReject}
                disabled={isLoading}
                className="inline-flex items-center gap-1 rounded-md bg-red-500/10 px-2 py-1 text-[11px] font-medium text-red-400 hover:bg-red-500/20 transition-colors disabled:opacity-50"
              >
                <X className="h-3 w-3" />
              </button>
            </>
          )}

          {post.status === 'approved' && (
            <button
              onClick={handlePost}
              disabled={isLoading}
              className="inline-flex items-center gap-1 rounded-md bg-purple-500/10 px-2 py-1 text-[11px] font-medium text-purple-400 hover:bg-purple-500/20 transition-colors disabled:opacity-50"
            >
              {isLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
              Post
            </button>
          )}

          {/* Image gen buttons */}
          {post.image_prompt && !post.image_url && post.status !== 'rejected' && (
            <button
              onClick={handleGenerateImage}
              disabled={isGeneratingImage}
              className="inline-flex items-center gap-1 rounded-md bg-cyan-500/10 px-2 py-1 text-[11px] font-medium text-cyan-400 hover:bg-cyan-500/20 transition-colors disabled:opacity-50"
            >
              {isGeneratingImage ? <Loader2 className="h-3 w-3 animate-spin" /> : <ImageIcon className="h-3 w-3" />}
              {isGeneratingImage ? 'Gen...' : 'Image'}
            </button>
          )}
          {post.image_prompt && post.image_url && post.status !== 'posted' && (
            <button
              onClick={handleGenerateImage}
              disabled={isGeneratingImage}
              className="inline-flex items-center gap-1 rounded-md bg-gray-800 px-2 py-1 text-[11px] font-medium text-gray-400 hover:bg-gray-700 transition-colors disabled:opacity-50"
            >
              {isGeneratingImage ? <Loader2 className="h-3 w-3 animate-spin" /> : <ImageIcon className="h-3 w-3" />}
              Regen
            </button>
          )}
        </div>

        {canEdit && (
          <div className="flex items-center gap-1">
            {isEditing ? (
              <>
                <button
                  onClick={handleSaveEdit}
                  disabled={isLoading}
                  className="rounded-md bg-purple-500/10 px-2 py-1 text-[11px] font-medium text-purple-400 hover:bg-purple-500/20 transition-colors disabled:opacity-50"
                >
                  Save
                </button>
                <button
                  onClick={() => { setIsEditing(false); setEditX(post.x_content || ''); setEditLinkedin(post.linkedin_content || '') }}
                  className="rounded-md bg-gray-800 px-2 py-1 text-[11px] text-gray-400 hover:bg-gray-700 transition-colors"
                >
                  Cancel
                </button>
              </>
            ) : (
              <button
                onClick={() => { setIsEditing(true); setShowLinkedin(true) }}
                className="inline-flex items-center gap-1 rounded-md bg-gray-800 px-2 py-1 text-[11px] font-medium text-gray-400 hover:bg-gray-700 transition-colors"
              >
                <Edit3 className="h-3 w-3" />
                Edit
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
