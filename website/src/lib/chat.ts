import { User } from './auth'
import { createClient } from '@/lib/supabase/client'
import { processChatRequest } from './chat-processor'
import { getMayaAgent } from './maya-config'

// Task-related phrases for better task identification
const TASK_VIEWING_PHRASES = [
  'show my tasks',
  'what do i need to do',
  'list my tasks',
  'show me my to-do list',
  'show my to-dos',
  'show my todos',
  'what tasks do i have',
  'what are my tasks'
];

// Function to check if a message is a task viewing request
function isTaskViewRequest(message: string): boolean {
  const lowerMessage = message.toLowerCase().trim();
  return TASK_VIEWING_PHRASES.some(phrase => lowerMessage.includes(phrase));
}

export async function getChatResponse(
  message: string,
  user: User,
  chatHistory?: string,
  imageBase64?: string
): Promise<string> {
  try {
    // Fast path for known task view requests
    if (isTaskViewRequest(message)) {
      console.log('Direct task view request detected');
    }
    
    const agent = getMayaAgent()
    const startTime = Date.now()
    
    const result = await processChatRequest(agent, {
      message,
      userId: user.id,
      userName: user.name || 'User',
      chatHistory,
      imageBase64
    }, startTime)
    
    return result.message
    
  } catch (error) {
    console.error('Error getting chat response:', error)
    throw error
  }
} 