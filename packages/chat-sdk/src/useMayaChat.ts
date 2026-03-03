import { useState, useCallback } from 'react';
import { useRoomMessages } from './useRoomMessages';
import { sendMessageV2, triggerMayaResponse } from './sendMessageV2';
import { v4 as uuidv4 } from 'uuid';
import type { SupabaseClient } from '@supabase/supabase-js';

export interface UseMayaChatOptions {
  roomId: string;
  userId: string;
  supabaseClient?: SupabaseClient;
  mayaApiUrl?: string;
  onError?: (error: Error) => void;
}

export interface UseMayaChatReturn {
  messages: any[];
  loading: boolean;
  sending: boolean;
  uploadProgress: number;
  sendMessage: (content: string, attachments?: File[]) => Promise<void>;
  sendTextMessage: (content: string) => Promise<void>;
  sendImageMessage: (content: string, image: File) => Promise<void>;
  sendAudioMessage: (content: string, audio: File) => Promise<void>;
  error: Error | null;
}

/**
 * Unified hook for Maya chat with full multimodal support
 */
export function useMayaChat(options: UseMayaChatOptions): UseMayaChatReturn {
  const { 
    roomId, 
    userId, 
    supabaseClient, 
    mayaApiUrl = '/api/maya-chat-v3',
    onError 
  } = options;
  
  // Get messages with real-time updates
  const { 
    messages, 
    loading, 
    error: messagesError,
    addLocalMessage,
    updateLocalMessage 
  } = useRoomMessages(roomId, { 
    supabaseClient,
    limit: 100 
  });
  
  // Local state for sending
  const [sending, setSending] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState<Error | null>(messagesError);
  
  /**
   * Send a message with optional attachments
   */
  const sendMessage = useCallback(async (
    content: string, 
    attachments: File[] = []
  ) => {
    if ((!content.trim() && attachments.length === 0) || sending) {
      return;
    }
    
    setSending(true);
    setUploadProgress(0);
    setError(null);
    
    // Generate a temporary ID for optimistic UI
    const tempId = uuidv4();
    
    try {
      // 1. Add optimistic message to UI
      addLocalMessage({
        id: tempId,
        content,
        role: 'user',
        user_id: userId,
        room_id: roomId,
        created_at: new Date().toISOString(),
        media_path: null,
        metadata: {
          attachments: attachments.map(f => ({
            type: f.type.startsWith('image/') ? 'image' : 
                  f.type.startsWith('audio/') ? 'audio' : 
                  f.type.startsWith('video/') ? 'video' : 'file',
            name: f.name,
            size: f.size,
            uploading: true
          }))
        }
      } as any);
      
      // 2. Send message with attachments
      const { message, attachments: uploadedAttachments, error: sendError } = await sendMessageV2({
        roomId,
        userId,
        content,
        attachments,
        supabaseClient,
        onProgress: setUploadProgress
      });
      
      if (sendError || !message) {
        throw sendError || new Error('Failed to send message');
      }
      
      // 3. Update local message with real ID and uploaded attachments
      updateLocalMessage(tempId, {
        id: message.id,
        metadata: message.metadata
      });
      
      // 4. Trigger Maya's response
      if (message.role === 'user') {
        try {
          await triggerMayaResponse({
            message: content,
            messageId: message.id,
            roomId,
            userId,
            attachments: uploadedAttachments,
            apiUrl: mayaApiUrl
          });
        } catch (mayaError) {
          console.error('Failed to get Maya response:', mayaError);
          // Don't throw here - message was sent successfully
          // Maya's response will appear via realtime when ready
        }
      }
      
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Unknown error');
      setError(error);
      onError?.(error);
      
      // Remove optimistic message on error
      updateLocalMessage(tempId, { 
        metadata: { error: error.message }
      } as any);
      
      throw error;
    } finally {
      setSending(false);
      setUploadProgress(0);
    }
  }, [roomId, userId, sending, supabaseClient, mayaApiUrl, addLocalMessage, updateLocalMessage, onError]);
  
  /**
   * Convenience method for text-only messages
   */
  const sendTextMessage = useCallback(async (content: string) => {
    return sendMessage(content, []);
  }, [sendMessage]);
  
  /**
   * Convenience method for image messages
   */
  const sendImageMessage = useCallback(async (content: string, image: File) => {
    return sendMessage(content, [image]);
  }, [sendMessage]);
  
  /**
   * Convenience method for audio messages
   */
  const sendAudioMessage = useCallback(async (content: string, audio: File) => {
    return sendMessage(content, [audio]);
  }, [sendMessage]);
  
  return {
    messages,
    loading,
    sending,
    uploadProgress,
    sendMessage,
    sendTextMessage,
    sendImageMessage,
    sendAudioMessage,
    error: error || messagesError
  };
}

/**
 * Helper hook for voice mode
 */
export function useMayaVoiceChat(options: UseMayaChatOptions) {
  const chat = useMayaChat(options);
  const [recording, setRecording] = useState(false);
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
  
  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      
      recorder.ondataavailable = (e) => chunks.push(e.data);
      recorder.onstop = async () => {
        const blob = new Blob(chunks, { type: 'audio/webm' });
        const file = new File([blob], 'voice-message.webm', { type: 'audio/webm' });
        
        // Send as audio message
        await chat.sendAudioMessage('Voice message', file);
        
        // Stop all tracks
        stream.getTracks().forEach(track => track.stop());
      };
      
      recorder.start();
      setMediaRecorder(recorder);
      setRecording(true);
    } catch (error) {
      console.error('Failed to start recording:', error);
    }
  }, [chat]);
  
  const stopRecording = useCallback(() => {
    if (mediaRecorder && recording) {
      mediaRecorder.stop();
      setMediaRecorder(null);
      setRecording(false);
    }
  }, [mediaRecorder, recording]);
  
  return {
    ...chat,
    recording,
    startRecording,
    stopRecording
  };
}