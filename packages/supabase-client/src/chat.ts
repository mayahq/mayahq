import { SupabaseClient, PostgrestSingleResponse } from '@supabase/supabase-js';
import { Database, Message, Room } from './types';

/**
 * Retrieves messages for a specific chat room
 */
export async function getMessages(
  client: SupabaseClient<Database>,
  roomId: string,
  limit: number = 100,
  offset: number = 0
) {
  return client
    .from('messages')
    .select('*')
    .eq('room_id', roomId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);
}

/**
 * Sends a new message to a chat room
 */
export async function sendMessage(
  client: SupabaseClient<Database>,
  message: Omit<Message, 'id' | 'created_at'>
) {
  // Send the message
  const result = await client
    .from('messages')
    .insert(message)
    .select()
    .single();
  
  // If message was sent successfully, update the room's last activity time
  if (!result.error && result.data) {
    await updateRoomLastActivity(client, message.room_id);
  }
  
  return result;
}

/**
 * Creates a new chat room
 */
export async function createRoom(
  client: SupabaseClient<Database>,
  room: Omit<Room, 'id' | 'created_at' | 'last_message_at'>
) {
  return client
    .from('rooms')
    .insert(room)
    .select()
    .single();
}

/**
 * Gets all rooms for a user
 */
export async function getUserRooms(
  client: SupabaseClient<Database>,
  userId: string
) {
  return client
    .from('rooms')
    .select('*')
    .eq('user_id', userId)
    .order('last_message_at', { ascending: false });
}

/**
 * Gets a specific room by ID
 */
export async function getRoom(
  client: SupabaseClient<Database>,
  roomId: string
) {
  return client
    .from('rooms')
    .select('*')
    .eq('id', roomId)
    .single();
}

/**
 * Gets an existing room for a user or creates a new one if none exists
 * This ensures consistent room handling across the application
 */
export async function getOrCreateRoom(
  client: SupabaseClient<Database>,
  userId: string,
  roomName: string = 'Maya Chat'
): Promise<PostgrestSingleResponse<Room>> {
  // First, look for an existing room
  const { data: rooms, error: roomsError } = await client
    .from('rooms')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1);
  
  if (roomsError && roomsError.code !== 'PGRST116') {
    // If it is some other error, then propagate it
    console.error("Error fetching rooms in getOrCreateRoom:", roomsError);
    return { data: null, error: roomsError, count: null, status: 0, statusText: 'Error' };
  }
  
  // If we found a room, return it
  if (rooms && rooms.length > 0) {
    return { data: rooms[0] as Room, error: null, count: 1, status: 200, statusText: 'OK' };
  }
  
  // Otherwise, create a new room
  console.log(`No existing room for user ${userId}, creating new one.`);
  return createRoom(client, {
    name: roomName,
    user_id: userId
  });
}

/**
 * Updates the last_message_at timestamp for a room
 */
export async function updateRoomLastActivity(
  client: SupabaseClient<Database>,
  roomId: string
) {
  const now = new Date().toISOString();
  return client
    .from('rooms')
    .update({ last_message_at: now })
    .eq('id', roomId);
} 