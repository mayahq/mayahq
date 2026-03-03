import React, { useEffect, useState, useContext } from 'react'
import { StatusBar } from 'expo-status-bar'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { AuthProvider, useAuthContext } from './src/auth/AuthProvider'
import Navigation from './src/navigation'
import 'react-native-gesture-handler'
import * as SplashScreen from 'expo-splash-screen'
import { Alert, Platform } from 'react-native'
import * as Updates from 'expo-updates'
import {
  registerForPushNotificationsAsync,
  setupNotificationHandlers,
  setNavigationRef,
} from './src/services/notificationService'
import { navigationRef } from './src/navigation'

// Prevent the splash screen from auto-hiding until we're ready
SplashScreen.preventAutoHideAsync().catch(() => {
  /* reloading the app might trigger some race conditions, ignore them */
});

// Main App component that now includes Auth-dependent notification registration
function AppContent() {
  // Use the correctly imported auth hook
  const authState = useAuthContext()
  const user = authState?.user
  const session = authState?.session
  
  const [appIsReady, setAppIsReady] = useState(false)

  // Check for updates
  useEffect(() => {
    async function checkForUpdates() {
      try {
        console.log('[UPDATES] Checking for updates...')
        console.log('[UPDATES] Channel:', Updates.channel)
        console.log('[UPDATES] Runtime version:', Updates.runtimeVersion)
        
        const update = await Updates.checkForUpdateAsync()
        console.log('[UPDATES] Update check result:', update)
        
        if (update.isAvailable) {
          console.log('[UPDATES] Update available, downloading...')
          await Updates.fetchUpdateAsync()
          console.log('[UPDATES] Update downloaded, restarting...')
          
          Alert.alert(
            'Update Available',
            'Restarting to apply new updates...',
            [{ text: 'OK', onPress: () => Updates.reloadAsync() }]
          )
        } else {
          console.log('[UPDATES] No updates available')
        }
      } catch (error) {
        console.error('[UPDATES] Error:', error)
      }
    }
    
    // Only run in production mode
    if (!__DEV__) {
      checkForUpdates()
    }
  }, [])

  // Handle app initialization and splash screen
  useEffect(() => {
    async function prepare() {
      try {
        // Add any initialization logic here (e.g., loading fonts, data, etc.)
        
        // Simple delay to show the splash screen briefly
        await new Promise(resolve => setTimeout(resolve, 1000))
        
        // Hide the splash screen and mark app as ready
        await SplashScreen.hideAsync()
        setAppIsReady(true)
      } catch (e) {
        console.warn('Error during app preparation:', e)
        // Make sure we hide the splash screen even if there's an error
        await SplashScreen.hideAsync()
        setAppIsReady(true)
      }
    }

    prepare()
  }, [])

  // Setup notification handlers once when the app content mounts
  useEffect(() => {
    // Set the navigation ref for use in notification handlers
    setNavigationRef(navigationRef)
    const cleanupNotificationHandlers = setupNotificationHandlers(navigationRef)
    return () => cleanupNotificationHandlers() // Cleanup on unmount
  }, [])

  // Register for push notifications when user is authenticated
  useEffect(() => {
    if (user && session?.access_token) {
      console.log('User authenticated, attempting to register for push notifications...', { userId: user.id })
      registerForPushNotificationsAsync(session.access_token, user.id)
        .then(token => {
          if (token) {
            console.log('Push notification registration process completed with token:', token.substring(0,15) + "...")
          } else {
            console.log('Push notification registration process completed, no token obtained or registered.')
          }
        })
        .catch(error => {
          console.error('Error during push notification registration process:', error)
        })
    } else {
      console.log('User not authenticated yet or session missing, skipping push notification registration.')
    }
    // Re-run if user or session changes (e.g., on login/logout)
  }, [user, session])

  // Show nothing until the app is ready to prevent flickering
  if (!appIsReady) {
    return null
  }

  return (
    <>
      <Navigation />
      <StatusBar style="light" />
    </>
  )
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </SafeAreaProvider>
  )
}
