import React, { useState, useEffect } from 'react'
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  Image,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'

// Types
interface Profile {
  id: string;
  name?: string | null;
  avatar_url?: string | null;
}

interface FeedItemComment {
  id: string;
  feed_item_id: string;
  user_id: string;
  comment_text: string;
  created_at: string;
  updated_at: string;
  user_profile: Profile | null;
}

interface CommentsSectionProps {
  feedItemId: string
  comments: FeedItemComment[]
  isLoading: boolean
  onLoadComments: () => void
  commentsLoaded: boolean
}

export default function CommentsSection({ 
  feedItemId, 
  comments, 
  isLoading, 
  onLoadComments,
  commentsLoaded
}: CommentsSectionProps) {

  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString)
    const now = new Date()
    const diffInMs = now.getTime() - date.getTime()
    const diffInMins = Math.floor(diffInMs / (1000 * 60))
    const diffInHours = Math.floor(diffInMs / (1000 * 60 * 60))
    const diffInDays = Math.floor(diffInMs / (1000 * 60 * 60 * 24))

    if (diffInMins < 1) {
      return 'now'
    } else if (diffInMins < 60) {
      return `${diffInMins}m`
    } else if (diffInHours < 24) {
      return `${diffInHours}h`
    } else if (diffInDays < 7) {
      return `${diffInDays}d`
    } else {
      return date.toLocaleDateString([], { month: 'short', day: 'numeric' })
    }
  }

  const renderComment = (comment: FeedItemComment) => (
    <View key={comment.id} style={styles.commentContainer}>
      {/* Avatar */}
      <View style={styles.avatarContainer}>
        {comment.user_profile?.avatar_url ? (
          <Image
            source={{ uri: comment.user_profile.avatar_url }}
            style={styles.commentAvatar}
          />
        ) : (
          <View style={styles.commentAvatarPlaceholder}>
            <Text style={styles.commentAvatarText}>
              {(comment.user_profile?.name || 'U').charAt(0).toUpperCase()}
            </Text>
          </View>
        )}
      </View>

      {/* Comment Content */}
      <View style={styles.commentContent}>
        <View style={styles.commentBubble}>
          <View style={styles.commentHeader}>
            <Text style={styles.commentAuthor}>
              {comment.user_profile?.name || 'Anonymous'}
            </Text>
            <Text style={styles.commentTime}>
              {formatTimeAgo(comment.created_at)}
            </Text>
          </View>
          <Text style={styles.commentText}>
            {comment.comment_text}
          </Text>
        </View>
      </View>
    </View>
  )

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Ionicons name="chatbubble-outline" size={16} color="#9CA3AF" />
          <Text style={styles.headerTitle}>
            Comments ({comments.length})
          </Text>
        </View>
        
        {!commentsLoaded && !isLoading && (
          <TouchableOpacity 
            style={styles.loadButton}
            onPress={onLoadComments}
          >
            <Text style={styles.loadButtonText}>Load</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Loading State */}
      {isLoading && (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="small" color="#6B46C1" />
          <Text style={styles.loadingText}>Loading comments...</Text>
        </View>
      )}

      {/* Comments List */}
      {commentsLoaded && (
        <View style={styles.commentsContainer}>
          {comments.length > 0 ? (
            <ScrollView 
              style={styles.commentsList}
              showsVerticalScrollIndicator={false}
              nestedScrollEnabled={true}
            >
              {comments.map(renderComment)}
            </ScrollView>
          ) : (
            <View style={styles.emptyState}>
              <Ionicons name="chatbubble-outline" size={32} color="#6B7280" />
              <Text style={styles.emptyStateText}>No comments yet</Text>
              <Text style={styles.emptyStateSubtext}>Be the first to comment!</Text>
            </View>
          )}
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#374151',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerTitle: {
    color: '#9CA3AF',
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 6,
  },
  loadButton: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    backgroundColor: '#374151',
    borderRadius: 6,
  },
  loadButtonText: {
    color: '#6B46C1',
    fontSize: 12,
    fontWeight: '600',
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
  },
  loadingText: {
    color: '#9CA3AF',
    fontSize: 12,
    marginLeft: 8,
  },
  commentsContainer: {
    maxHeight: 200, // Limit height to prevent feed items from becoming too tall
  },
  commentsList: {
    flex: 1,
  },
  commentContainer: {
    flexDirection: 'row',
    marginBottom: 12,
    alignItems: 'flex-start',
  },
  avatarContainer: {
    marginRight: 8,
    marginTop: 2,
  },
  commentAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
  },
  commentAvatarPlaceholder: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#6B46C1',
    justifyContent: 'center',
    alignItems: 'center',
  },
  commentAvatarText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  commentContent: {
    flex: 1,
  },
  commentBubble: {
    backgroundColor: '#1F2937',
    borderRadius: 12,
    padding: 8,
    borderBottomLeftRadius: 4, // Chat bubble style
  },
  commentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  commentAuthor: {
    color: '#F9FAFB',
    fontSize: 12,
    fontWeight: '600',
  },
  commentTime: {
    color: '#6B7280',
    fontSize: 10,
  },
  commentText: {
    color: '#D1D5DB',
    fontSize: 12,
    lineHeight: 16,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 20,
  },
  emptyStateText: {
    color: '#9CA3AF',
    fontSize: 14,
    fontWeight: '500',
    marginTop: 8,
  },
  emptyStateSubtext: {
    color: '#6B7280',
    fontSize: 12,
    marginTop: 2,
  },
}) 