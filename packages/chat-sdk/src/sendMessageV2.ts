import { supabaseBrowser } from '@mayahq/supabase-client';
import { v4 as uuidv4 } from 'uuid';

export interface Attachment {
  file?: File;
  url?: string;
  type: 'image' | 'audio' | 'video' | 'file';
  mimeType: string;
  size?: number;
  name?: string;
  metadata?: any;
}

export interface MessageAttachment {
  type: 'image' | 'audio' | 'video' | 'file';
  url: string;
  publicUrl: string;
  mimeType: string;
  size: number;
  name: string;
  metadata?: any;
}

/**
 * Enhanced sendMessage with full multimodal support
 */
export async function sendMessageV2(opts: {
  roomId: string;
  userId: string;
  content: string;
  role?: 'user' | 'assistant';
  attachments?: File[];
  voiceMode?: boolean;
  supabaseClient?: any;
  onProgress?: (progress: number) => void;
}) {
  const { 
    roomId, 
    userId, 
    content, 
    attachments = [], 
    role = 'user', 
    voiceMode = false, 
    supabaseClient,
    onProgress
  } = opts;
  
  const messageId = uuidv4();
  const supabase = supabaseClient || supabaseBrowser();
  
  try {
    console.log('SendMessageV2 - Starting multimodal message send', { 
      roomId, 
      userId, 
      messageId, 
      attachmentCount: attachments.length 
    });
    
    // Prepare metadata
    let metadata: any = {};
    if (voiceMode) {
      metadata.voiceMode = true;
    }
    
    // Upload all attachments first
    const uploadedAttachments: MessageAttachment[] = [];
    
    if (attachments.length > 0) {
      console.log(`SendMessageV2 - Uploading ${attachments.length} attachments`);
      
      for (let i = 0; i < attachments.length; i++) {
        const file = attachments[i];
        const progress = (i / attachments.length) * 0.8; // 80% for uploads
        onProgress?.(progress);
        
        // Generate unique file path
        const timestamp = Date.now();
        const sanitizedName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
        const filePath = `${userId}/${roomId}/${timestamp}-${sanitizedName}`;
        
        console.log(`SendMessageV2 - Uploading file ${i + 1}/${attachments.length}: ${file.name}`);
        
        // Upload to Supabase Storage
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('chat-media')
          .upload(filePath, file, {
            cacheControl: '3600',
            upsert: false
          });
        
        if (uploadError) {
          console.error('SendMessageV2 - Error uploading file:', uploadError);
          throw uploadError;
        }
        
        // Get public URL
        const { data: { publicUrl } } = supabase.storage
          .from('chat-media')
          .getPublicUrl(filePath);
        
        // Determine file type
        let fileType: 'image' | 'audio' | 'video' | 'file' = 'file';
        if (file.type.startsWith('image/')) fileType = 'image';
        else if (file.type.startsWith('audio/')) fileType = 'audio';
        else if (file.type.startsWith('video/')) fileType = 'video';
        
        // For images, we could add dimension detection here
        let attachmentMetadata: any = {};
        if (fileType === 'image' && typeof window !== 'undefined') {
          try {
            const dimensions = await getImageDimensions(file);
            attachmentMetadata = dimensions;
          } catch (e) {
            console.warn('Could not get image dimensions:', e);
          }
        }
        
        uploadedAttachments.push({
          type: fileType,
          url: filePath,
          publicUrl,
          mimeType: file.type,
          size: file.size,
          name: file.name,
          metadata: attachmentMetadata
        });
      }
      
      metadata.attachments = uploadedAttachments;
    }
    
    onProgress?.(0.9); // 90% before inserting message
    
    // Insert the message with all attachment metadata
    const { data, error } = await supabase.from('messages').insert({
      id: messageId,
      room_id: roomId,
      user_id: userId,
      content,
      role,
      metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
      created_at: new Date().toISOString()
    });
    
    if (error) {
      console.error('SendMessageV2 - Error inserting message:', error);
      throw error;
    }
    
    onProgress?.(1.0); // 100% complete
    
    console.log('SendMessageV2 - Message sent successfully', messageId);
    
    // Return the complete message with attachments
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
      attachments: uploadedAttachments,
      error: null
    };
    
  } catch (error) {
    console.error('SendMessageV2 - Error sending message:', error);
    return { 
      message: null,
      attachments: [],
      error 
    };
  }
}

/**
 * Helper to get image dimensions in browser
 */
async function getImageDimensions(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: img.width, height: img.height });
    };
    
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image'));
    };
    
    img.src = url;
  });
}

/**
 * Process a message with Maya (triggers the AI response)
 */
export async function triggerMayaResponse(opts: {
  message: string;
  messageId: string;
  roomId: string;
  userId: string;
  attachments?: MessageAttachment[];
  apiUrl?: string;
}) {
  const { 
    message, 
    messageId, 
    roomId, 
    userId, 
    attachments = [],
    apiUrl = '/api/maya-chat-v3'
  } = opts;
  
  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message,
        messageId,
        roomId,
        mobileAuthUserId: userId,
        attachments: attachments.map(att => ({
          type: att.type,
          url: att.publicUrl,
          mimeType: att.mimeType,
          metadata: att.metadata
        }))
      })
    });
    
    if (!response.ok) {
      throw new Error(`Maya API error: ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error triggering Maya response:', error);
    throw error;
  }
}