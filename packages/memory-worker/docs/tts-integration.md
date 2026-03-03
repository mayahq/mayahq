# Text-to-Speech (TTS) Integration

This document describes the TTS integration in Maya's memory worker, enabling voice mode for chat conversations.

## Overview

The TTS integration uses ElevenLabs API to convert Maya's text responses into natural-sounding speech. This enables a fully voice-enabled conversation mode where users can speak to Maya and hear her responses.

## Architecture

```
User Voice Input → Speech-to-Text → Maya Processes → Response Generated → TTS → Audio Output
                                                                       ↓
                                                            Text logged in memories
```

## Configuration

### Environment Variables

```bash
# ElevenLabs Configuration
ELEVEN_LABS_API_KEY=your-api-key-here
ELEVEN_LABS_VOICE_ID=pNInz6obpgDQGcFmaJgB  # Default: Bella voice
ELEVEN_LABS_MODEL=eleven_monolingual_v1     # Optional: Model to use
```

### Supabase Storage

Make sure you have a `audio-files` bucket in Supabase Storage with public access enabled for TTS audio files.

## Usage

### 1. Enable Voice Mode in Chat SDK

When sending a message, set the `voiceMode` flag:

```typescript
import { sendMessage } from '@mayahq/chat-sdk';

// Send a message with voice mode enabled
const result = await sendMessage({
  roomId: 'room-123',
  userId: 'user-123',
  content: 'Hello Maya, how are you?',
  voiceMode: true  // Enable TTS for Maya's response
});
```

### 2. Voice Mode Flow

When voice mode is enabled:

1. User message is marked with `metadata.voiceMode = true`
2. Maya processes the message normally
3. When Maya generates a response, the memory worker:
   - Detects voice mode is enabled
   - Generates TTS audio using ElevenLabs
   - Uploads audio to Supabase Storage
   - Updates message metadata with `audioUrl`

### 3. Playing Audio in Client

After Maya responds, check for audio URL in the message metadata:

```typescript
// In your message handler
if (message.metadata?.audioUrl) {
  const audio = new Audio(message.metadata.audioUrl);
  await audio.play();
}
```

## API Endpoints

### Generate TTS Audio

```bash
POST /api/v1/tts
Content-Type: application/json

{
  "text": "Hello, this is Maya speaking!",
  "voiceId": "pNInz6obpgDQGcFmaJgB",  // Optional
  "modelId": "eleven_monolingual_v1",   // Optional
  "voiceSettings": {                     // Optional
    "stability": 0.5,
    "similarity_boost": 0.75
  }
}

Response: Audio file (audio/mpeg)
```

### Generate and Store TTS for Message

```bash
POST /api/v1/tts/message
Content-Type: application/json

{
  "messageId": "msg-123",
  "text": "Hello, this is Maya speaking!",
  "userId": "user-123"
}

Response:
{
  "success": true,
  "audioUrl": "https://your-supabase-url/storage/v1/object/public/audio-files/tts/user-123/msg-123-1234567890.mp3",
  "duration": 1250  // milliseconds
}
```

## Voice Settings

### Available Voices

ElevenLabs provides multiple voices. The default is "Bella" (`pNInz6obpgDQGcFmaJgB`). You can change this by updating the `ELEVEN_LABS_VOICE_ID` environment variable.

### Voice Parameters

- **Stability** (0.0 - 1.0): Controls consistency of voice. Lower = more expressive, Higher = more consistent
- **Similarity Boost** (0.0 - 1.0): Controls how closely the voice matches the original. Higher = more similar

## Mobile Integration

For mobile apps:

1. Set `voiceMode: true` when sending messages from voice input
2. Poll or subscribe to message updates to get the `audioUrl`
3. Use native audio players to play the TTS audio

Example React Native:

```javascript
import Sound from 'react-native-sound';

// When Maya's response arrives with audioUrl
if (message.metadata?.audioUrl) {
  const sound = new Sound(message.metadata.audioUrl, '', (error) => {
    if (!error) {
      sound.play();
    }
  });
}
```

## Error Handling

The TTS service handles various error scenarios:

- **Missing API Key**: Returns error, TTS is skipped
- **Rate Limits**: Gracefully fails, message is still delivered without audio
- **Network Issues**: TTS generation fails silently, text response is preserved

## Performance Considerations

1. **Async Processing**: TTS generation happens asynchronously after the text response is stored
2. **Caching**: Audio files are cached in Supabase Storage with 1-hour cache control
3. **File Naming**: Files use pattern `tts/{userId}/{messageId}-{timestamp}.mp3`

## Testing

### Test Voice Mode Locally

```bash
# Send a test message with voice mode
curl -X POST http://localhost:3002/test-message \
  -H "Content-Type: application/json" \
  -d '{
    "roomId": "test-room",
    "userId": "test-user",
    "content": "Tell me a short joke",
    "metadata": {"voiceMode": true}
  }'
```

### Test TTS Directly

```bash
# Generate TTS audio
curl -X POST http://localhost:3002/api/v1/tts \
  -H "Content-Type: application/json" \
  -d '{"text": "Hello, this is a test"}' \
  --output test.mp3
```

## Monitoring

Monitor TTS usage in logs:

```bash
# Look for TTS-related logs
grep "\[TTS\]" memory-worker.log
```

Log entries include:
- Voice mode detection
- TTS generation start/completion
- Audio upload status
- Error details

## Cost Considerations

ElevenLabs pricing is based on character count. To manage costs:

1. Monitor usage via ElevenLabs dashboard
2. Consider implementing:
   - Character limits per message
   - Daily/monthly quotas per user
   - Selective TTS (only for certain message types)

## Future Enhancements

1. **Voice Selection**: Allow users to choose from multiple voices
2. **Language Support**: Add multilingual TTS support
3. **Emotion Control**: Adjust voice parameters based on message sentiment
4. **Streaming TTS**: Stream audio as it's generated for faster response
5. **Local Caching**: Cache frequently used phrases client-side 