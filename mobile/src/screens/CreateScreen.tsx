import React from 'react'
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'

export default function CreateScreen({ navigation }: any) {
  const handleSnapToPrompt = () => {
    navigation.navigate('CameraScreen')
  }

  const handleSceneGeneration = () => {
    navigation.navigate('SceneGenerationScreen')
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>Create</Text>
        <Text style={styles.subtitle}>What would you like to create today?</Text>

        <TouchableOpacity style={styles.primaryButton} onPress={handleSceneGeneration}>
          <View style={styles.buttonIcon}>
            <Ionicons name="sparkles" size={24} color="#fff" />
          </View>
          <View style={styles.buttonContent}>
            <Text style={styles.primaryButtonText}>Generate Maya in Scene</Text>
            <Text style={styles.buttonDescription}>Take or upload a photo and Maya will appear in it</Text>
          </View>
          <Ionicons name="chevron-forward" size={24} color="#fff" />
        </TouchableOpacity>

        <TouchableOpacity style={styles.secondaryButton} onPress={handleSnapToPrompt}>
          <View style={styles.buttonIcon}>
            <Ionicons name="camera" size={24} color="#A855F7" />
          </View>
          <View style={styles.buttonContent}>
            <Text style={styles.secondaryButtonText}>Snap-to-Prompt Studio</Text>
            <Text style={styles.buttonDescriptionSecondary}>Analyze images and generate prompts</Text>
          </View>
          <Ionicons name="chevron-forward" size={24} color="#6B7280" />
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#111827',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: '#9CA3AF',
    textAlign: 'center',
    marginBottom: 40,
  },
  primaryButton: {
    backgroundColor: '#A855F7',
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 16,
    marginBottom: 16,
  },
  secondaryButton: {
    backgroundColor: '#1F2937',
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#374151',
    marginBottom: 16,
  },
  buttonIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  buttonContent: {
    flex: 1,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '600',
    marginBottom: 4,
  },
  secondaryButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '600',
    marginBottom: 4,
  },
  buttonDescription: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 13,
  },
  buttonDescriptionSecondary: {
    color: '#6B7280',
    fontSize: 13,
  },
}) 