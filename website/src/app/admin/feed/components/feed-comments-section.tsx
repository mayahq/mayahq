'use client'

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { MessageCircle, SendHorizonal } from "lucide-react"
import { formatDistanceToNow } from "date-fns"
import type { Profile } from "@/types/feed-types"

export interface FeedCommentData {
  id: string
  feed_item_id: string
  user_id: string
  comment_text: string
  created_at: string
  updated_at: string
  user_profile: Profile | null
}

interface FeedCommentsSectionProps {
  itemId: string
  comments: FeedCommentData[] | undefined
  isLoadingComments: boolean
  newCommentText: string
  user: { id: string } | null
  profile: { name?: string | null; avatar_url?: string | null } | null
  isProcessingAction: boolean
  onLoadComments: (itemId: string) => void
  onAddComment: (itemId: string) => void
  onCommentTextChange: (itemId: string, text: string) => void
  variant?: 'default' | 'compact'
}

export function FeedCommentsSection({
  itemId,
  comments,
  isLoadingComments,
  newCommentText,
  user,
  profile,
  isProcessingAction,
  onLoadComments,
  onAddComment,
  onCommentTextChange,
  variant = 'default',
}: FeedCommentsSectionProps) {
  const isCompact = variant === 'compact'

  return (
    <div>
      <h4 className={`font-semibold text-gray-400 mb-2 flex items-center ${isCompact ? 'text-xs' : 'text-xs'}`}>
        <MessageCircle className={`mr-1.5 ${isCompact ? 'w-3 h-3' : 'w-3.5 h-3.5'}`} />
        Comments ({comments?.length || 0})
      </h4>

      {!comments && !isLoadingComments && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => onLoadComments(itemId)}
          className={`mb-2 ${isCompact ? 'text-xs h-7 px-2 py-1' : ''}`}
        >
          Load Comments
        </Button>
      )}

      {isLoadingComments && (
        <p className="text-xs text-gray-400">Loading comments...</p>
      )}

      {comments && comments.length > 0 && (
        <div className={`space-y-2 overflow-y-auto pr-1 mb-2 ${isCompact ? 'max-h-40' : 'max-h-60'}`}>
          {comments.map(comment => (
            <div
              key={comment.id}
              className={`flex items-start text-xs ${isCompact ? 'space-x-1.5' : 'space-x-2'}`}
            >
              <Avatar className={`mt-0.5 ${isCompact ? 'w-5 h-5' : 'w-6 h-6'}`}>
                <AvatarImage
                  src={comment.user_profile?.avatar_url || undefined}
                  alt={comment.user_profile?.name || 'User'}
                />
                <AvatarFallback className={`bg-gray-600 ${isCompact ? 'text-[10px]' : 'text-xs'}`}>
                  {(comment.user_profile?.name || 'U').charAt(0)}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 bg-gray-800/70 p-2 rounded-md">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-gray-200">
                    {comment.user_profile?.name || 'Anonymous'}
                  </span>
                  <span className="text-gray-400 ml-2 text-[10px]">
                    {formatDistanceToNow(new Date(comment.created_at), { addSuffix: true })}
                  </span>
                </div>
                <p className="text-gray-300 whitespace-pre-wrap">{comment.comment_text}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {comments && comments.length === 0 && !isLoadingComments && (
        <p className="text-xs text-gray-400 mb-2">No comments yet.</p>
      )}

      {user && (
        <div className={`flex items-start ${isCompact ? 'space-x-1.5' : 'space-x-2'}`}>
          <Avatar className={`mt-1 ${isCompact ? 'w-6 h-6' : 'w-7 h-7'}`}>
            <AvatarImage src={profile?.avatar_url || undefined} alt={profile?.name || 'Your avatar'} />
            <AvatarFallback className="text-xs bg-purple-600">
              {profile?.name ? profile.name.charAt(0).toUpperCase() : 'U'}
            </AvatarFallback>
          </Avatar>
          <Textarea
            placeholder="Add a comment..."
            value={newCommentText}
            onChange={(e) => onCommentTextChange(itemId, e.target.value)}
            rows={1}
            className={`flex-grow bg-gray-700 border-gray-600 text-sm resize-none transition-all duration-150 ease-in-out ${
              isCompact
                ? 'min-h-[34px] focus-within:min-h-[44px] text-xs'
                : 'min-h-[40px] focus-within:min-h-[60px]'
            }`}
          />
          <Button
            size="icon"
            onClick={() => onAddComment(itemId)}
            disabled={isProcessingAction || !newCommentText?.trim()}
            className={`flex-shrink-0 bg-purple-600 hover:bg-purple-700 ${isCompact ? 'h-8 w-8' : 'h-9 w-9'}`}
            aria-label="Send comment"
          >
            <SendHorizonal className={isCompact ? 'w-3.5 h-3.5' : 'h-4 w-4'} />
          </Button>
        </div>
      )}
    </div>
  )
}
