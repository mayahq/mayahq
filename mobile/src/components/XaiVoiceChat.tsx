/**
 * xAI Grok Voice Chat Component for React Native
 * Ultra-low latency speech-to-speech conversations with Maya
 */

import React, { useCallback, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  Modal,
  ActivityIndicator,
  Image,
  Animated,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useXaiVoice, VoiceState } from '../hooks/useXaiVoice';

interface XaiVoiceChatProps {
  visible: boolean;
  onClose: () => void;
  mayaAvatar?: string;
  onTranscript?: (text: string) => void;
  onResponse?: (text: string) => void;
}

const COLORS = {
  background: 'rgba(0, 0, 0, 0.95)',
  card: '#1E1E22',
  primary: '#9333EA',
  blue: '#3B82F6',
  green: '#10b981',
  yellow: '#f59e0b',
  red: '#ef4444',
  text: '#FFFFFF',
  textSecondary: '#71717A',
};

export function XaiVoiceChat({
  visible,
  onClose,
  mayaAvatar,
  onTranscript,
  onResponse,
}: XaiVoiceChatProps) {
  const {
    state,
    transcript,
    response,
    error,
    connect,
    disconnect,
    interrupt,
  } = useXaiVoice({
    onTranscript,
    onResponse,
    onError: (err) => console.error('[XaiVoiceChat] Error:', err),
  });

  // Animation
  const scaleAnim = React.useRef(new Animated.Value(1)).current;
  const pulseAnim = React.useRef(new Animated.Value(0)).current;

  // Animate based on state
  useEffect(() => {
    if (state === 'listening') {
      // Pulse animation while listening
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 0, duration: 800, useNativeDriver: true }),
        ])
      ).start();
    } else {
      pulseAnim.stopAnimation();
      pulseAnim.setValue(0);
    }

    if (state === 'speaking') {
      // Scale animation while speaking
      Animated.loop(
        Animated.sequence([
          Animated.timing(scaleAnim, { toValue: 1.08, duration: 600, useNativeDriver: true }),
          Animated.timing(scaleAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
        ])
      ).start();
    } else {
      scaleAnim.stopAnimation();
      scaleAnim.setValue(1);
    }
  }, [state]);

  const handleClose = useCallback(() => {
    disconnect();
    onClose();
  }, [disconnect, onClose]);

  const handleMainButton = useCallback(() => {
    if (state === 'idle' || state === 'error') {
      connect();
    } else if (state === 'speaking') {
      interrupt();
    } else if (state === 'connected' || state === 'listening' || state === 'thinking') {
      disconnect();
    }
  }, [state, connect, disconnect, interrupt]);

  const getStatusText = (): string => {
    switch (state) {
      case 'idle': return 'Tap to connect';
      case 'connecting': return 'Connecting to xAI...';
      case 'connected': return 'Ready - speak now!';
      case 'listening': return 'Listening...';
      case 'thinking': return 'Maya is thinking...';
      case 'speaking': return 'Maya is speaking...';
      case 'error': return error?.message || 'Connection failed';
      default: return '';
    }
  };

  const getStatusColor = (): string => {
    switch (state) {
      case 'idle': return COLORS.textSecondary;
      case 'connecting': return COLORS.yellow;
      case 'connected':
      case 'listening': return COLORS.blue;
      case 'thinking': return COLORS.primary;
      case 'speaking': return COLORS.green;
      case 'error': return COLORS.red;
      default: return COLORS.textSecondary;
    }
  };

  const getAvatarBorderColor = (): string => {
    switch (state) {
      case 'listening': return COLORS.blue;
      case 'thinking': return COLORS.primary;
      case 'speaking': return COLORS.green;
      case 'error': return COLORS.red;
      default: return COLORS.primary;
    }
  };

  const getButtonIcon = (): string => {
    switch (state) {
      case 'idle':
      case 'error': return 'phone';
      case 'connecting': return 'loader';
      case 'speaking': return 'stop-circle';
      default: return 'phone-off';
    }
  };

  const getButtonColor = (): string => {
    switch (state) {
      case 'idle':
      case 'error': return COLORS.green;
      case 'connecting': return COLORS.yellow;
      case 'speaking': return COLORS.red;
      default: return COLORS.red;
    }
  };

  const pulseScale = pulseAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.4],
  });

  const pulseOpacity = pulseAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.5, 0],
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

          {/* Title */}
          <Text style={styles.title}>xAI Voice</Text>
          <Text style={styles.subtitle}>Ultra-low latency</Text>

          {/* Maya Avatar */}
          <View style={styles.avatarContainer}>
            {/* Pulse ring */}
            {state === 'listening' && (
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

          {/* Status */}
          <Text style={[styles.status, { color: getStatusColor() }]}>
            {getStatusText()}
          </Text>

          {/* Transcript/Response */}
          {(transcript || response) && (
            <View style={styles.textBox}>
              <Text style={styles.label}>
                {state === 'speaking' || response ? 'Maya' : 'You'}
              </Text>
              <Text style={styles.textContent} numberOfLines={3}>
                {response || transcript}
              </Text>
            </View>
          )}

          {/* Main Button */}
          <TouchableOpacity
            style={[styles.mainButton, { backgroundColor: getButtonColor() }]}
            onPress={handleMainButton}
            disabled={state === 'connecting'}
          >
            {state === 'connecting' ? (
              <ActivityIndicator size="large" color="#FFF" />
            ) : (
              <Feather name={getButtonIcon() as any} size={32} color="#FFF" />
            )}
          </TouchableOpacity>

          {/* Instructions */}
          <Text style={styles.instructions}>
            {state === 'idle' || state === 'error'
              ? 'Tap to start voice chat'
              : state === 'speaking'
              ? 'Tap to interrupt'
              : state === 'connecting'
              ? 'Please wait...'
              : 'Tap to end call'}
          </Text>

          {/* Latency badge */}
          <View style={styles.badge}>
            <Feather name="zap" size={12} color={COLORS.yellow} />
            <Text style={styles.badgeText}>&lt;1s latency</Text>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  card: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: COLORS.card,
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
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginBottom: 24,
  },
  avatarContainer: {
    position: 'relative',
    marginBottom: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pulseRing: {
    position: 'absolute',
    width: 150,
    height: 150,
    borderRadius: 75,
    borderWidth: 3,
  },
  avatarWrapper: {
    width: 120,
    height: 120,
    borderRadius: 60,
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
  status: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 16,
  },
  textBox: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
    width: '100%',
  },
  label: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  textContent: {
    fontSize: 15,
    color: COLORS.text,
    lineHeight: 22,
  },
  mainButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  instructions: {
    fontSize: 13,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginBottom: 16,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    gap: 6,
  },
  badgeText: {
    fontSize: 12,
    color: COLORS.yellow,
    fontWeight: '600',
  },
});
