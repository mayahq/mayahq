import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import Constants from 'expo-constants'; 

// IMPORTANT: Replace this with your DEPLOYED Supabase Edge Function URL for register-push-token
const REGISTER_TOKEN_ENDPOINT = 'https://dlaczmexhnoxfggpzxkl.supabase.co/functions/v1/register-push-token';

/**
 * Registers the app for push notifications and sends the token to the backend.
 * @param supabaseAccessToken The user's Supabase JWT for authenticating the backend request.
 * @param userId The Supabase Auth User ID.
 * @returns The ExpoPushToken string if successful, or null.
 */
export async function registerForPushNotificationsAsync(
  supabaseAccessToken: string,
  userId: string // We get this from the user object after login
): Promise<string | null> {
  let expoPushToken;

  if (Platform.OS === 'android') {
    try {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#FF231F7C',
      });
    } catch (e) {
      console.error('Failed to set notification channel for Android:', e);
    }
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    try {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    } catch (e) {
      console.error('Error requesting notification permissions:', e);
      alert('Failed to request notification permissions. Please enable them in settings if you want notifications.');
      return null;
    }
  }

  if (finalStatus !== 'granted') {
    alert('Push notification permission not granted. You can enable notifications in your device settings.');
    console.log('Push notification permission not granted.');
    return null;
  }

  try {
    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    if (!projectId) {
      console.warn(
        "No EAS projectId found in app.json/app.config.js (expo.extra.eas.projectId), needed for Notifications.getExpoPushTokenAsync(). " +
        "Ensure this is set if using EAS Build, or notifications might not work correctly."
      );
      // For local dev with Expo Go, getExpoPushTokenAsync might work without it, but it's best practice for builds.
    }
    expoPushToken = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
    console.log('Received Expo Push Token:', expoPushToken);
  } catch (e: any) {
    console.error('Failed to get Expo Push Token:', e.message);
    // alert(`Failed to get push token for notification: ${e.message}`);
    return null;
  }

  if (expoPushToken) {
    try {
      console.log(`Registering token with backend: ${REGISTER_TOKEN_ENDPOINT} for user ${userId}`);
      const response = await fetch(REGISTER_TOKEN_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseAccessToken}`, 
        },
        body: JSON.stringify({
          token: expoPushToken,
          platform: Platform.OS, // 'ios' or 'android' (or 'web' if applicable)
          // userId is implicitly handled by the Edge Function via JWT
        }),
      });

      const responseBody = await response.json();
      if (!response.ok) {
        console.error('Failed to register push token with backend:', response.status, responseBody);
        // alert(`Failed to register push token: ${responseBody.error || response.statusText}`);
      } else {
        console.log('Push token registered with backend successfully:', responseBody);
      }
    } catch (error: any) {
      console.error('Error sending push token to backend:', error.message);
      // alert('Error sending push token to server.');
    }
  }
  return expoPushToken || null;
}

// Store navigation reference globally so we can access it from notification handlers
let navigationRef: any = null;

export function setNavigationRef(ref: any) {
  navigationRef = ref;
}

export function setupNotificationHandlers(navigation?: any) {
  // Use provided navigation or fallback to stored ref
  const nav = navigation || navigationRef;

  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
    }),
  });

  const notificationListener = Notifications.addNotificationReceivedListener((notification: Notifications.Notification) => {
    console.log('📬 Notification received while app in foreground:', notification.request.content);
    // Could update badge count or show in-app notification here
  });

  const responseListener = Notifications.addNotificationResponseReceivedListener((response: Notifications.NotificationResponse) => {
    console.log('📬 User tapped notification:', response.notification.request.content);
    const notificationData = response.notification.request.content.data as {
      type?: string;
      screen?: string;
      roomId?: string;
      imageUrl?: string;
      params?: any;
    };
    console.log('📬 Notification data:', notificationData);

    // Navigate to the appropriate screen based on notification data
    const currentNav = navigation || navigationRef;
    if (currentNav && notificationData) {
      // Handle Maya daily image notifications - go to Chat
      if (notificationData.type === 'maya_daily_image' || notificationData.screen === 'Chat') {
        console.log('📬 Navigating to Chat screen...');
        try {
          currentNav.navigate('Chat', {
            roomId: notificationData.roomId,
            focusImage: notificationData.imageUrl
          });
        } catch (e) {
          console.error('📬 Navigation error:', e);
          // Fallback: try without params
          try {
            currentNav.navigate('Chat');
          } catch (e2) {
            console.error('📬 Fallback navigation error:', e2);
          }
        }
      } else if (notificationData.screen) {
        // Generic screen navigation
        console.log(`📬 Navigating to ${notificationData.screen}...`);
        try {
          currentNav.navigate(notificationData.screen, notificationData.params || {});
        } catch (e) {
          console.error('📬 Navigation error:', e);
        }
      }
    } else {
      console.log('📬 No navigation ref available or no notification data');
    }
  });

  return () => {
    Notifications.removeNotificationSubscription(notificationListener);
    Notifications.removeNotificationSubscription(responseListener);
  };
} 