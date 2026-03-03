/**
 * Helper module for working with Maya's memory API
 * This specifically addresses the issues with direct Supabase REST API calls
 * to the maya_memories table which were causing 400 errors due to column selection parameters.
 */
import { supabase } from '../supabase/client';
import Constants from 'expo-constants';

// Default API endpoint - use a proper environment variable in production
const MAYA_MEMORY_API_ENDPOINT = 'https://mayahq-website.vercel.app/api/maya-memory';

/**
 * Store a memory using the dedicated maya-memory API endpoint
 * This avoids the column parameter issues with direct table inserts
 */
export async function storeMemory(content: string, options?: {
  userId?: string;
  userName?: string;
  tags?: string[];
  platform?: string;
}) {
  try {
    console.log('[MayaMemory] Storing memory via API endpoint');
    
    // Get session for auth token
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      console.error('[MayaMemory] No active session');
      throw new Error('No active session');
    }
    
    // Prepare the request body
    const payload = {
      content,
      userId: options?.userId,
      userName: options?.userName,
      tags: options?.tags || [],
      platform: options?.platform || 'mobile-app'
    };
    
    // Make the API request
    const response = await fetch(MAYA_MEMORY_API_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: JSON.stringify(payload),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('[MayaMemory] API error:', response.status, errorText);
      throw new Error(`API error: ${response.status} - ${errorText}`);
    }
    
    const data = await response.json();
    console.log('[MayaMemory] Memory stored successfully:', data.id);
    
    return {
      success: true,
      id: data.id,
      message: data.message
    };
  } catch (error) {
    console.error('[MayaMemory] Error storing memory:', error);
    throw error;
  }
}

/**
 * Store a conversation memory (combines user input and Maya's response)
 */
export async function storeConversationMemory(userMessage: string, mayaResponse: string, options?: {
  userId?: string;
  userName?: string;
  tags?: string[];
}) {
  // Format the content as a conversation
  const content = `User: ${userMessage}\nMaya: ${mayaResponse}`;
  
  // Store with conversation platform tag
  return storeMemory(content, {
    ...options,
    platform: 'mobile-conversation'
  });
} 