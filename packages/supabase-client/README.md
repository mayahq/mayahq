# @mayahq/supabase-client

A unified Supabase client for MayaHQ's web and mobile applications.

## Features

- Shared database types between web and mobile
- Cross-platform authentication
- Chat functionality (messages, rooms, media)
- Memory and fact management
- Realtime subscriptions
- Data migration utilities

## Installation

```bash
npm install @mayahq/supabase-client
```

## Usage

### Web (Next.js)

```typescript
import { createClient } from '@mayahq/supabase-client'

// In Next.js applications
const supabase = createClient()

// Get messages from a room
const { data, error } = await supabase
  .from('messages')
  .select('*')
  .eq('room_id', 'your-room-id')
```

### React Native

```typescript
import { createNativeClient, setAsyncStorage } from '@mayahq/supabase-client'
import AsyncStorage from '@react-native-async-storage/async-storage'

// Set up AsyncStorage first
setAsyncStorage(AsyncStorage)

// Create client
const supabase = createNativeClient(
  'your-supabase-url', 
  'your-supabase-anon-key'
)
```

## API Reference

### Client Creation

- `createClient()` - Creates a browser client (Next.js)
- `createNativeClient(url, key)` - Creates a React Native client
- `createExpoClient(url, key)` - Creates an Expo client

### Chat

- `getMessages(client, roomId, limit, offset)` - Get messages in a room
- `sendMessage(client, message)` - Send a new message
- `createRoom(client, room)` - Create a new chat room
- `getUserRooms(client, userId)` - Get all rooms for a user
- `getRoom(client, roomId)` - Get a specific room
- `updateRoomLastActivity(client, roomId)` - Update room activity timestamp

### Media

- `uploadChatMedia(client, userId, file, fileName)` - Upload chat media
- `getChatMediaUrl(client, filePath)` - Get media URL
- `downloadChatMedia(client, filePath)` - Download media
- `fileToBase64(file)` - Convert file to base64
- `deleteChatMedia(client, filePath)` - Delete media

### Memory and Facts

- `getRelatedMemories(client, queryEmbedding, threshold, count)` - Get semantic memories
- `storeMemory(client, memory)` - Store a memory
- `getRelatedFacts(client, userId, queryEmbedding, threshold, count)` - Get semantic facts
- `storeFact(client, fact)` - Store a fact
- `getCoreFacts(client, userId)` - Get core facts
- `upsertCoreFact(client, fact)` - Update or insert core fact

### Realtime

- `subscribeToMessages(client, roomId, onMessage)` - Subscribe to new messages
- `subscribeToMessageUpdates(client, messageId, onUpdate)` - Subscribe to message updates
- `subscribeToRoomUpdates(client, userId, onRoomUpdate)` - Subscribe to room updates
- `unsubscribe(client, channel)` - Unsubscribe from a channel

### Migration

- `migrateLocalMessagesToDatabase(client, localMessages, userId, roomId)` - Migrate local messages
- `migrateMemories(client, sourceUserId, targetUserId)` - Migrate memories between users
- `shouldMigrateData(oldUserId, newUserId)` - Check if migration is needed

## Database Setup

The package includes SQL migrations to set up the necessary database structure:

1. Chat tables: `migrations/01_create_chat_tables.sql`
2. RLS policies: `migrations/02_rls_policies.sql`

You can apply these migrations using the Supabase dashboard or CLI.

## Types

The package includes TypeScript types for all database tables and entities:

- `Message` - Chat message
- `Room` - Chat room
- `Memory` - Maya memory
- `Fact` - Semantic fact
- `CoreFact` - Core user fact
- `Task` - User task
- `DailyReport` - User daily report 