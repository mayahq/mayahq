/**
 * @deprecated This file uses the legacy /api/chat endpoint approach.
 * New code should use @mayahq/chat-sdk directly instead of this class.
 * This is kept for backward compatibility only and will be removed in a future release.
 */

import { supabase } from '../supabase/client';
import { v4 as uuidv4 } from 'uuid';
import AsyncStorage from '@react-native-async-storage/async-storage';
// Import the SDK with any type to avoid linting errors in deprecated code
// @ts-ignore - Using a workspace package that might not be in node_modules
import { sendMessage } from '@mayahq/chat-sdk';

export interface ChatMessage {
  id: string;
  content: string; 
  role: 'user' | 'assistant';
  created_at: string;
  user_id: string;
  room_id: string;
}

export interface MayaConfig {
  userId: string;
  userName?: string;
  endpoint?: string; // Optional custom API endpoint
}

/**
 * @deprecated Mobile client for Maya that connects to the server-side maya-agent.
 * Use @mayahq/chat-sdk directly instead for new code.
 */
export class MobileAgent {
  private userId: string;
  private userName: string;
  private endpoint: string;
  private processingMessage: boolean = false;
  private processedMessages = new Set<string>();
  
  constructor(config: MayaConfig) {
    this.userId = config.userId;
    this.userName = config.userName || 'User';
    // Update comment to mark as deprecated
    this.endpoint = config.endpoint || '/api/maya-chat'; // Legacy endpoint
    console.log(`[MayaAgent] Initialized with endpoint: ${this.endpoint} (DEPRECATED)`);
    console.warn('[MayaAgent] This class is deprecated. Use @mayahq/chat-sdk directly instead.');
  }
  
  /**
   * Send a message to Maya and get a response
   */
  async chat(message: string, roomId: string): Promise<ChatMessage> {
    if (this.processingMessage) {
      console.warn('[MayaAgent] Already processing a message, rejecting new request');
      throw new Error('Already processing a message');
    }
    
    try {
      this.processingMessage = true;
      console.log(`[MayaAgent] Chat initiated with message: "${message.substring(0, 30)}${message.length > 30 ? '...' : ''}" for room: ${roomId}`);
      
      // Try to use the proper SDK first
      try {
        console.log('[MayaAgent] Using Chat SDK directly (recommended approach)');
        
        // Send message using the SDK
        const { message: sdkResponse, error } = await sendMessage({
          roomId,
          userId: this.userId,
          content: message
        });
        
        if (error) {
          console.error('[MayaAgent] SDK error:', error);
          throw error;
        }
        
        if (sdkResponse) {
          console.log('[MayaAgent] Message sent successfully via SDK');
          
          // Wait for assistant's response
          console.log('[MayaAgent] Waiting for assistant response...');
          const assistantMessage = await this.waitForResponse(roomId, new Date().toISOString(), 30000);
          
          if (!assistantMessage) {
            console.error('[MayaAgent] Timeout waiting for Maya response');
            throw new Error('Timeout waiting for Maya response');
          }
          
          // Add message ID to processed set to prevent duplication
          this.processedMessages.add(assistantMessage.id);
          
          return assistantMessage;
        }
      } catch (sdkError) {
        console.warn('[MayaAgent] SDK approach failed, falling back to legacy methods:', sdkError);
        // Continue with fallback approaches
      }
      
      // Legacy approach 1: Use direct API endpoint if available
      if (this.endpoint.startsWith('http')) {
        // Get session for authentication token
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          console.error('[MayaAgent] No active session');
          throw new Error('No active session');
        }
        
        console.log('[MayaAgent] Using legacy API endpoint:', this.endpoint);
        console.log('[MayaAgent] With auth token:', session.access_token.substring(0, 10) + '...');
        
        const payload = {
          message,
          roomId,
          userId: this.userId,
          userName: this.userName
        };
        
        console.log('[MayaAgent] Request payload:', JSON.stringify(payload, null, 2));
        
        const response = await fetch(this.endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify(payload),
        });
        
        // Add detailed logging here
        console.log('[MayaAgent] API response status:', response.status);
        console.log('[MayaAgent] API response headers:', JSON.stringify(Object.fromEntries([...response.headers.entries()])));
        
        // Try to get text response for debugging
        try {
          const responseText = await response.text();
          console.log('[MayaAgent] API response text:', responseText);
          
          if (!responseText) {
            console.error('[MayaAgent] Empty response from API');
            throw new Error('Empty response from API');
          }
          
          // Parse the JSON response
          const data = JSON.parse(responseText);
          console.log('[MayaAgent] Parsed API response:', data);
          
          // Make sure we're returning the message object in the expected format
          if (data && data.message) {
            console.log('[MayaAgent] Successfully extracted message from API response');
            
            const assistantMessage = data.message as ChatMessage;
            
            // Add message ID to processed set to prevent duplication
            this.processedMessages.add(assistantMessage.id);
            
            // Store the response locally to ensure persistence
            await this.saveMessageToLocalStorage(assistantMessage);
            
            // Important: Directly insert into database as backup
            try {
              console.log('[MayaAgent] Inserting assistant message directly to database as backup');
              
              // Create a properly typed object with a valid UUID for user_id
              // This fixes the "invalid input syntax for type uuid: 'assistant'" error
              const dbMessage = {
                id: assistantMessage.id,
                content: assistantMessage.content,
                role: 'assistant' as const,
                // If user_id is not a valid UUID (like 'assistant' or 'system'), use the sender's ID
                user_id: this.isValidUUID(assistantMessage.user_id) 
                  ? assistantMessage.user_id 
                  : this.userId, // Use the sender's ID as fallback
                room_id: assistantMessage.room_id,
                created_at: assistantMessage.created_at
              };
              
              console.log('[MayaAgent] Using user_id for DB insert:', dbMessage.user_id);
              
              const { error: insertError } = await supabase.from('messages').insert(dbMessage);
              
              if (insertError) {
                // This is expected if the message was already inserted by the API
                console.log('[MayaAgent] Insert backup error (likely already exists):', insertError.message);
              } else {
                console.log('[MayaAgent] Inserted backup message successfully');
              }
            } catch (dbError) {
              console.error('[MayaAgent] Error inserting backup message:', dbError);
            }
            
            return assistantMessage;
          } else {
            console.error('[MayaAgent] API response missing message property:', data);
            throw new Error('API response missing required message property');
          }
        } catch (error) {
          console.error('[MayaAgent] Error parsing API response:', error);
          throw new Error(`API error: ${response.status} - Failed to parse response`);
        }
      }
      
      // Legacy approach 2: Use Supabase function (Edge Function)
      try {
        console.log('[MayaAgent] Trying Supabase function...');
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) throw new Error('No active session');
        
        const { data: functionData, error: functionError } = await supabase.functions.invoke('maya-chat', {
          body: {
            message,
            userId: this.userId,
            userName: this.userName,
            roomId
          }
        });
        
        if (functionError) {
          console.log('[MayaAgent] Function error details:', functionError);
          throw new Error(functionError.message);
        }
        
        console.log('[MayaAgent] Function response:', functionData);
        
        // Add message ID to processed set to prevent duplication
        if (functionData && functionData.message) {
          this.processedMessages.add(functionData.message.id);
          
          // Ensure the role is properly typed
          const typedMessage = functionData.message as ChatMessage;
          return typedMessage;
        }
        
        throw new Error('Invalid response from Supabase function');
      } catch (supabaseError) {
        console.error('[MayaAgent] Supabase function error:', supabaseError);
        
        // Fallback: Use direct database insertion and rely on database triggers
        console.log('[MayaAgent] Falling back to direct DB method');
        const messageId = uuidv4();
        const timestamp = new Date().toISOString();
        
        // Insert user message
        const { error: insertError } = await supabase.from('messages').insert({
          id: messageId,
          content: message,
          role: 'user',
          user_id: this.userId,
          room_id: roomId,
          created_at: timestamp
        });
        
        if (insertError) {
          console.error('[MayaAgent] Error inserting message:', insertError);
          throw insertError;
        }
        
        console.log('[MayaAgent] User message inserted with ID:', messageId);
        console.log('[MayaAgent] Waiting for assistant response...');
        
        // Wait for response (with timeout)
        const assistantMessage = await this.waitForResponse(roomId, timestamp, 30000);
        
        if (!assistantMessage) {
          console.error('[MayaAgent] Timeout waiting for Maya response');
          throw new Error('Timeout waiting for Maya response');
        }
        
        console.log('[MayaAgent] Received assistant response:', assistantMessage.content.substring(0, 30) + '...');
        
        // Add message ID to processed set to prevent duplication
        this.processedMessages.add(assistantMessage.id);
        
        return assistantMessage;
      }
    } catch (error) {
      console.error('[MayaAgent] Maya chat error:', error);
      
      // Return a fallback message
      const fallbackMessage: ChatMessage = {
        id: uuidv4(),
        content: "I'm sorry, I'm having trouble connecting right now. Please try again later.",
        role: 'assistant',
        created_at: new Date().toISOString(),
        user_id: this.userId, // Use the actual user's ID to avoid UUID errors
        room_id: roomId
      };
      
      // Add fallback message ID to processed set
      this.processedMessages.add(fallbackMessage.id);
      
      return fallbackMessage;
    } finally {
      this.processingMessage = false;
    }
  }
  
  /**
   * Check if a message has been processed
   */
  hasProcessedMessage(messageId: string): boolean {
    return this.processedMessages.has(messageId);
  }
  
  /**
   * Wait for Maya's response in the database
   */
  private async waitForResponse(roomId: string, afterTimestamp: string, timeout: number): Promise<ChatMessage | null> {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
      // Check for new message from assistant
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('room_id', roomId)
        .eq('role', 'assistant')
        .gt('created_at', afterTimestamp)
        .order('created_at', { ascending: true })
        .limit(1);
        
      if (error) {
        console.error('[MayaAgent] Error checking for response:', error);
      } else if (data && data.length > 0) {
        const message = data[0] as ChatMessage;
        console.log('[MayaAgent] Found assistant response:', message.id);
        
        // Add message ID to processed set to prevent duplication
        this.processedMessages.add(message.id);
        
        return message;
      }
      
      // Wait before checking again
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    return null; // Timeout reached
  }
  
  /**
   * Get chat history for a room
   */
  async getChatHistory(roomId: string, limit = 50): Promise<ChatMessage[]> {
    try {
      console.log(`[MayaAgent] Getting chat history for room: ${roomId}, limit: ${limit}`);
      
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('room_id', roomId)
        .order('created_at', { ascending: true })
        .limit(limit);
        
      if (error) {
        console.error('[MayaAgent] Error fetching chat history:', error);
        throw new Error(error.message);
      }
      
      const messages = (data || []) as ChatMessage[];
      console.log(`[MayaAgent] Retrieved ${messages.length} messages from history`);
      
      // Add all message IDs to processed set
      messages.forEach(msg => this.processedMessages.add(msg.id));
      
      return messages;
    } catch (error) {
      console.error('[MayaAgent] Error fetching chat history:', error);
      return [];
    }
  }

  /**
   * Store a message in local storage for persistence
   */
  private async saveMessageToLocalStorage(message: ChatMessage): Promise<void> {
    try {
      console.log('[MayaAgent] Saving message to local storage:', message.id);
      
      // Get existing messages for this room
      const storedMessagesStr = await AsyncStorage.getItem(`messages_${message.room_id}`);
      let storedMessages: ChatMessage[] = [];
      
      if (storedMessagesStr) {
        storedMessages = JSON.parse(storedMessagesStr);
      }
      
      // Check if this message already exists
      const messageExists = storedMessages.some(m => m.id === message.id);
      
      if (!messageExists) {
        // Add the new message
        storedMessages.push(message);
        
        // Save back to storage
        await AsyncStorage.setItem(`messages_${message.room_id}`, JSON.stringify(storedMessages));
        console.log(`[MayaAgent] Message saved to room ${message.room_id} storage. Total messages: ${storedMessages.length}`);
      } else {
        console.log('[MayaAgent] Message already exists in storage, skipping save');
      }
    } catch (error) {
      console.error('[MayaAgent] Error saving message to local storage:', error);
      // Don't throw here, just log the error
    }
  }

  /**
   * Check if a string is a valid UUID v4
   */
  private isValidUUID(str: string): boolean {
    // Simple UUID validation regex
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[4][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidRegex.test(str);
  }
}

// Create and export a singleton instance
export const createMayaAgent = (config: MayaConfig): MobileAgent => {
  console.log(`[MayaAgent] Creating new agent for user: ${config.userId}`);
  return new MobileAgent(config);
}; 