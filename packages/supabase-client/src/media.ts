import { SupabaseClient } from '@supabase/supabase-js';
import type { StorageError } from '@supabase/storage-js';
import type { FileObject } from '@supabase/storage-js';
import { Database } from './types';

const CHAT_MEDIA_BUCKET = 'chat-media';

/**
 * Uploads a file to the chat-media storage bucket
 */
export async function uploadChatMedia(
  client: SupabaseClient<Database>,
  userId: string,
  file: File | Blob,
  fileName: string
): Promise<{ data: { path: string } | null; error: StorageError | Error | null }> {
  const filePath = `${userId}/${Date.now()}-${fileName}`;
  
  return client.storage
    .from(CHAT_MEDIA_BUCKET)
    .upload(filePath, file, {
      cacheControl: '3600',
      upsert: false
    });
}

/**
 * Gets a public URL for a chat media file
 */
export async function getChatMediaUrl(
  client: SupabaseClient<Database>,
  filePath: string
) {
  const { data } = await client.storage
    .from(CHAT_MEDIA_BUCKET)
    .createSignedUrl(filePath, 60 * 60); // 1 hour expiry
    
  return data?.signedUrl;
}

/**
 * Downloads a chat media file
 */
export async function downloadChatMedia(
  client: SupabaseClient<Database>,
  filePath: string
): Promise<{ data: Blob | null; error: StorageError | Error | null }> {
  return client.storage
    .from(CHAT_MEDIA_BUCKET)
    .download(filePath);
}

/**
 * Converts a downloaded file to base64
 */
export async function fileToBase64(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * Deletes a chat media file
 */
export async function deleteChatMedia(
  client: SupabaseClient<Database>,
  filePath: string
): Promise<{ data: FileObject[] | null; error: StorageError | Error | null }> {
  return client.storage
    .from(CHAT_MEDIA_BUCKET)
    .remove([filePath]);
} 