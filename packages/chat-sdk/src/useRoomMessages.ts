import { useState, useEffect, useRef, useCallback } from 'react'
import { SupabaseClient } from '@supabase/supabase-js'
import { RealtimeChannel } from '@supabase/supabase-js'
import { createClient as createDefaultClient } from '@mayahq/supabase-client'
import type { Database, Message } from '@mayahq/supabase-client'

/**
 * Hook to fetch and subscribe to messages in a room
 * Works in both React and React Native
 * Enhanced with reconnection logic and status monitoring
 *
 * Fixed issues:
 * - Removed polling interval that reset on every message change
 * - Only poll when realtime is disconnected
 * - Use refs to avoid stale closures
 */
export const useRoomMessages = (
  roomId: string | null,
  options?: {
    limit?: number
    userIdFilter?: string
    supabaseClient?: SupabaseClient
  }
) => {
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const [subscriptionStatus, setSubscriptionStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting')

  const channelRef = useRef<RealtimeChannel | null>(null)
  const retryTimeoutRef = useRef<NodeJS.Timeout>()
  const pollingIntervalRef = useRef<NodeJS.Timeout>()
  // Use refs to avoid stale closures in polling callback
  const messagesRef = useRef<Message[]>([])
  const subscriptionStatusRef = useRef<'connecting' | 'connected' | 'disconnected'>('connecting')

  // Keep refs in sync with state
  useEffect(() => {
    messagesRef.current = messages
  }, [messages])

  useEffect(() => {
    subscriptionStatusRef.current = subscriptionStatus
  }, [subscriptionStatus])

  // Use provided client or create one
  const supabase = options?.supabaseClient || createDefaultClient()

  // Fetch messages function (extracted so it can be called manually)
  const fetchMessages = async () => {
    if (!roomId) {
      setMessages([])
      setLoading(false)
      return
    }

    try {
      setLoading(true)
      console.log('[useRoomMessages] Fetching messages for room:', roomId)

      // First get messages in descending order to get the most recent ones
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('room_id', roomId)
        .order('created_at', { ascending: false })
        .limit(options?.limit || 100)

      if (error) throw error

      // Reverse the messages to show in chronological order (oldest first)
      // This ensures proper display in chat interfaces
      setMessages(data ? [...data].reverse() : [])
      setLoading(false)
      console.log('[useRoomMessages] Fetched', data?.length || 0, 'messages')
    } catch (err) {
      console.error('[useRoomMessages] Error fetching messages:', err)
      setError(err instanceof Error ? err : new Error('Failed to fetch messages'))
      setLoading(false)
    }
  }

  // Fetch initial messages
  useEffect(() => {
    fetchMessages()
  }, [supabase, roomId, options?.limit])
  
  // Subscribe to new messages with enhanced reconnection logic
  useEffect(() => {
    if (!roomId) return

    const setupSubscription = () => {
      console.log(`[useRoomMessages] Setting up subscription for room: ${roomId}`)

      // Clean up existing channel
      if (channelRef.current) {
        console.log('[useRoomMessages] Removing existing channel')
        supabase.removeChannel(channelRef.current)
      }

      const channel = supabase
        .channel(`messages:${roomId}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'messages',
            filter: `room_id=eq.${roomId}`
          },
          (payload) => {
            console.log('[useRoomMessages] 📩 Realtime event received:', payload.eventType, payload.new)

            if (payload.eventType === 'INSERT') {
              const newMessage = payload.new as Message

              setMessages(current => {
                // Prevent duplicates by ID
                if (current.some(msg => msg.id === newMessage.id)) {
                  console.log('[useRoomMessages] Duplicate message ignored (same ID):', newMessage.id)
                  return current
                }

                // Check for optimistic message duplicate (same content + user + recent timestamp)
                // This handles the case where we added an optimistic message with temp ID,
                // and now the real message arrives from DB with a different ID
                const optimisticMatch = current.find(msg => {
                  if (msg.content !== newMessage.content ||
                      msg.user_id !== newMessage.user_id ||
                      msg.role !== newMessage.role ||
                      msg.room_id !== newMessage.room_id) {
                    return false
                  }
                  // Only match if the existing message is very recent (within 30 seconds)
                  const msgTime = msg.created_at ? new Date(msg.created_at).getTime() : Date.now()
                  const newMsgTime = newMessage.created_at ? new Date(newMessage.created_at).getTime() : Date.now()
                  return Math.abs(msgTime - newMsgTime) < 30000
                })

                if (optimisticMatch) {
                  console.log('[useRoomMessages] Replacing optimistic message with real one:', optimisticMatch.id, '->', newMessage.id)
                  // Replace the optimistic message with the real one (to get the real ID)
                  return current.map(msg => msg.id === optimisticMatch.id ? newMessage : msg)
                }

                console.log('[useRoomMessages] ✅ Adding new message to state')
                return [...current, newMessage]
              })
            } else if (payload.eventType === 'UPDATE') {
              const updatedMessage = payload.new as Message

              setMessages(current => {
                const messageExists = current.some(msg => msg.id === updatedMessage.id)
                if (!messageExists) {
                  console.log('[useRoomMessages] ⚠️ UPDATE for unknown message:', updatedMessage.id)
                  return current
                }
                console.log('[useRoomMessages] 🔄 Updating message in state:', updatedMessage.id)
                return current.map(msg =>
                  msg.id === updatedMessage.id ? updatedMessage : msg
                )
              })
            }
          }
        )
        .subscribe(async (status, err) => {
          console.log(`[useRoomMessages] 🔌 Subscription status changed:`, status, err ? `Error: ${JSON.stringify(err)}` : '')

          if (status === 'SUBSCRIBED') {
            setSubscriptionStatus('connected')
            console.log('[useRoomMessages] ✅ Successfully subscribed to realtime updates')
          } else if (status === 'CHANNEL_ERROR') {
            setSubscriptionStatus('disconnected')
            console.error('[useRoomMessages] ❌ Channel error:', err)

            // Retry connection after 3 seconds
            retryTimeoutRef.current = setTimeout(() => {
              console.log('[useRoomMessages] 🔄 Retrying subscription...')
              setupSubscription()
            }, 3000)
          } else if (status === 'TIMED_OUT') {
            setSubscriptionStatus('disconnected')
            console.warn('[useRoomMessages] ⏱️  Subscription timed out, retrying...')

            retryTimeoutRef.current = setTimeout(setupSubscription, 2000)
          } else if (status === 'CLOSED') {
            setSubscriptionStatus('disconnected')
            console.warn('[useRoomMessages] 🔒 Subscription closed')
          } else {
            setSubscriptionStatus('connecting')
            console.log('[useRoomMessages] 🔄 Subscription connecting...')
          }
        })

      channelRef.current = channel
      console.log('[useRoomMessages] Channel created and subscription initiated')
    }

    setupSubscription()

    return () => {
      console.log('[useRoomMessages] Cleaning up subscription')
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current)
      }
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current)
        channelRef.current = null
      }
    }
  }, [supabase, roomId])

  // Polling fallback - ONLY runs when realtime is disconnected
  // Uses refs to avoid stale closures and prevent interval reset on every message
  useEffect(() => {
    if (!roomId) return

    // Start polling only as a fallback - will skip if realtime is connected
    pollingIntervalRef.current = setInterval(async () => {
      // Skip polling if realtime is connected
      if (subscriptionStatusRef.current === 'connected') {
        return
      }

      console.log('[useRoomMessages] 🔄 Polling (realtime disconnected)...')

      try {
        // Use ref to get current messages without stale closure
        const currentMessages = messagesRef.current

        // Fetch recent messages
        const { data, error } = await supabase
          .from('messages')
          .select('*')
          .eq('room_id', roomId)
          .order('created_at', { ascending: false })
          .limit(5)

        if (error) {
          console.error('[useRoomMessages] Polling error:', error)
          return
        }

        if (data && data.length > 0) {
          // Check if we have any new messages using ref
          const newMessages = data.filter(msg =>
            !currentMessages.some(existing => existing.id === msg.id)
          )

          if (newMessages.length > 0) {
            console.log('[useRoomMessages] 🔄 Polling found', newMessages.length, 'new messages')
            setMessages(current => {
              const existingIds = new Set(current.map(m => m.id))
              const uniqueNew = newMessages.filter(m => !existingIds.has(m.id))
              if (uniqueNew.length === 0) return current

              return [...current, ...uniqueNew.reverse()].sort((a, b) =>
                new Date(a.created_at as string).getTime() - new Date(b.created_at as string).getTime()
              )
            })
          }
        }
      } catch (err) {
        console.error('[useRoomMessages] Polling exception:', err)
      }
    }, 10000) // Poll every 10 seconds (only when disconnected)

    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current)
      }
    }
  }, [supabase, roomId]) // Removed 'messages' dependency - use refs instead
  
  // Add a message to the local state (for optimistic UI updates)
  // Prevents duplicates if realtime already added the message
  const addLocalMessage = useCallback((message: Message) => {
    setMessages((current) => {
      // Check if message already exists (realtime might have added it)
      if (current.some(m => m.id === message.id)) {
        console.log('[useRoomMessages] Optimistic message already exists:', message.id)
        return current
      }
      return [...current, { ...message, isPending: true } as Message]
    })
  }, [])

  // Update a message in the local state (for optimistic updates)
  const updateLocalMessage = useCallback((messageId: string, updates: Partial<Message>) => {
    setMessages((current) =>
      current.map((msg) =>
        msg.id === messageId || (msg as any).localId === messageId
          ? { ...msg, ...updates, isPending: false }
          : msg
      )
    )
  }, [])

  // Remove a message from local state
  const removeLocalMessage = useCallback((messageId: string) => {
    setMessages((current) => current.filter(msg => msg.id !== messageId))
  }, [])

  // Refetch messages (useful for pull-to-refresh)
  const refetch = async () => {
    console.log('[useRoomMessages] Manual refetch requested')
    await fetchMessages()
  }

  return {
    messages,
    loading,
    error,
    subscriptionStatus,
    addLocalMessage,
    updateLocalMessage,
    removeLocalMessage,
    refetch,
  }
} 