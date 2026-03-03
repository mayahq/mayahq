import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  TouchableOpacity,
  Text,
  StyleSheet,
  Alert,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Voice from '@react-native-voice/voice';
import { Audio } from 'expo-av';
import { sendMessage } from '@mayahq/chat-sdk';

interface VoiceModeProps {
  roomId: string;
  userId: string;
  onMessageSent?: (message: any) => void;
  onNewAssistantMessage?: (message: any) => void;
}

export function VoiceMode({ roomId, userId, onMessageSent, onNewAssistantMessage }: VoiceModeProps) {
  const [isVoiceMode, setIsVoiceMode] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const audioRef = useRef<Audio.Sound | null>(null);

  useEffect(() => {
    // Set up voice recognition handlers
    Voice.onSpeechStart = onSpeechStart;
    Voice.onSpeechEnd = onSpeechEnd;
    Voice.onSpeechResults = onSpeechResults;
    Voice.onSpeechError = onSpeechError;
    Voice.onSpeechPartialResults = onSpeechPartialResults;

    // Request audio permissions
    Audio.requestPermissionsAsync();

    return () => {
      // Clean up
      Voice.destroy().then(Voice.removeAllListeners);
      if (audioRef.current) {
        audioRef.current.unloadAsync();
      }
    };
  }, []);

  const onSpeechStart = () => {
    console.log('Speech recognition started');
  };

  const onSpeechEnd = () => {
    console.log('Speech recognition ended');
    setIsListening(false);
  };

  const onSpeechError = (error: any) => {
    console.error('Speech recognition error:', error);
    setIsListening(false);
    Alert.alert('Voice Error', 'Failed to recognize speech. Please try again.');
  };

  const onSpeechResults = (event: any) => {
    const text = event.value?.[0] || '';
    setTranscript(text);
    if (text.trim()) {
      sendVoiceMessage(text);
    }
  };

  const onSpeechPartialResults = (event: any) => {
    const text = event.value?.[0] || '';
    setTranscript(text);
  };

  const toggleVoiceMode = () => {
    const newMode = !isVoiceMode;
    setIsVoiceMode(newMode);
    
    if (!newMode && isListening) {
      stopListening();
    }
  };

  const startListening = async () => {
    try {
      setIsListening(true);
      setTranscript('');
      await Voice.start('en-US');
    } catch (error) {
      console.error('Error starting voice recognition:', error);
      setIsListening(false);
      Alert.alert('Voice Error', 'Failed to start voice recognition');
    }
  };

  const stopListening = async () => {
    try {
      await Voice.stop();
      setIsListening(false);
    } catch (error) {
      console.error('Error stopping voice recognition:', error);
    }
  };

  const sendVoiceMessage = async (text: string) => {
    try {
      setIsProcessing(true);
      setTranscript('');

      // Send message with voice mode enabled
      const result = await sendMessage({
        roomId,
        userId,
        content: text,
        voiceMode: true, // Enable TTS for Maya's response
      });

      if (result.error) {
        throw new Error(result.error.message || 'Failed to send message');
      }

      onMessageSent?.(result.message);

      // In voice mode, we'll automatically play Maya's response
      // This will be handled by message listener

    } catch (error) {
      console.error('Error sending voice message:', error);
      Alert.alert('Error', 'Failed to send message. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  const playAudio = async (audioUrl: string) => {
    try {
      // Stop any currently playing audio
      if (audioRef.current) {
        await audioRef.current.unloadAsync();
      }

      // Create and play new audio
      const { sound } = await Audio.Sound.createAsync(
        { uri: audioUrl },
        { shouldPlay: true }
      );

      audioRef.current = sound;

      // Clean up when audio finishes
      sound.setOnPlaybackStatusUpdate((status) => {
        if (status.isLoaded && status.didJustFinish) {
          sound.unloadAsync();
          audioRef.current = null;
        }
      });

    } catch (error) {
      console.error('Error playing audio:', error);
      Alert.alert('Audio Error', 'Failed to play audio response');
    }
  };

  // Auto-play assistant messages in voice mode
  useEffect(() => {
    if (isVoiceMode && onNewAssistantMessage) {
      const handleNewMessage = (message: any) => {
        if (message.metadata?.audioUrl) {
          playAudio(message.metadata.audioUrl);
        }
      };
      
      // You'll need to implement this listener in your chat screen
      // onNewAssistantMessage should be called when a new assistant message arrives
    }
  }, [isVoiceMode, onNewAssistantMessage]);

  return (
    <View style={styles.container}>
      {/* Voice Mode Toggle */}
      <TouchableOpacity
        style={[styles.toggleButton, isVoiceMode && styles.toggleButtonActive]}
        onPress={toggleVoiceMode}
      >
        <Ionicons 
          name={isVoiceMode ? "volume-high" : "volume-mute"} 
          size={20} 
          color={isVoiceMode ? "#fff" : "#666"} 
        />
        <Text style={[styles.toggleText, isVoiceMode && styles.toggleTextActive]}>
          {isVoiceMode ? 'Voice On' : 'Voice Off'}
        </Text>
      </TouchableOpacity>

      {/* Voice Input Button */}
      {isVoiceMode && (
        <>
          <TouchableOpacity
            style={[styles.micButton, isListening && styles.micButtonActive]}
            onPress={isListening ? stopListening : startListening}
            disabled={isProcessing}
          >
            {isProcessing ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Ionicons 
                name={isListening ? "mic-off" : "mic"} 
                size={24} 
                color="#fff" 
              />
            )}
          </TouchableOpacity>

          {/* Transcript Display */}
          {transcript !== '' && (
            <View style={styles.transcriptContainer}>
              <Text style={styles.transcriptText} numberOfLines={2}>
                {transcript}
              </Text>
            </View>
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  toggleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#333',
    backgroundColor: 'transparent',
  },
  toggleButtonActive: {
    backgroundColor: '#8B5CF6',
    borderColor: '#8B5CF6',
  },
  toggleText: {
    marginLeft: 6,
    fontSize: 14,
    color: '#666',
  },
  toggleTextActive: {
    color: '#fff',
  },
  micButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#6B7280',
    alignItems: 'center',
    justifyContent: 'center',
  },
  micButtonActive: {
    backgroundColor: '#EF4444',
  },
  transcriptContainer: {
    flex: 1,
    marginLeft: 8,
  },
  transcriptText: {
    fontSize: 14,
    color: '#9CA3AF',
  },
}); 