# MayaHQ Chat SDK

Shared chat functionality for MayaHQ web and mobile applications.

## Installation

```bash
# Inside your monorepo
pnpm install
```

## Usage

### Web (Next.js) Example

```tsx
import { useEffect, useState } from 'react';
import { useRoomMessages, sendMessage } from '@chat-sdk';
import { createClient } from '@supabase';

export default function ChatComponent({ roomId, userId }) {
  const supabase = createClient();
  const { messages, loading, error, addLocalMessage } = useRoomMessages(supabase, roomId);
  const [messageText, setMessageText] = useState('');

  const handleSendMessage = async () => {
    if (!messageText.trim()) return;
    
    // Generate local optimistic update
    const localMessage = {
      id: 'temp-' + Date.now(),
      content: messageText,
      localId: 'temp-' + Date.now(),
      isPending: true
    };
    
    // Add to local state immediately
    addLocalMessage(localMessage);
    setMessageText('');
    
    // Send to server
    await sendMessage(supabase, {
      roomId,
      userId,
      content: messageText
    });
  };

  return (
    <div>
      {loading ? (
        <div>Loading messages...</div>
      ) : (
        <div className="messages">
          {messages.map(message => (
            <div key={message.id} className={`message ${message.isPending ? 'pending' : ''}`}>
              {message.content}
            </div>
          ))}
        </div>
      )}
      
      <div className="input-area">
        <input
          type="text"
          value={messageText}
          onChange={e => setMessageText(e.target.value)}
          placeholder="Type your message..."
        />
        <button onClick={handleSendMessage}>Send</button>
      </div>
    </div>
  );
}
```

### Mobile (React Native) Example

```tsx
import React, { useState } from 'react';
import { View, Text, TextInput, Button, FlatList, StyleSheet } from 'react-native';
import { useRoomMessages, sendMessage } from '@chat-sdk';
import { createNativeClient, setAsyncStorage } from '@supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Initialize AsyncStorage for Supabase
setAsyncStorage(AsyncStorage);

export default function ChatScreen({ roomId, userId, supabaseUrl, supabaseKey }) {
  const supabase = createNativeClient(supabaseUrl, supabaseKey);
  const { messages, loading, error, addLocalMessage } = useRoomMessages(supabase, roomId);
  const [messageText, setMessageText] = useState('');

  const handleSendMessage = async () => {
    if (!messageText.trim()) return;
    
    // Generate local optimistic update
    const localMessage = {
      id: 'temp-' + Date.now(),
      content: messageText,
      localId: 'temp-' + Date.now(),
      isPending: true
    };
    
    // Add to local state immediately
    addLocalMessage(localMessage);
    setMessageText('');
    
    // Send to server
    await sendMessage(supabase, {
      roomId,
      userId,
      content: messageText
    });
  };

  if (loading) {
    return <Text>Loading messages...</Text>;
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={messages}
        keyExtractor={item => item.id}
        renderItem={({ item }) => (
          <View style={[styles.message, item.isPending && styles.pendingMessage]}>
            <Text>{item.content}</Text>
          </View>
        )}
      />
      
      <View style={styles.inputArea}>
        <TextInput
          style={styles.input}
          value={messageText}
          onChangeText={setMessageText}
          placeholder="Type your message..."
        />
        <Button title="Send" onPress={handleSendMessage} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 10,
  },
  message: {
    padding: 10,
    marginVertical: 5,
    backgroundColor: '#f0f0f0',
    borderRadius: 5,
  },
  pendingMessage: {
    opacity: 0.6,
  },
  inputArea: {
    flexDirection: 'row',
    padding: 10,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 5,
    padding: 10,
    marginRight: 10,
  },
});
```

## Features

- Real-time message synchronization using Supabase Realtime
- Works consistently across web and mobile platforms
- Support for media attachments (images, audio) using Supabase Storage
- Optimistic updates for better UX
- TypeScript support

## Architecture

The chat SDK is designed to work with the following architecture:

1. Supabase provides the database, authentication, storage, and realtime features
2. Messages are stored in the `messages` table with references to `rooms`
3. Media attachments use Supabase Storage with secure access controls
4. Both web and mobile clients share the same type definitions and core logic

## Adding Media Support

To send a message with media:

```tsx
await sendMessage(supabase, {
  roomId,
  userId,
  content: messageText,
  media: {
    uri: imageUri,
    type: 'image'
  }
});
```

The SDK will handle uploading the media to Supabase Storage and associate it with the message. 