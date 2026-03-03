# Migrating from MobileAgent to Chat SDK

This document provides guidance on migrating from the deprecated `MobileAgent` class to the new `@mayahq/chat-sdk`.

## Why Migrate?

The `MobileAgent` class was a wrapper around direct API calls to the `/api/chat` endpoint. The new Chat SDK:

1. Integrates directly with Supabase for better real-time capabilities
2. Uses the same code as the website, ensuring consistency
3. Provides better typing and error handling
4. Makes direct use of database triggers for AI responses
5. Better integration with the memory worker

## Migration Steps

### 1. Import the Chat SDK

```typescript
// OLD
import { createMayaAgent, ChatMessage as MayaMessage } from '../lib/maya';

// NEW
import { useRoomMessages, sendMessage, Message as ChatMessage } from '@mayahq/chat-sdk';
```

### 2. Room Management

```typescript
// OLD
const [mayaAgent, setMayaAgent] = useState<ReturnType<typeof createMayaAgent> | null>(null);
const [roomId, setRoomId] = useState<string | null>(null);
const [messages, setMessages] = useState<MayaMessage[]>([]);

// Get or create room manually and load messages
useEffect(() => {
  async function setupChat() {
    // Manual room creation and message loading
    // ...
    const agent = createMayaAgent({ userId: user.id });
    setMayaAgent(agent);
    const chatHistory = await agent.getChatHistory(roomId);
    setMessages(chatHistory);
  }
  
  if (user?.id) {
    setupChat();
  }
}, [user?.id]);

// NEW
const [roomId, setRoomId] = useState<string | null>(null);

// Create or get room
useEffect(() => {
  async function getOrCreateRoom() {
    if (!user?.id) return;
    
    // Look for an existing room
    const { data: rooms } = await supabase
      .from('rooms')
      .select('*')
      .eq('user_id', user.id)
      .order('last_message_at', { ascending: false })
      .limit(1);
      
    if (rooms && rooms.length > 0) {
      setRoomId(rooms[0].id);
    } else {
      // Create a new room
      const { data } = await supabase
        .from('rooms')
        .insert({
          name: 'Chat with Maya',
          user_id: user.id
        })
        .select()
        .single();
        
      if (data) {
        setRoomId(data.id);
      }
    }
  }
  
  if (user?.id) {
    getOrCreateRoom();
  }
}, [user?.id]);

// Use hook to get messages automatically
const { 
  messages, 
  loading, 
  error,
  addLocalMessage 
} = useRoomMessages(roomId || '', {
  supabaseClient: supabase,
  limit: 50
});
```

### 3. Sending Messages

```typescript
// OLD
const handleSend = async (message: string) => {
  setInputText('');
  setTyping(true);
  
  try {
    // Send via agent
    const response = await mayaAgent?.chat(message, roomId);
    
    if (response) {
      // Manually update UI
      setMessages(prev => [...prev, response]);
    }
  } catch (error) {
    console.error('Error sending message:', error);
  } finally {
    setTyping(false);
  }
};

// NEW
const handleSendMessage = async () => {
  if (!inputText.trim() || !roomId || !user?.id) return;
  
  const trimmedText = inputText.trim();
  setInputText('');
  setSendingMessage(true);
  
  try {
    // Use SDK's sendMessage function
    const { message, error: sendError } = await sendMessage({
      roomId,
      userId: user.id,
      content: trimmedText,
      role: 'user'
    });
    
    if (sendError) {
      throw sendError;
    }
    
    // Messages are automatically added to the UI via the useRoomMessages hook
    // No need to manually update state
  } catch (error) {
    console.error('Error sending message:', error);
    
    // Add error message to chat if needed
    addLocalMessage({
      id: Date.now().toString(),
      room_id: roomId,
      user_id: user.id,
      role: 'assistant',
      content: 'Sorry, I encountered an error processing your message. Please try again.',
      created_at: new Date().toISOString(),
      isError: true
    } as ChatMessage);
  } finally {
    setSendingMessage(false);
  }
};
```

### 4. Memory Worker Integration

If you want to integrate with the memory worker:

```typescript
// Connect to memory worker
try {
  if (MEMORY_WORKER_ENABLED) {
    const workerResponse = await fetch(`${MEMORY_WORKER_URL}/process-message`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        content: trimmedText,
        userId: user.id,
        roomId
      }),
      signal: AbortSignal.timeout ? AbortSignal.timeout(3000) : undefined
    });
    
    if (workerResponse.ok) {
      console.log('Memory worker processing started');
    }
  }
} catch (workerError) {
  console.warn('Memory worker connection error (non-fatal):', workerError);
  // Continue - this is non-critical
}
```

## Full Example

See `ChatScreenNew.tsx` for a complete implementation using the Chat SDK.

## Timeline

The legacy `MobileAgent` class will be removed in the next major version. Please migrate to the Chat SDK as soon as possible. 