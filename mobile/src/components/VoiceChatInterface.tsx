import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  Modal,
  ActivityIndicator,
  Image,
  Animated,
  Platform,
} from 'react-native';
import Voice from '@react-native-voice/voice';
import { Feather } from '@expo/vector-icons';
import { Message as ChatMessage } from '@mayahq/chat-sdk';
import { Audio, AVPlaybackStatus } from 'expo-av';

// API base URL - use website in development, production URL in prod
const API_BASE_URL = __DEV__
  ? 'http://192.168.1.100:3000' // Change to your local IP for dev
  : 'https://mayahq.com';

// Railway deployed API
const RAILWAY_API_URL = 'https://maya-core-production.up.railway.app';

interface VoiceChatInterfaceProps {
  roomId: string;
  userId: string;
  visible: boolean;
  onClose: () => void;
  supabaseClient: any;
  messages: ChatMessage[];
  mayaAvatar?: string;
}

// Color scheme matching ChatScreenNew
const COLORS = {
  background: '#0A0A0A',
  modalBackground: 'rgba(0, 0, 0, 0.95)',
  cardBackground: '#1E1E22',
  primary: '#9333EA',
  primaryLight: '#A855F7',
  primaryDark: '#7E22CE',
  text: '#FFFFFF',
  textSecondary: '#71717A',
  error: '#ef4444',
  success: '#10b981',
  blue: '#3B82F6',
};

type VoiceState = 'idle' | 'listening' | 'processing' | 'speaking' | 'error';

export const VoiceChatInterface: React.FC<VoiceChatInterfaceProps> = ({
  roomId,
  userId,
  visible,
  onClose,
  supabaseClient,
  messages,
  mayaAvatar,
}) => {
  const [voiceState, setVoiceState] = useState<VoiceState>('idle');
  const [transcript, setTranscript] = useState('');
  const [response, setResponse] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [silenceCountdown, setSilenceCountdown] = useState<number | null>(null);

  // Animated values
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const pulseAnim = useRef(new Animated.Value(0)).current;

  // Refs
  const soundRef = useRef<Audio.Sound | null>(null);
  const silenceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const finalTranscriptRef = useRef<string>('');
  const conversationHistoryRef = useRef<{ role: 'user' | 'assistant', content: string }[]>([]);
  const isProcessingRef = useRef(false);

  // Initialize audio and voice recognition
  useEffect(() => {
    if (!visible) return;

    const setup = async () => {
      try {
        // Configure audio session for iOS
        await Audio.setAudioModeAsync({
          playsInSilentModeIOS: true,
          staysActiveInBackground: false,
          shouldDuckAndroid: true,
        });

        // Voice recognition event handlers
        Voice.onSpeechStart = () => {
          console.log('[Voice] Speech started');
        };

        Voice.onSpeechEnd = () => {
          console.log('[Voice] Speech ended');
        };

        Voice.onSpeechResults = (e: any) => {
          const text = e.value?.[0] || '';
          setTranscript(text);
          finalTranscriptRef.current = text;
        };

        Voice.onSpeechPartialResults = (e: any) => {
          const text = e.value?.[0] || '';
          setTranscript(text);
          finalTranscriptRef.current = text;
          resetSilenceTimer();
        };

        Voice.onSpeechError = (e: any) => {
          console.error('[Voice] Speech error:', e);
          if (e.error?.code !== '5') { // Ignore "client side" errors
            setError('Speech recognition error');
            setVoiceState('error');
          }
        };

      } catch (err) {
        console.error('[Voice] Setup error:', err);
      }
    };

    setup();

    return () => {
      cleanup();
    };
  }, [visible]);

  const cleanup = useCallback(async () => {
    try {
      Voice.destroy();
      clearTimers();
      if (soundRef.current) {
        await soundRef.current.unloadAsync();
        soundRef.current = null;
      }
    } catch (err) {
      console.error('[Voice] Cleanup error:', err);
    }
  }, []);

  const clearTimers = useCallback(() => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
    setSilenceCountdown(null);
  }, []);

  const resetSilenceTimer = useCallback(() => {
    clearTimers();

    // Start countdown
    let countdown = 2;
    setSilenceCountdown(countdown);

    countdownIntervalRef.current = setInterval(() => {
      countdown--;
      if (countdown > 0) {
        setSilenceCountdown(countdown);
      } else {
        clearTimers();
      }
    }, 1000);

    // Auto-send after 2 seconds of silence
    silenceTimerRef.current = setTimeout(() => {
      stopListening();
    }, 2000);
  }, []);

  const startListening = useCallback(async () => {
    if (voiceState === 'listening' || isProcessingRef.current) return;

    try {
      setError(null);
      setTranscript('');
      setVoiceState('listening');

      await Voice.start('en-US');

      // Start pulse animation
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 800,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 0,
            duration: 800,
            useNativeDriver: true,
          }),
        ])
      ).start();

    } catch (err) {
      console.error('[Voice] Error starting:', err);
      setError('Failed to start voice recognition');
      setVoiceState('error');
    }
  }, [voiceState, pulseAnim]);

  const stopListening = useCallback(async () => {
    const messageToSend = finalTranscriptRef.current.trim();

    try {
      await Voice.stop();
      clearTimers();
      pulseAnim.stopAnimation();
      pulseAnim.setValue(0);

      if (messageToSend && !isProcessingRef.current) {
        processMessage(messageToSend);
      } else {
        setVoiceState('idle');
      }
    } catch (err) {
      console.error('[Voice] Error stopping:', err);
      setVoiceState('idle');
    }
  }, []);

  const processMessage = useCallback(async (userText: string) => {
    if (isProcessingRef.current) return;
    isProcessingRef.current = true;

    setVoiceState('processing');
    setTranscript('');

    try {
      console.log('[Voice] Processing:', userText);

      // Add user message to conversation history
      conversationHistoryRef.current.push({ role: 'user', content: userText });

      // Call the voice API to get Maya's response
      const response = await fetch(`${RAILWAY_API_URL}/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: userText,
          userId,
          roomId,
          sessionId: 'voice_mobile',
        }),
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const data = await response.json();
      const mayaText = data.response || data.content || '';

      console.log('[Voice] Maya response:', mayaText.substring(0, 50));
      setResponse(mayaText);

      // Add Maya's response to history
      conversationHistoryRef.current.push({ role: 'assistant', content: mayaText });

      // Keep only last 10 messages
      if (conversationHistoryRef.current.length > 10) {
        conversationHistoryRef.current = conversationHistoryRef.current.slice(-10);
      }

      // Generate and play TTS audio
      await generateAndPlayAudio(mayaText);

    } catch (err) {
      console.error('[Voice] Error processing:', err);
      setError('Failed to get response');
      setVoiceState('error');
    } finally {
      isProcessingRef.current = false;
    }
  }, [userId, roomId]);

  const generateAndPlayAudio = useCallback(async (text: string) => {
    setVoiceState('speaking');

    // Start speaking animation
    Animated.loop(
      Animated.sequence([
        Animated.timing(scaleAnim, {
          toValue: 1.08,
          duration: 600,
          useNativeDriver: true,
        }),
        Animated.timing(scaleAnim, {
          toValue: 1,
          duration: 600,
          useNativeDriver: true,
        }),
      ])
    ).start();

    try {
      // Call TTS API - returns raw audio data
      const ttsResponse = await fetch(`${RAILWAY_API_URL}/tts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });

      if (!ttsResponse.ok) {
        // Fallback: just show text, no audio
        console.log('[Voice] TTS not available, showing text only');
        await new Promise(resolve => setTimeout(resolve, 2000));
        scaleAnim.stopAnimation();
        scaleAnim.setValue(1);
        setVoiceState('idle');
        return;
      }

      // Check content type
      const contentType = ttsResponse.headers.get('content-type') || 'audio/wav';

      // Get audio as blob
      const audioBlob = await ttsResponse.blob();

      if (!audioBlob || audioBlob.size === 0) {
        throw new Error('No audio data received');
      }

      console.log('[Voice] Audio received, size:', audioBlob.size, 'type:', contentType);

      // Convert blob to base64 for expo-av
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve, reject) => {
        reader.onload = () => {
          const dataUrl = reader.result as string;
          resolve(dataUrl);
        };
        reader.onerror = reject;
        reader.readAsDataURL(audioBlob);
      });

      const audioUri = await base64Promise;

      // Unload previous sound
      if (soundRef.current) {
        await soundRef.current.unloadAsync();
        soundRef.current = null;
      }

      // Create and play audio
      const { sound } = await Audio.Sound.createAsync(
        { uri: audioUri },
        { shouldPlay: true }
      );

      soundRef.current = sound;

      // Handle playback completion
      sound.setOnPlaybackStatusUpdate((status: AVPlaybackStatus) => {
        if (status.isLoaded && status.didJustFinish) {
          console.log('[Voice] Audio finished');
          scaleAnim.stopAnimation();
          scaleAnim.setValue(1);
          setVoiceState('idle');
          setResponse('');
        }
      });

    } catch (err) {
      console.error('[Voice] TTS error:', err);
      // Don't show error, just go back to idle
      scaleAnim.stopAnimation();
      scaleAnim.setValue(1);
      setVoiceState('idle');
    }
  }, [scaleAnim]);

  const handleInterrupt = useCallback(async () => {
    try {
      if (soundRef.current) {
        await soundRef.current.stopAsync();
        await soundRef.current.unloadAsync();
        soundRef.current = null;
      }
      scaleAnim.stopAnimation();
      scaleAnim.setValue(1);
      setVoiceState('idle');
      setResponse('');
    } catch (err) {
      console.error('[Voice] Interrupt error:', err);
    }
  }, [scaleAnim]);

  const handleClose = useCallback(async () => {
    await cleanup();
    onClose();
  }, [cleanup, onClose]);

  const getStatusText = (): string => {
    switch (voiceState) {
      case 'idle': return 'Tap to speak';
      case 'listening': return silenceCountdown ? `Listening... (${silenceCountdown})` : 'Listening...';
      case 'processing': return 'Maya is thinking...';
      case 'speaking': return 'Maya is speaking...';
      case 'error': return error || 'Error occurred';
      default: return '';
    }
  };

  const getAvatarBorderColor = (): string => {
    switch (voiceState) {
      case 'listening': return COLORS.blue;
      case 'processing': return COLORS.primary;
      case 'speaking': return COLORS.success;
      case 'error': return COLORS.error;
      default: return COLORS.primaryDark;
    }
  };

  const pulseScale = pulseAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.3],
  });

  const pulseOpacity = pulseAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.6, 0],
  });

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleClose}
    >
      <View style={styles.container}>
        <View style={styles.card}>
          {/* Close button */}
          <TouchableOpacity style={styles.closeButton} onPress={handleClose}>
            <Feather name="x" size={24} color={COLORS.textSecondary} />
          </TouchableOpacity>

          {/* Maya Avatar */}
          <View style={styles.avatarContainer}>
            {/* Pulse animation ring */}
            {voiceState === 'listening' && (
              <Animated.View
                style={[
                  styles.pulseRing,
                  {
                    transform: [{ scale: pulseScale }],
                    opacity: pulseOpacity,
                    borderColor: COLORS.blue,
                  },
                ]}
              />
            )}

            <Animated.View
              style={[
                styles.avatarWrapper,
                {
                  transform: [{ scale: scaleAnim }],
                  borderColor: getAvatarBorderColor(),
                },
              ]}
            >
              {mayaAvatar ? (
                <Image source={{ uri: mayaAvatar }} style={styles.avatar} />
              ) : (
                <View style={styles.avatarPlaceholder}>
                  <Text style={styles.avatarText}>M</Text>
                </View>
              )}
            </Animated.View>
          </View>

          {/* Status Text */}
          <Text style={[
            styles.statusText,
            voiceState === 'error' && styles.errorText,
          ]}>
            {getStatusText()}
          </Text>

          {/* Transcript or Response */}
          {(transcript || response) && (
            <View style={styles.textContainer}>
              <Text style={styles.transcriptText}>
                {voiceState === 'speaking' ? response : transcript}
              </Text>
            </View>
          )}

          {/* Control Button */}
          <TouchableOpacity
            style={[
              styles.micButton,
              voiceState === 'listening' && styles.micButtonActive,
              voiceState === 'speaking' && styles.micButtonSpeaking,
              voiceState === 'processing' && styles.micButtonProcessing,
            ]}
            onPress={() => {
              if (voiceState === 'idle' || voiceState === 'error') {
                startListening();
              } else if (voiceState === 'listening') {
                stopListening();
              } else if (voiceState === 'speaking') {
                handleInterrupt();
              }
            }}
            disabled={voiceState === 'processing'}
          >
            {voiceState === 'processing' ? (
              <ActivityIndicator size="large" color="#FFF" />
            ) : voiceState === 'speaking' ? (
              <Feather name="stop-circle" size={32} color="#FFF" />
            ) : (
              <Feather
                name={voiceState === 'listening' ? 'mic-off' : 'mic'}
                size={32}
                color="#FFF"
              />
            )}
          </TouchableOpacity>

          {/* Instructions */}
          <Text style={styles.instructions}>
            {voiceState === 'speaking'
              ? 'Tap to interrupt'
              : voiceState === 'listening'
              ? 'Tap to stop or wait for silence'
              : 'Tap the mic to start speaking'}
          </Text>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.modalBackground,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  card: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: COLORS.cardBackground,
    borderRadius: 24,
    padding: 32,
    alignItems: 'center',
  },
  closeButton: {
    position: 'absolute',
    top: 16,
    right: 16,
    padding: 8,
  },
  avatarContainer: {
    position: 'relative',
    marginBottom: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pulseRing: {
    position: 'absolute',
    width: 140,
    height: 140,
    borderRadius: 70,
    borderWidth: 3,
  },
  avatarWrapper: {
    width: 128,
    height: 128,
    borderRadius: 64,
    borderWidth: 4,
    overflow: 'hidden',
  },
  avatar: {
    width: '100%',
    height: '100%',
  },
  avatarPlaceholder: {
    width: '100%',
    height: '100%',
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: 48,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  statusText: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 16,
  },
  errorText: {
    color: COLORS.error,
  },
  textContainer: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
    width: '100%',
    maxHeight: 100,
  },
  transcriptText: {
    fontSize: 15,
    color: COLORS.textSecondary,
    textAlign: 'center',
  },
  micButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  micButtonActive: {
    backgroundColor: COLORS.blue,
  },
  micButtonSpeaking: {
    backgroundColor: COLORS.success,
  },
  micButtonProcessing: {
    backgroundColor: COLORS.textSecondary,
  },
  instructions: {
    fontSize: 13,
    color: COLORS.textSecondary,
    textAlign: 'center',
  },
});
