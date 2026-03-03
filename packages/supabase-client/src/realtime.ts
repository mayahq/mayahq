import { SupabaseClient } from '@supabase/supabase-js';
import { Database, Message } from './types';
import { RealtimeChannel } from '@supabase/supabase-js';

/**
 * Subscribe to new messages in a chat room
 */
export function subscribeToMessages(
  client: SupabaseClient<Database>,
  roomId: string,
  onMessage: (message: Message) => void
): RealtimeChannel {
  return client
    .channel(`room:${roomId}`)
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'messages',
      filter: `room_id=eq.${roomId}`
    }, (payload) => {
      onMessage(payload.new as unknown as Message);
    })
    .subscribe();
}

/**
 * Subscribe to changes in a message (e.g., for read status)
 */
export function subscribeToMessageUpdates(
  client: SupabaseClient<Database>,
  messageId: string,
  onUpdate: (message: Message) => void
): RealtimeChannel {
  return client
    .channel(`message:${messageId}`)
    .on('postgres_changes', {
      event: 'UPDATE',
      schema: 'public',
      table: 'messages',
      filter: `id=eq.${messageId}`
    }, (payload) => {
      onUpdate(payload.new as unknown as Message);
    })
    .subscribe();
}

/**
 * Subscribe to room updates (e.g., last_message_at changes)
 */
export function subscribeToRoomUpdates(
  client: SupabaseClient<Database>,
  userId: string,
  onRoomUpdate: (room: any) => void
): RealtimeChannel {
  return client
    .channel(`user-rooms:${userId}`)
    .on('postgres_changes', {
      event: 'UPDATE',
      schema: 'public',
      table: 'rooms',
      filter: `user_id=eq.${userId}`
    }, (payload) => {
      onRoomUpdate(payload.new);
    })
    .subscribe();
}

/**
 * Unsubscribe from a channel
 */
export async function unsubscribe(
  client: SupabaseClient<Database>,
  channel: RealtimeChannel
): Promise<void> {
  await client.removeChannel(channel);
} 