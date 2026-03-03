import React, { useState } from 'react'
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  Image,
  Alert,
  ImageSourcePropType
} from 'react-native'
import { useAuthContext } from '../auth/AuthProvider'
import { SafeAreaView } from 'react-native-safe-area-context'

// Try different possible paths for the icon
let appIcon: ImageSourcePropType | null = null;
try {
  // Try various paths that might work
  appIcon = require('../../assets/icon.png');
} catch (e) {
  try {
    appIcon = require('../../../assets/icon.png');
  } catch (e) {
    try {
      appIcon = require('../../../mobile/assets/icon.png');
    } catch (e) {
      // Fallback to null if all paths fail
      console.warn('Could not load icon image, using placeholder');
      appIcon = null;
    }
  }
}

export default function LoginScreen() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isSignUp, setIsSignUp] = useState(false)
  const [iconError, setIconError] = useState(false);
  const { signInWithEmail, signUpWithEmail } = useAuthContext()

  const handleAuth = async () => {
    if (!email) {
      Alert.alert('Error', 'Please enter your email address')
      return
    }

    if (!password) {
      Alert.alert('Error', 'Please enter your password')
      return
    }

    try {
      setIsLoading(true)
      if (isSignUp) {
        await signUpWithEmail(email, password)
        Alert.alert(
          'Account Created',
          'Your account has been created successfully. Please log in.'
        )
        setIsSignUp(false)
      } else {
        await signInWithEmail(email, password)
      }
    } catch (error: any) {
      Alert.alert('Error', error.message || 'An error occurred during authentication')
      console.error('Authentication error:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const toggleMode = () => {
    setIsSignUp(!isSignUp)
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={styles.logoContainer}>
          {/* Use a wrapper to create rounded corners and shadow */}
          <View style={styles.logoWrapper}>
            {appIcon && !iconError ? (
              <Image 
                source={appIcon}
                style={styles.logoImage}
                resizeMode="contain"
                onError={() => setIconError(true)}
              />
            ) : (
              <View style={styles.logoPlaceholder}>
                <Text style={styles.logoPlaceholderText}>M</Text>
              </View>
            )}
          </View>
          <Text style={styles.logoText}>Maya</Text>
          <Text style={styles.subtitle}>Your AI Assistant</Text>
        </View>

        <View style={styles.formContainer}>
          <Text style={styles.formTitle}>{isSignUp ? 'Create Account' : 'Sign In'}</Text>
          
          <TextInput
            style={styles.input}
            placeholder="Email"
            placeholderTextColor="rgba(255,255,255,0.5)"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            editable={!isLoading}
          />

          <TextInput
            style={styles.input}
            placeholder="Password"
            placeholderTextColor="rgba(255,255,255,0.5)"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            editable={!isLoading}
          />

          <TouchableOpacity
            style={[styles.button, isLoading && styles.buttonDisabled]}
            onPress={handleAuth}
            disabled={isLoading}
          >
            <Text style={styles.buttonText}>
              {isLoading ? 'Processing...' : isSignUp ? 'Sign Up' : 'Sign In'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.toggleButton}
            onPress={toggleMode}
            disabled={isLoading}
          >
            <Text style={styles.toggleButtonText}>
              {isSignUp ? 'Already have an account? Sign In' : 'Need an account? Sign Up'}
            </Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#1a1a2e',
  },
  container: {
    flex: 1,
    padding: 20,
    justifyContent: 'center',
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: 40,
  },
  logoWrapper: {
    width: 120,
    height: 120,
    borderRadius: 30,
    overflow: 'hidden',
    marginBottom: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
    backgroundColor: '#6a26cd',
  },
  logoImage: {
    width: '100%',
    height: '100%',
  },
  logoPlaceholder: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoPlaceholderText: {
    fontSize: 60,
    fontWeight: 'bold',
    color: 'white',
  },
  logoText: {
    fontSize: 42,
    fontWeight: 'bold',
    color: '#6a26cd',
  },
  subtitle: {
    fontSize: 18,
    color: '#a4a4ca',
    marginTop: 8,
  },
  formContainer: {
    alignItems: 'center',
    width: '100%',
  },
  formTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 20,
    color: '#ffffff',
    textAlign: 'center',
  },
  input: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 8,
    padding: 16,
    fontSize: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#6a26cd',
    color: 'white',
    width: '100%',
  },
  button: {
    backgroundColor: '#6a26cd',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    width: '100%',
    marginTop: 10,
  },
  buttonDisabled: {
    backgroundColor: 'rgba(106, 38, 205, 0.5)',
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  toggleButton: {
    marginTop: 16,
    alignItems: 'center',
  },
  toggleButtonText: {
    color: '#a4a4ca',
    fontSize: 14,
  },
}) 