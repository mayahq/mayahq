import React, { useState } from 'react'
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  Image,
  Alert,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'

// Types
interface Profile {
  id: string;
  name?: string | null;
  avatar_url?: string | null;
}

interface AddCommentProps {
  feedItemId: string
  userProfile: Profile | null
  onAddComment: (feedItemId: string, commentText: string) => Promise<void>
  isSubmitting: boolean
  disabled?: boolean
}

export default function AddComment({ 
  feedItemId, 
  userProfile, 
  onAddComment, 
  isSubmitting,
  disabled = false
}: AddCommentProps) {
  const [commentText, setCommentText] = useState('')
  const [isFocused, setIsFocused] = useState(false)

  const handleSubmit = async () => {
    const trimmedText = commentText.trim()
    if (!trimmedText) {
      Alert.alert('Empty Comment', 'Please write a comment before sending.')
      return
    }

    if (trimmedText.length > 500) {
      Alert.alert('Comment Too Long', 'Comments must be 500 characters or less.')
      return
    }

    try {
      await onAddComment(feedItemId, trimmedText)
      setCommentText('')
      setIsFocused(false)
    } catch (error) {
      // Error handling is done in the parent component
    }
  }

  const canSubmit = commentText.trim().length > 0 && !isSubmitting && !disabled

  return (
    <View style={styles.container}>
      <View style={styles.inputContainer}>
        {/* User Avatar */}
        <View style={styles.avatarContainer}>
          {userProfile?.avatar_url ? (
            <Image
              source={{ uri: userProfile.avatar_url }}
              style={styles.avatar}
            />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <Text style={styles.avatarText}>
                {(userProfile?.name || 'U').charAt(0).toUpperCase()}
              </Text>
            </View>
          )}
        </View>

        {/* Input Field */}
        <View style={[styles.inputWrapper, isFocused && styles.inputWrapperFocused]}>
          <TextInput
            style={[styles.textInput, isFocused && styles.textInputFocused]}
            value={commentText}
            onChangeText={setCommentText}
            placeholder="Add a comment..."
            placeholderTextColor="#6B7280"
            multiline={true}
            maxLength={500}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            editable={!disabled}
            numberOfLines={1}
            textAlignVertical="top"
          />
          
          {/* Character Count */}
          {isFocused && commentText.length > 400 && (
            <Text style={[
              styles.characterCount, 
              commentText.length > 500 && styles.characterCountError
            ]}>
              {commentText.length}/500
            </Text>
          )}
        </View>

        {/* Send Button */}
        <TouchableOpacity
          style={[
            styles.sendButton,
            canSubmit && styles.sendButtonActive,
            !canSubmit && styles.sendButtonDisabled
          ]}
          onPress={handleSubmit}
          disabled={!canSubmit}
        >
          {isSubmitting ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Ionicons 
              name="send" 
              size={16} 
              color={canSubmit ? "#fff" : "#6B7280"} 
            />
          )}
        </TouchableOpacity>
      </View>

      {/* Expanded State Info */}
      {isFocused && (
        <View style={styles.expandedInfo}>
          <Text style={styles.infoText}>
            💡 Tip: Share your thoughts, feedback, or suggestions about this content
          </Text>
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    paddingTop: 12,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  avatarContainer: {
    marginTop: 4,
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  avatarPlaceholder: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#6B46C1',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  inputWrapper: {
    flex: 1,
    backgroundColor: '#1F2937',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#374151',
    paddingHorizontal: 16,
    paddingVertical: 8,
    minHeight: 40,
    position: 'relative',
  },
  inputWrapperFocused: {
    borderColor: '#6B46C1',
    backgroundColor: '#111827',
  },
  textInput: {
    color: '#F9FAFB',
    fontSize: 14,
    lineHeight: 18,
    maxHeight: 80,
  },
  textInputFocused: {
    minHeight: 60,
  },
  characterCount: {
    position: 'absolute',
    bottom: 4,
    right: 12,
    fontSize: 10,
    color: '#6B7280',
  },
  characterCountError: {
    color: '#EF4444',
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 0,
  },
  sendButtonActive: {
    backgroundColor: '#6B46C1',
  },
  sendButtonDisabled: {
    backgroundColor: '#374151',
  },
  expandedInfo: {
    marginTop: 8,
    paddingLeft: 40, // Align with input text
  },
  infoText: {
    fontSize: 12,
    color: '#9CA3AF',
    lineHeight: 16,
  },
}) 