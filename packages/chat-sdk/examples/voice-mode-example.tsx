import React, { useState, useRef } from 'react';
import { sendMessage } from '../src/sendMessage';
import { useRoomMessages } from '../src/useRoomMessages';

export function VoiceChatExample() {
  const [isVoiceMode, setIsVoiceMode] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [roomId] = useState('voice-chat-room');
  const [userId] = useState('user-123');
  const audioQueueRef = useRef<HTMLAudioElement[]>([]);
  
  // Use the room messages hook
  const { messages } = useRoomMessages(roomId);

  // Handle voice mode toggle
  const toggleVoiceMode = () => {
    setIsVoiceMode(!isVoiceMode);
    console.log(`Voice mode ${!isVoiceMode ? 'enabled' : 'disabled'}`);
  };

  // Send a message with voice mode
  const sendVoiceMessage = async (text: string) => {
    try {
      const result = await sendMessage({
        roomId,
        userId,
        content: text,
        voiceMode: isVoiceMode, // This enables TTS for Maya's response
      });

      if (result.error) {
        console.error('Error sending message:', result.error);
      }
    } catch (error) {
      console.error('Error in sendVoiceMessage:', error);
    }
  };

  // Play audio response when Maya replies with TTS
  React.useEffect(() => {
    const lastMessage = messages[messages.length - 1];
    
    if (
      lastMessage?.role === 'assistant' && 
      lastMessage.metadata &&
      typeof lastMessage.metadata === 'object' &&
      !Array.isArray(lastMessage.metadata) &&
      'audioUrl' in lastMessage.metadata &&
      isVoiceMode
    ) {
      playAudio(lastMessage.metadata.audioUrl as string);
    }
  }, [messages, isVoiceMode]);

  // Audio playback with queue management
  const playAudio = (audioUrl: string) => {
    const audio = new Audio(audioUrl);
    
    audio.addEventListener('ended', () => {
      // Remove from queue when finished
      audioQueueRef.current = audioQueueRef.current.filter(a => a !== audio);
      
      // Play next in queue if any
      if (audioQueueRef.current.length > 0) {
        audioQueueRef.current[0].play();
      }
    });

    // Add to queue
    audioQueueRef.current.push(audio);

    // Play if it's the only one in queue
    if (audioQueueRef.current.length === 1) {
      audio.play().catch(err => {
        console.error('Error playing audio:', err);
        // Remove from queue on error
        audioQueueRef.current = audioQueueRef.current.filter(a => a !== audio);
      });
    }
  };

  // Simple recording simulation (in real app, use Web Audio API or library)
  const handleRecordingToggle = () => {
    if (!isRecording) {
      setIsRecording(true);
      console.log('Recording started...');
      
      // Simulate recording for 3 seconds
      setTimeout(() => {
        setIsRecording(false);
        // In real app, you'd process the audio to text here
        // For demo, we'll send a sample message
        sendVoiceMessage("What's the weather like today?");
      }, 3000);
    } else {
      setIsRecording(false);
      console.log('Recording stopped');
    }
  };

  // Helper function to check if metadata has audioUrl
  const hasAudioUrl = (metadata: any): metadata is { audioUrl: string } => {
    return (
      metadata &&
      typeof metadata === 'object' &&
      !Array.isArray(metadata) &&
      'audioUrl' in metadata
    );
  };

  return (
    <div className="voice-chat-container">
      <div className="voice-controls">
        <button 
          onClick={toggleVoiceMode}
          className={`voice-mode-toggle ${isVoiceMode ? 'active' : ''}`}
        >
          {isVoiceMode ? '🔊 Voice Mode ON' : '🔇 Voice Mode OFF'}
        </button>
      </div>

      <div className="messages-container">
        {messages.map((message) => (
          <div 
            key={message.id} 
            className={`message ${message.role}`}
          >
            <div className="message-content">
              {message.content}
            </div>
            {hasAudioUrl(message.metadata) && (
              <button 
                onClick={() => {
                  if (hasAudioUrl(message.metadata)) {
                    playAudio(message.metadata.audioUrl);
                  }
                }}
                className="replay-audio"
              >
                🔊 Replay
              </button>
            )}
          </div>
        ))}
      </div>

      {isVoiceMode && (
        <div className="voice-input">
          <button 
            onClick={handleRecordingToggle}
            className={`record-button ${isRecording ? 'recording' : ''}`}
          >
            {isRecording ? '⏹️ Stop' : '🎤 Record'}
          </button>
          {isRecording && <span className="recording-indicator">Recording...</span>}
        </div>
      )}

      {/* Regular text input as fallback */}
      <form 
        onSubmit={(e) => {
          e.preventDefault();
          const form = e.target as HTMLFormElement;
          const input = form.elements.namedItem('message') as HTMLInputElement;
          if (input.value.trim()) {
            sendVoiceMessage(input.value);
            input.value = '';
          }
        }}
        className="text-input-form"
      >
        <input 
          name="message"
          type="text" 
          placeholder={isVoiceMode ? "Type or speak your message..." : "Type your message..."}
        />
        <button type="submit">Send</button>
      </form>
    </div>
  );
}

// CSS styles (in your stylesheet)
const styles = `
.voice-chat-container {
  max-width: 600px;
  margin: 0 auto;
  padding: 20px;
}

.voice-controls {
  margin-bottom: 20px;
  text-align: center;
}

.voice-mode-toggle {
  padding: 10px 20px;
  font-size: 16px;
  border: 2px solid #ddd;
  border-radius: 25px;
  background: white;
  cursor: pointer;
  transition: all 0.3s;
}

.voice-mode-toggle.active {
  background: #4CAF50;
  color: white;
  border-color: #4CAF50;
}

.messages-container {
  height: 400px;
  overflow-y: auto;
  border: 1px solid #ddd;
  border-radius: 10px;
  padding: 20px;
  margin-bottom: 20px;
}

.message {
  margin-bottom: 15px;
  padding: 10px;
  border-radius: 10px;
}

.message.user {
  background: #e3f2fd;
  text-align: right;
}

.message.assistant {
  background: #f5f5f5;
}

.replay-audio {
  margin-top: 5px;
  padding: 5px 10px;
  font-size: 12px;
  border: 1px solid #ddd;
  border-radius: 15px;
  background: white;
  cursor: pointer;
}

.voice-input {
  text-align: center;
  margin-bottom: 20px;
}

.record-button {
  width: 80px;
  height: 80px;
  border-radius: 50%;
  border: 3px solid #2196F3;
  background: white;
  font-size: 24px;
  cursor: pointer;
  transition: all 0.3s;
}

.record-button.recording {
  background: #f44336;
  color: white;
  border-color: #f44336;
  animation: pulse 1.5s infinite;
}

@keyframes pulse {
  0% { transform: scale(1); }
  50% { transform: scale(1.1); }
  100% { transform: scale(1); }
}

.recording-indicator {
  display: inline-block;
  margin-left: 15px;
  color: #f44336;
  font-weight: bold;
}

.text-input-form {
  display: flex;
  gap: 10px;
}

.text-input-form input {
  flex: 1;
  padding: 10px;
  border: 1px solid #ddd;
  border-radius: 20px;
  font-size: 16px;
}

.text-input-form button {
  padding: 10px 20px;
  border: none;
  border-radius: 20px;
  background: #2196F3;
  color: white;
  cursor: pointer;
}
`; 