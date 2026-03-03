# Voice Mode Setup for Mobile App

## Installation

First, install the required packages:

```bash
# For speech recognition
npm install @react-native-voice/voice
# or
yarn add @react-native-voice/voice

# For audio playback (if not already installed)
expo install expo-av

# iOS specific setup
cd ios && pod install
```

## Permissions

### iOS (Info.plist)
Add these permissions:
```xml
<key>NSMicrophoneUsageDescription</key>
<string>This app needs access to microphone for voice input.</string>
<key>NSSpeechRecognitionUsageDescription</key>
<string>This app needs access to speech recognition for voice commands.</string>
```

### Android (AndroidManifest.xml)
Add these permissions:
```xml
<uses-permission android:name="android.permission.RECORD_AUDIO" />
<uses-permission android:name="android.permission.INTERNET" />
```

## Usage Example

```typescript
import { VoiceMode } from '@/components/VoiceMode';
import { useRoomMessages } from '@mayahq/chat-sdk';

export function ChatScreen() {
  const { messages, loading } = useRoomMessages(roomId);
  const [lastAssistantMessage, setLastAssistantMessage] = useState(null);

  // Listen for new assistant messages
  useEffect(() => {
    const assistantMessages = messages.filter(m => m.role === 'assistant');
    const lastMessage = assistantMessages[assistantMessages.length - 1];
    
    if (lastMessage && lastMessage.id !== lastAssistantMessage?.id) {
      setLastAssistantMessage(lastMessage);
      // Trigger voice mode to play audio if available
      onNewAssistantMessage?.(lastMessage);
    }
  }, [messages]);

  return (
    <View style={styles.container}>
      {/* Chat header with voice mode */}
      <View style={styles.header}>
        <Text style={styles.title}>Chat with Maya</Text>
        <VoiceMode
          roomId={roomId}
          userId={userId}
          onMessageSent={(message) => {
            console.log('Voice message sent:', message);
          }}
          onNewAssistantMessage={lastAssistantMessage}
        />
      </View>

      {/* Your existing chat UI */}
      <ScrollView style={styles.messages}>
        {messages.map(message => (
          <MessageBubble key={message.id} message={message} />
        ))}
      </ScrollView>
    </View>
  );
}
```

## Alternative: Use Built-in Expo Speech

If you prefer to use Expo's built-in speech recognition (simpler but less features):

```typescript
import * as Speech from 'expo-speech';

// For TTS playback (simpler alternative)
const playTextToSpeech = async (text: string) => {
  await Speech.speak(text, {
    language: 'en-US',
    pitch: 1.0,
    rate: 1.0,
  });
};
```

## Note on Voice Mode Flag

The `voiceMode` flag in sendMessage is used by the memory worker to:
1. Generate TTS audio using ElevenLabs
2. Store the audio URL in message metadata
3. Return the audio URL for playback

Make sure your memory worker is configured with:
- `ELEVEN_LABS_API_KEY`
- `ELEVEN_LABS_VOICE_ID` (optional)
- Storage bucket `audio-files` created in Supabase 