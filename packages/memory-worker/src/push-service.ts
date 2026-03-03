import { SupabaseClient } from '@supabase/supabase-js';
// import { Expo } from 'expo-server-sdk'; // If using expo-server-sdk directly

// Define an interface for the push token row if not already available globally
interface UserPushToken {
  user_id: string;
  token: string; // ExpoPushToken
  platform?: string; // e.g., 'ios', 'android'
  is_active?: boolean;
}

/**
 * Sends a push notification via Expo Push Notification service.
 * 
 * @param supabase The Supabase client for fetching tokens.
 * @param recipientUserId The ID of the user to send the notification to.
 * @param title The title of the push notification.
 * @param body The body/message of the push notification.
 * @param data Optional data payload to send with the notification.
 */
export async function sendExpoPushNotification(
  supabase: SupabaseClient, 
  recipientUserId: string, 
  title: string, 
  body: string, 
  data?: Record<string, any>
): Promise<void> {
  console.log(`[PushService] Attempting to send push notification to user: ${recipientUserId}`);

  // 1. Fetch push tokens for the recipient (removed is_active filter)
  const { data: tokensData, error: tokenError } = await supabase
    .from('user_push_tokens') 
    .select('token') // Only select the token column, as that's what's used
    .eq('user_id', recipientUserId);

  if (tokenError) {
    console.error('[PushService] Error fetching push tokens:', tokenError);
    return;
  }

  if (!tokensData || tokensData.length === 0) {
    console.log(`[PushService] No push tokens found for user ${recipientUserId}.`);
    return;
  }

  const expoPushTokens = tokensData.map(t => (t as UserPushToken).token).filter(Boolean);
  if (expoPushTokens.length === 0) {
    console.log(`[PushService] No valid push tokens after filtering for user ${recipientUserId}.`);
    return;
  }

  console.log(`[PushService] Found tokens: ${JSON.stringify(expoPushTokens)} for user ${recipientUserId}`);

  // 2. Construct the messages for Expo's API
  // Expo's API expects an array of messages, even if sending to one token at a time (or batched)
  const messages = [];
  for (const pushToken of expoPushTokens) {
    // Check that the token is a valid Expo push token
    // if (!Expo.isExpoPushToken(pushToken)) { // Requires expo-server-sdk
    //   console.warn(`[PushService] Token ${pushToken} is not a valid Expo push token.`);
    //   continue;
    // }
    messages.push({
      to: pushToken,
      sound: 'default',
      title: title,
      body: body,
      data: data || {},
      // You can add channelId for Android, badge count for iOS, etc.
      // channelId: 'default', // Ensure this channel exists on the client app
    });
  }

  if (messages.length === 0) {
    console.log('[PushService] No valid messages to send after validation.');
    return;
  }

  // 3. Send notifications using Expo's push API (direct HTTP request)
  //    Alternatively, use the `expo-server-sdk` for more features like chunking and receipt handling.
  const expoPushEndpoint = 'https://exp.host/--/api/v2/push/send';
  try {
    console.log(`[PushService] Sending ${messages.length} push notifications via Expo API...`);
    const response = await fetch(expoPushEndpoint, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Accept-encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
        // 'Authorization': `Bearer ${process.env.EXPO_ACCESS_TOKEN}` // If you have an Expo Access Token for server-side calls
      },
      body: JSON.stringify(messages),
    });

    const responseText = await response.text(); // Read text first for better error logging
    if (!response.ok) {
      console.error(`[PushService] Error sending push notifications: ${response.status} - ${responseText}`);
      // TODO: Handle specific errors, e.g., DeviceNotRegistered
      return;
    }
    
    const result = JSON.parse(responseText); // Try to parse JSON if response was ok
    console.log('[PushService] Expo push API response:', result);

    // TODO: Handle specific ticket statuses from the response (e.g., if a token is invalid)
    // result.data might be an array of tickets like: [{ status: 'ok', id: 'xxxx' }, { status: 'error', message: '...DeviceNotRegistered...' }]

  } catch (error) {
    console.error('[PushService] Failed to send push notifications:', error);
  }
} 