# Voice Mode Implementation Summary

## What We've Built

### 1. Text-to-Speech (TTS) - ✅ COMPLETED
- **Memory Worker**: TTS service that generates audio using ElevenLabs
- **Chat SDK**: Added `voiceMode` flag to messages
- **Process**: When `voiceMode: true`, Maya's responses are converted to audio
- **Storage**: Audio files stored in Supabase Storage (`audio-files` bucket)

### 2. Speech-to-Text (STT) - 🚧 EXAMPLES PROVIDED
- **Web**: Using Web Speech API (built into browsers)
- **Mobile**: Using @react-native-voice/voice package
- **Note**: This is client-side only, no server changes needed

## Setup Requirements

### 1. Environment Variables (Memory Worker)
```bash
ELEVEN_LABS_API_KEY=your-api-key
ELEVEN_LABS_VOICE_ID=voice-id (optional, defaults to Bella)
```

### 2. Storage Bucket
Create `audio-files` bucket in Supabase:
- Run: `npm run setup-tts` in memory-worker
- OR manually create in Supabase dashboard

### 3. Website Integration
1. Add the `VoiceModeToggle` component to your chat UI
2. Update message sending to include `voiceMode` flag
3. Auto-play audio responses when in voice mode

### 4. Mobile App Integration
1. Install required packages:
   ```bash
   npm install @react-native-voice/voice
   expo install expo-av
   ```
2. Add permissions for microphone/speech recognition
3. Use the `VoiceMode` component in your chat screen

## How It Works

### Voice Conversation Flow:
1. **User speaks** → Speech-to-Text → Text message
2. **Send message** with `voiceMode: true`
3. **Maya processes** → Generates text response
4. **TTS Service** → Converts to audio (ElevenLabs)
5. **Audio stored** → URL in message metadata
6. **Client plays** → Audio automatically in voice mode

### Key Features:
- ✅ Async TTS generation (doesn't block responses)
- ✅ Audio URL stored in message metadata
- ✅ Graceful fallback if TTS fails
- ✅ Works across web and mobile
- ✅ Pay-per-use with ElevenLabs

## Next Steps

1. **Create storage bucket**: Run setup script or create manually
2. **Test TTS**: Send a message with `voiceMode: true`
3. **Implement STT**: Add voice input to your UI
4. **Voice UI/UX**: Add visual feedback for listening/speaking states

## Cost Considerations

ElevenLabs charges per character. Consider:
- Character limits per message
- User quotas (daily/monthly)
- Selective TTS (only certain message types)
- Caching common phrases 