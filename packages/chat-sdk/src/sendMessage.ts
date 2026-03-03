import { supabaseBrowser } from '@mayahq/supabase-client';
import { v4 as uuidv4 } from 'uuid';

/**
 * Sends a message to a room by inserting it into Supabase
 * The memory worker will handle generating and inserting the assistant's response
 */
export async function sendMessage(opts: {
  roomId: string;
  userId: string;
  content: string;
  role?: 'user' | 'assistant';
  imageFile?: File | null;
  voiceMode?: boolean;
  supabaseClient?: any;
}) {
  const { roomId, userId, content, imageFile, role = 'user', voiceMode = false, supabaseClient } = opts;
  const messageId = uuidv4();
  
  console.log('SendMessage - Creating Supabase client');
  // Use provided client or create one
  const supabase = supabaseClient || supabaseBrowser();
  
  try {
    console.log('SendMessage - Preparing to insert message', { roomId, userId, messageId, role, voiceMode });
    
    // Prepare metadata
    let metadata: any = {};
    if (voiceMode) {
      metadata.voiceMode = true;
    }
    
    // If we have an image file, handle it
    if (imageFile) {
      console.log('SendMessage - Handling image file');
      
      // First insert the message
      const { data, error } = await supabase.from('messages').insert({
        id: messageId,
        room_id: roomId,
        user_id: userId,
        content,
        role,
        metadata
      });
      
      if (error) {
        console.error('SendMessage - Error inserting message with image:', error);
        return { error };
      }
      
      // Then upload the image
      const filePath = `${userId}/${Date.now()}-${imageFile.name}`;
      
      const { error: uploadError } = await supabase.storage
        .from('chat-media')
        .upload(filePath, imageFile);
        
      if (uploadError) {
        console.error('SendMessage - Error uploading image:', uploadError);
        return { error: uploadError };
      }
      
      // Update the message with the media path
      metadata.media_path = filePath;
      const { error: updateError } = await supabase
        .from('messages')
        .update({
          metadata
        })
        .eq('id', messageId);
      
      if (updateError) {
        console.error('SendMessage - Error updating message with media path:', updateError);
        // Continue despite the error since the message was sent
      }
      
      // Return the message with success
      return { 
        message: {
          id: messageId,
          room_id: roomId,
          user_id: userId,
          content,
          role,
          created_at: new Date().toISOString(),
          metadata
        },
        error: null
      };
    } else {
      console.log('SendMessage - No image, inserting plain message');
      
      // No media, just insert the message directly
      const { data, error } = await supabase.from('messages').insert({
        id: messageId,
        room_id: roomId,
        user_id: userId,
        content,
        role,
        metadata: Object.keys(metadata).length > 0 ? metadata : undefined
      });
      
      if (error) {
        console.error('SendMessage - Error inserting message:', error);
        return { error };
      }
      
      console.log('SendMessage - Message inserted successfully', messageId);
      
      // Return the message with success
      return { 
        message: {
          id: messageId,
          room_id: roomId,
          user_id: userId,
          content,
          role,
          created_at: new Date().toISOString(),
          metadata: Object.keys(metadata).length > 0 ? metadata : undefined
        },
        error: null
      };
    }
  } catch (error) {
    console.error('SendMessage - Error sending message:', error);
    return { error };
  }
} 