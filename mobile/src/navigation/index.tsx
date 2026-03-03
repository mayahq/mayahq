import React from 'react'
import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native'
import { createStackNavigator } from '@react-navigation/stack'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { useAuthContext } from '../auth/AuthProvider'
import LoginScreen from '../screens/LoginScreen'
import ChatScreenNew from '../screens/ChatScreenNew'
import LoadingScreen from '../screens/LoadingScreen'
import ProfileScreen from '../screens/ProfileScreen'
import FeedScreen from '../screens/FeedScreen'
import SearchScreen from '../screens/SearchScreen'
import CreateScreen from '../screens/CreateScreen'
import TasksScreen from '../screens/TasksScreen'
import CameraScreen from '../screens/snap-to-prompt/CameraScreen'
import FeedItemStudioScreen from '../screens/snap-to-prompt/FeedItemStudioScreen'
import PromptAnalyzerScreen from '../screens/snap-to-prompt/PromptAnalyzerScreen'
import SceneGenerationScreen from '../screens/SceneGenerationScreen'
import BatchUploadScreen from '../screens/BatchUploadScreen'
import CalendarScreen from '../screens/CalendarScreen'
import MoodEngineScreen from '../screens/MoodEngineScreen'
import ComfyUISwipeScreen from '../screens/ComfyUISwipeScreen'
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons'
import { Image } from 'react-native'

// Define our parameter types for the navigator
export type RootStackParamList = {
  Login: undefined
  Main: undefined
  Chat: undefined
  Calendar: undefined
  MoodEngine: undefined
  ComfyUISwipe: undefined
  CameraScreen: undefined
  FeedItemStudioScreen: { uri: string; initialPrompt?: string }
  PromptAnalyzerScreen: { uri: string }
  SceneGenerationScreen: undefined
  BatchUploadScreen: undefined
}

export type MainTabParamList = {
  Home: undefined
  Search: undefined
  Create: undefined
  Tasks: undefined
  Profile: undefined
}

// Create the navigators
const Stack = createStackNavigator<RootStackParamList>()
const Tab = createBottomTabNavigator<MainTabParamList>()

// Navigation ref for deep linking from notifications
export const navigationRef = createNavigationContainerRef<RootStackParamList>()

// Instagram-style bottom tab navigator
function MainTabNavigator() {
  const { user } = useAuthContext()

  return (
    <Tab.Navigator
      screenOptions={({ route }: { route: any }) => ({
        tabBarIcon: ({ focused, color, size }: { focused: boolean; color: string; size: number }) => {
          let iconName: any
          
          if (route.name === 'Home') {
            iconName = focused ? 'home' : 'home-outline'
            return <Ionicons name={iconName} size={size} color={color} />
          } else if (route.name === 'Search') {
            iconName = focused ? 'search' : 'search-outline'
            return <Ionicons name={iconName} size={size} color={color} />
          } else if (route.name === 'Create') {
            return <Ionicons name="add-circle-outline" size={size + 4} color={color} />
          } else if (route.name === 'Tasks') {
            iconName = focused ? 'checkbox' : 'checkbox-outline'
            return <Ionicons name={iconName} size={size} color={color} />
          } else if (route.name === 'Profile') {
            // Use user avatar - first try user_metadata, then user profile
            const avatarUrl = user?.user_metadata?.avatar_url || user?.user_metadata?.picture
            if (avatarUrl) {
              return (
                <Image
                  source={{ uri: avatarUrl }}
                  style={{
                    width: size + 2,
                    height: size + 2,
                    borderRadius: (size + 2) / 2,
                    borderWidth: focused ? 2 : 0,
                    borderColor: focused ? color : 'transparent',
                  }}
                />
              )
            } else {
              iconName = focused ? 'person' : 'person-outline'
              return <Ionicons name={iconName} size={size} color={color} />
            }
          }
        },
        tabBarActiveTintColor: '#A855F7',
        tabBarInactiveTintColor: '#6B7280',
        tabBarStyle: {
          backgroundColor: '#111827',
          borderTopColor: '#374151',
          borderTopWidth: 1,
          height: 70,
          paddingBottom: 16,
          paddingTop: 8,
        },
        tabBarShowLabel: false,
        headerShown: false,
      })}
    >
      <Tab.Screen name="Home" component={FeedScreen} />
      <Tab.Screen name="Search" component={SearchScreen} />
      <Tab.Screen
        name="Create"
        component={CreateScreen}
        listeners={({ navigation }) => ({
          tabPress: (e) => {
            e.preventDefault();
            navigation.navigate('SceneGenerationScreen');
          },
        })}
      />
      <Tab.Screen name="Tasks" component={TasksScreen} />
      <Tab.Screen name="Profile" component={ProfileScreen} />
    </Tab.Navigator>
  )
}

export default function Navigation() {
  const { user, loading } = useAuthContext()

  // Show a loading screen while checking authentication
  if (loading) {
    return <LoadingScreen />
  }

  return (
    <NavigationContainer ref={navigationRef}>
      <Stack.Navigator
        screenOptions={{
          headerStyle: {
            backgroundColor: '#6b46c1', // Purple color similar to Maya
          },
          headerTintColor: '#fff',
          headerTitleStyle: {
            fontWeight: 'bold',
          },
          headerShown: false, // Hide the default header since our screens have their own
        }}
      >
        {user ? (
          // User is signed in
          <>
            <Stack.Screen
              name="Main"
              component={MainTabNavigator}
            />
            <Stack.Screen
              name="Chat"
              component={ChatScreenNew}
              options={{ title: 'Chat with Maya', headerShown: false }}
            />
            <Stack.Screen
              name="MoodEngine"
              component={MoodEngineScreen}
              options={{ title: 'Mood Engine', headerShown: false }}
            />
            <Stack.Screen
              name="CameraScreen"
              component={CameraScreen}
              options={{ headerShown: false }}
            />
            <Stack.Screen
              name="FeedItemStudioScreen"
              component={FeedItemStudioScreen}
              options={{ headerShown: false }}
            />
            <Stack.Screen
              name="PromptAnalyzerScreen"
              component={PromptAnalyzerScreen}
              options={{ headerShown: false }}
            />
            <Stack.Screen
              name="SceneGenerationScreen"
              component={SceneGenerationScreen}
              options={{ headerShown: false }}
            />
            <Stack.Screen
              name="BatchUploadScreen"
              component={BatchUploadScreen}
              options={{ headerShown: false }}
            />
            <Stack.Screen
              name="Calendar"
              component={CalendarScreen}
              options={{ headerShown: false }}
            />
            <Stack.Screen
              name="ComfyUISwipe"
              component={ComfyUISwipeScreen}
              options={{ headerShown: false }}
            />
          </>
        ) : (
          // User is not signed in
          <Stack.Screen
            name="Login"
            component={LoginScreen}
            options={{ title: 'Sign In', headerShown: false }}
          />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  )
} 