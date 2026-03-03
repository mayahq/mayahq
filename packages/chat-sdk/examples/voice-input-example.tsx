import React, { useState, useEffect } from 'react';
import { sendMessage } from '../src/sendMessage';

// Web Speech API types
interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string;
}

// Check for browser support
const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

export function VoiceInputExample() {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [recognition, setRecognition] = useState<any>(null);

  useEffect(() => {
    if (!SpeechRecognition) {
      console.error('Speech recognition not supported in this browser');
      return;
    }

    const recognitionInstance = new SpeechRecognition();
    recognitionInstance.continuous = false;
    recognitionInstance.interimResults = true;
    recognitionInstance.lang = 'en-US';

    recognitionInstance.onresult = (event: SpeechRecognitionEvent) => {
      const transcript = Array.from(event.results)
        .map(result => result[0])
        .map(result => result.transcript)
        .join('');
      
      setTranscript(transcript);
    };

    recognitionInstance.onerror = (event: SpeechRecognitionErrorEvent) => {
      console.error('Speech recognition error:', event.error);
      setIsListening(false);
    };

    recognitionInstance.onend = () => {
      setIsListening(false);
    };

    setRecognition(recognitionInstance);
  }, []);

  const startListening = () => {
    if (recognition && !isListening) {
      recognition.start();
      setIsListening(true);
      setTranscript('');
    }
  };

  const stopListening = () => {
    if (recognition && isListening) {
      recognition.stop();
      setIsListening(false);
    }
  };

  const sendVoiceMessage = async () => {
    if (!transcript.trim()) return;

    try {
      const result = await sendMessage({
        roomId: 'voice-room',
        userId: 'user-123',
        content: transcript,
        voiceMode: true, // Enable TTS for Maya's response
      });

      if (result.error) {
        console.error('Error sending message:', result.error);
      } else {
        setTranscript(''); // Clear transcript after sending
      }
    } catch (error) {
      console.error('Error sending voice message:', error);
    }
  };

  if (!SpeechRecognition) {
    return <div>Speech recognition is not supported in your browser.</div>;
  }

  return (
    <div className="voice-input-container">
      <button
        onClick={isListening ? stopListening : startListening}
        className={`voice-button ${isListening ? 'listening' : ''}`}
      >
        {isListening ? '🔴 Stop' : '🎤 Start Voice Input'}
      </button>
      
      {transcript && (
        <div className="transcript-container">
          <p>{transcript}</p>
          <button onClick={sendVoiceMessage}>Send to Maya</button>
        </div>
      )}
      
      {isListening && (
        <div className="listening-indicator">
          Listening...
        </div>
      )}
    </div>
  );
} 