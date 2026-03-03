import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Keyboard,
  SafeAreaView,
  Image,
  Animated,
  LayoutAnimation,
  UIManager,
  Alert,
  Modal,
  AppState,
  RefreshControl,
  ScrollView,
} from 'react-native';
import { useAuthContext } from '../auth/AuthProvider';
import { supabase } from '../lib/supabase/client';
// Import from our improved packages
import { useRoomMessages, sendMessage, Message as ChatMessage } from '@mayahq/chat-sdk';
import { useNavigation } from '@react-navigation/native';
import { v4 as uuidv4 } from 'uuid';
import AsyncStorage from '@react-native-async-storage/async-storage';
// Import icons
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import Markdown from 'react-native-markdown-display';
// Import network info for connectivity detection
// @ts-ignore - NetInfo types may not be available but the package is installed
import NetInfo from '@react-native-community/netinfo';
// Import xAI Voice Chat (ultra-low latency speech-to-speech)
import { XaiVoiceChat } from '../components/XaiVoiceChat';
// Import expo-image-picker for image uploads
import * as ImagePicker from 'expo-image-picker';
// Import expo-media-library for saving images to photos
import * as MediaLibrary from 'expo-media-library';
// Import expo-file-system for downloading images
import * as FileSystem from 'expo-file-system';

// Define constants for Maya system user ID (match website)
const MAYA_SYSTEM_USER_ID = '61770892-9e5b-46a5-b622-568be7066664';

// Website-matching color scheme (dark mode)
const COLORS = {
  background: '#0A0A0A',
  header: '#171717',
  userBubble: '#9333EA', // Bright purple
  userText: '#FFFFFF',
  mayaBubble: '#1E1E22', // Dark gray
  mayaText: '#F5F5F5',
  inputBackground: '#1E1E22',
  inputText: '#FFFFFF',
  sendButton: '#9333EA',
  profileButton: '#1E1E22',
  profileText: '#9333EA',
  timestamp: '#71717A',
  placeholderText: '#71717A',
  errorText: '#ef4444',
  errorBackground: 'rgba(239, 68, 68, 0.1)',
  warningText: '#f59e0b',
  warningBackground: 'rgba(245, 158, 11, 0.1)',
  successText: '#10b981',
  retryButton: '#6366f1',
};

// Enhanced error types for better user feedback
enum ErrorType {
  NETWORK = 'network',
  TIMEOUT = 'timeout',
  SERVER = 'server',
  AUTH = 'auth',
  VALIDATION = 'validation',
  WARNING = 'warning',
  UNKNOWN = 'unknown'
}

interface ErrorInfo {
  type: ErrorType;
  message: string;
  actionable: string;
  retryable: boolean;
}

// Message retry state
interface RetryState {
  isRetrying: boolean;
  attempts: number;
  maxAttempts: number;
  lastError?: ErrorInfo;
}

// Default avatar URLs - Using inline data URIs for reliability
const DEFAULT_USER_AVATAR = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA0MCA0MCIgZmlsbD0ibm9uZSI+PGNpcmNsZSBjeD0iMjAiIGN5PSIyMCIgcj0iMjAiIGZpbGw9IiM5YzZlZmYiLz48dGV4dCB4PSI1MCUiIHk9IjUwJSIgZG9taW5hbnQtYmFzZWxpbmU9Im1pZGRsZSIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZmlsbD0id2hpdGUiIGZvbnQtc2l6ZT0iMTYiIGZvbnQtZmFtaWx5PSJBcmlhbCwgc2Fucy1zZXJpZiI+VTwvdGV4dD48L3N2Zz4=';
const DEFAULT_MAYA_AVATAR = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA0MCA0MCIgZmlsbD0ibm9uZSI+PGNpcmNsZSBjeD0iMjAiIGN5PSIyMCIgcj0iMjAiIGZpbGw9IiMxZTFlMjIiLz48dGV4dCB4PSI1MCUiIHk9IjUwJSIgZG9taW5hbnQtYmFzZWxpbmU9Im1pZGRsZSIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZmlsbD0id2hpdGUiIGZvbnQtc2l6ZT0iMTYiIGZvbnQtZmFtaWx5PSJBcmlhbCwgc2Fucy1zZXJpZiI+TTwvdGV4dD48L3N2Zz4=';

// Add URL for memory worker service (if used)
const MEMORY_WORKER_URL: string = (process.env.EXPO_PUBLIC_MEMORY_WORKER_URL as string) || 'https://mayahq-production.up.railway.app';
const MEMORY_WORKER_ENABLED = true;

// Enhanced timeout settings
const TIMEOUTS = {
  MESSAGE_SEND: 15000, // Increased from 10s to 15s for cellular
  MESSAGE_SEND_CELLULAR: 20000, // Even longer timeout for cellular
  MEMORY_WORKER: 8000, // Increased from 5s to 8s
  NETWORK_CHECK: 5000, // Increased from 3s to 5s
};

interface Profile {
  id: string;
  avatar_url: string | null;
  updated_at: string;
  name?: string;
}

const ChatScreenNew = () => {
  const [inputText, setInputText] = useState('');
  const [draftMessage, setDraftMessage] = useState(''); // Persistent draft storage
  const [roomId, setRoomId] = useState<string | null>(null);
  const [typing, setTyping] = useState(false);
  const [sendingMessage, setSendingMessage] = useState(false);
  const [waitingForMaya, setWaitingForMaya] = useState(false);
  const [userProfile, setUserProfile] = useState<Profile | null>(null);
  const [mayaProfile, setMayaProfile] = useState<Profile | null>(null);
  const [error, setError] = useState<ErrorInfo | null>(null);
  const [heartActive, setHeartActive] = useState(false);
  const [menuVisible, setMenuVisible] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showVoiceInterface, setShowVoiceInterface] = useState(false); // Add voice interface state
  const [selectedImages, setSelectedImages] = useState<ImagePicker.ImagePickerAsset[]>([]); // Selected images for upload
  const [showAttachMenu, setShowAttachMenu] = useState(false); // Attachment menu popup
  const [fullScreenImage, setFullScreenImage] = useState<string | null>(null); // Full screen image viewer
  const [savingImage, setSavingImage] = useState(false); // Saving image to photos state
  
  // Enhanced connectivity and retry state
  const [isConnected, setIsConnected] = useState(true);
  const [connectionType, setConnectionType] = useState<string>('unknown');
  const [retryState, setRetryState] = useState<RetryState>({
    isRetrying: false,
    attempts: 0,
    maxAttempts: 3,
  });
  
  const { user } = useAuthContext();
  const navigation = useNavigation();
  const flatListRef = useRef<FlatList>(null);
  const inputRef = useRef<TextInput>(null);
  const isMounted = useRef(true); // Track component mount state
  
  // Animated values for typing dots
  const dot1Opacity = useRef(new Animated.Value(0.3)).current;
  const dot2Opacity = useRef(new Animated.Value(0.3)).current;
  const dot3Opacity = useRef(new Animated.Value(0.3)).current;
  
  // Add keyboard animation state
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const keyboardAnim = useRef(new Animated.Value(0)).current;

  // Enhanced error classification function
  const classifyError = useCallback((error: any): ErrorInfo => {
    console.log('Classifying error:', error);
    
    // Be more lenient with cellular connections - don't immediately assume network issues
    const isLikelyCellularTimeout = connectionType === 'cellular' && 
      (error?.message?.toLowerCase().includes('timeout') || error?.name === 'AbortError');
    
    // Network-related errors - but be more cautious with cellular
    if ((error?.message?.toLowerCase().includes('network') || 
        error?.message?.toLowerCase().includes('fetch') ||
        error?.message?.toLowerCase().includes('connection') ||
        error?.code === 'NETWORK_ERROR') && 
        !isLikelyCellularTimeout) { // Don't immediately blame network on cellular timeouts
      return {
        type: ErrorType.NETWORK,
        message: 'Network connection issue',
        actionable: isConnected 
          ? 'Check your internet connection and try again' 
          : 'You appear to be offline. Check your connection.',
        retryable: true,
      };
    }
    
    // Timeout errors - be more helpful for cellular users
    if (error?.message?.toLowerCase().includes('timeout') || 
        error?.code === 'TIMEOUT' ||
        error?.name === 'AbortError') {
      return {
        type: ErrorType.TIMEOUT,
        message: connectionType === 'cellular' ? 'Slow connection detected' : 'Request timed out',
        actionable: connectionType === 'cellular' 
          ? 'Your cellular connection may be slow. The message will retry automatically.'
          : 'The request took too long. This may be due to a slow connection.',
        retryable: true,
      };
    }
    
    // Authentication errors
    if (error?.message?.toLowerCase().includes('auth') || 
        error?.message?.toLowerCase().includes('unauthorized') ||
        error?.code === '42501' ||
        error?.status === 401) {
      return {
        type: ErrorType.AUTH,
        message: 'Authentication error',
        actionable: 'Please log out and log back in to refresh your session.',
        retryable: false,
      };
    }
    
    // Server errors
    if (error?.status >= 500 || 
        error?.message?.toLowerCase().includes('server') ||
        error?.message?.toLowerCase().includes('internal')) {
      return {
        type: ErrorType.SERVER,
        message: 'Server error',
        actionable: 'Maya\'s servers are experiencing issues. Please try again in a moment.',
        retryable: true,
      };
    }
    
    // Validation errors
    if (error?.message?.toLowerCase().includes('uuid') ||
        error?.message?.toLowerCase().includes('validation') ||
        error?.status === 400) {
      return {
        type: ErrorType.VALIDATION,
        message: 'Invalid data',
        actionable: 'There was an issue with your message format. Please restart the app.',
        retryable: false,
      };
    }
    
    // Unknown errors
    return {
      type: ErrorType.UNKNOWN,
      message: error?.message || 'An unexpected error occurred',
      actionable: 'Something went wrong. Please try again or restart the app if the problem persists.',
      retryable: true,
    };
  }, [isConnected, connectionType]);

  // Enhanced network connectivity monitoring
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state: any) => {
      console.log('Network state changed:', state);
      const wasConnected = isConnected;
      const newIsConnected = state.isConnected ?? false;
      
      setIsConnected(newIsConnected);
      setConnectionType(state.type || 'unknown');
      
      // Only show network errors for definitive disconnections, not temporary cellular blips
      if (newIsConnected === false && wasConnected === true) {
        console.log('Definitive network disconnection detected');
        setError({
          type: ErrorType.NETWORK,
          message: 'No internet connection',
          actionable: 'Check your network settings and try again.',
          retryable: true,
        });
      } else if (newIsConnected === true && wasConnected === false) {
        // Clear network errors when connection is definitively restored
        console.log('Network connection restored');
        if (error?.type === ErrorType.NETWORK) {
          setError(null);
        }
      }
      
      // Don't immediately react to cellular connection quality changes
      if (state.type === 'cellular' && state.isConnected) {
        console.log('Cellular connection detected - being lenient with quality fluctuations');
      }
    });

    return unsubscribe;
  }, [error, isConnected]); // Add isConnected to dependencies

  // Load draft message on component mount
  useEffect(() => {
    const loadDraft = async () => {
      try {
        const draft = await AsyncStorage.getItem(`draft_message_${user?.id}`);
        if (draft && draft.trim()) {
          setInputText(draft);
          setDraftMessage(draft);
        }
      } catch (error) {
        console.log('Failed to load draft message:', error);
      }
    };

    if (user?.id) {
      loadDraft();
    }
  }, [user?.id]);

  // Save draft message as user types
  const saveDraftMessage = useCallback(async (text: string) => {
    if (!user?.id) return;
    
    try {
      if (text.trim()) {
        await AsyncStorage.setItem(`draft_message_${user.id}`, text);
      } else {
        await AsyncStorage.removeItem(`draft_message_${user.id}`);
      }
      setDraftMessage(text);
    } catch (error) {
      console.log('Failed to save draft message:', error);
    }
  }, [user?.id]);

  // Clear draft message after successful send
  const clearDraftMessage = useCallback(async () => {
    if (!user?.id) return;

    try {
      await AsyncStorage.removeItem(`draft_message_${user.id}`);
      setDraftMessage('');
    } catch (error) {
      console.log('Failed to clear draft message:', error);
    }
  }, [user?.id]);

  // Validate and add images to selection
  const validateAndAddImages = (assets: ImagePicker.ImagePickerAsset[]) => {
    const MAX_FILE_SIZE = 4 * 1024 * 1024; // 4MB
    const MAX_TOTAL_SIZE = 4 * 1024 * 1024; // 4MB total

    // Check individual file sizes
    const oversizedFiles = assets.filter(img => {
      const size = (img as any).fileSize || 0;
      return size > 0 && size > MAX_FILE_SIZE;
    });

    if (oversizedFiles.length > 0) {
      Alert.alert(
        'Files Too Large',
        `Some images are too large (max 4MB). Consider compressing them or selecting smaller images.`
      );
      return false;
    }

    // Check total size with existing images
    const currentSize = selectedImages.reduce((sum, img) => {
      const size = (img as any).fileSize || 0;
      return sum + size;
    }, 0);

    const newSize = assets.reduce((sum, img) => {
      const size = (img as any).fileSize || 0;
      return sum + size;
    }, 0);

    if (currentSize + newSize > MAX_TOTAL_SIZE) {
      Alert.alert(
        'Total Size Limit',
        `Total image size would exceed 4MB limit. Try selecting fewer or smaller images.`
      );
      return false;
    }

    setSelectedImages(prev => [...prev, ...assets]);
    return true;
  };

  // Take photo with camera
  const takePhoto = async () => {
    try {
      // Request camera permission
      const { status } = await ImagePicker.requestCameraPermissionsAsync();

      if (status !== 'granted') {
        Alert.alert('Permission required', 'Please allow access to your camera to take photos.');
        return;
      }

      // Launch camera
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.8,
        exif: false,
        allowsEditing: true,
      });

      if (!result.canceled && result.assets) {
        validateAndAddImages(result.assets);
      }
    } catch (error) {
      console.error('Error taking photo:', error);
      Alert.alert('Error', 'Failed to take photo. Please try again.');
    }
  };

  // Pick images from library
  const pickImages = async () => {
    try {
      // Request permission
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (status !== 'granted') {
        Alert.alert('Permission required', 'Please allow access to your photos to upload images.');
        return;
      }

      // Launch image picker
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsMultipleSelection: true,
        quality: 0.8,
        exif: false,
      });

      if (!result.canceled && result.assets) {
        validateAndAddImages(result.assets);
      }
    } catch (error) {
      console.error('Error picking images:', error);
      Alert.alert('Error', 'Failed to pick images. Please try again.');
    }
  };

  // Show image source selection
  const showImageSourceOptions = () => {
    Alert.alert(
      'Add Image',
      'Choose an option',
      [
        {
          text: 'Take Photo',
          onPress: takePhoto,
        },
        {
          text: 'Choose from Library',
          onPress: pickImages,
        },
        {
          text: 'Cancel',
          style: 'cancel',
        },
      ],
      { cancelable: true }
    );
  };

  // Remove selected image
  const removeImage = (index: number) => {
    setSelectedImages(prev => prev.filter((_, i) => i !== index));
  };

  // Save image to photo library
  const saveImageToPhotos = async (imageUrl: string) => {
    try {
      setSavingImage(true);

      // Request permission to save to photos
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Please allow access to your photo library to save images.');
        return;
      }

      // Download the image to a temporary file
      const filename = imageUrl.split('/').pop() || `maya_image_${Date.now()}.jpg`;
      const fileUri = `${FileSystem.cacheDirectory}${filename}`;

      console.log('[ChatScreen] Downloading image:', imageUrl);
      const downloadResult = await FileSystem.downloadAsync(imageUrl, fileUri);

      if (downloadResult.status !== 200) {
        throw new Error('Failed to download image');
      }

      // Save to photo library
      const asset = await MediaLibrary.createAssetAsync(downloadResult.uri);
      console.log('[ChatScreen] Image saved to photos:', asset.uri);

      Alert.alert('Saved!', 'Image saved to your photo library.');
    } catch (error) {
      console.error('[ChatScreen] Error saving image:', error);
      Alert.alert('Error', 'Failed to save image. Please try again.');
    } finally {
      setSavingImage(false);
    }
  };

  // Enhanced input text handler with draft saving
  const handleInputTextChange = useCallback((text: string) => {
    setInputText(text);
    // Debounce draft saving
    const timeoutId = setTimeout(() => saveDraftMessage(text), 500);
    return () => clearTimeout(timeoutId);
  }, [saveDraftMessage]);
  
  // Enable layout animations for Android
  useEffect(() => {
    if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
      UIManager.setLayoutAnimationEnabledExperimental(true);
    }
    
    // Cleanup on unmount
    return () => {
      isMounted.current = false;
    };
  }, []);
  
  // Set up keyboard listeners
  useEffect(() => {
    // Define keyboard show/hide handlers
    const keyboardWillShow = (event: { endCoordinates: { height: number } }) => {
      // Get keyboard height
      const keyboardHeight = event.endCoordinates.height;
      setKeyboardHeight(keyboardHeight);
      
      // Configure animation
      LayoutAnimation.configureNext({
        duration: 300,
        create: {
          type: LayoutAnimation.Types.easeInEaseOut,
          property: LayoutAnimation.Properties.opacity,
        },
        update: {
          type: LayoutAnimation.Types.easeInEaseOut,
        }
      });
      
      // Animate keyboard appearance
      Animated.timing(keyboardAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: false,
      }).start();
    };
    
    const keyboardWillHide = () => {
      setKeyboardHeight(0);
      
      // Configure animation
      LayoutAnimation.configureNext({
        duration: 300,
        create: {
          type: LayoutAnimation.Types.easeInEaseOut,
          property: LayoutAnimation.Properties.opacity,
        },
        update: {
          type: LayoutAnimation.Types.easeInEaseOut,
        }
      });
      
      // Animate keyboard disappearance
      Animated.timing(keyboardAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: false,
      }).start();
    };
    
    // Set up listeners based on platform
    const keyboardShowListener = Platform.OS === 'ios'
      ? Keyboard.addListener('keyboardWillShow', keyboardWillShow)
      : Keyboard.addListener('keyboardDidShow', keyboardWillShow);
      
    const keyboardHideListener = Platform.OS === 'ios'
      ? Keyboard.addListener('keyboardWillHide', keyboardWillHide)
      : Keyboard.addListener('keyboardDidHide', keyboardWillHide);
    
    // Clean up listeners
    return () => {
      keyboardShowListener.remove();
      keyboardHideListener.remove();
    };
  }, [keyboardAnim]);
  
  // Function to toggle heart icon
  const toggleHeart = () => {
    setHeartActive(!heartActive);
  };
  
  // Function to toggle menu visibility
  const toggleMenu = () => {
    setMenuVisible(!menuVisible);
  };
  
  // Function to toggle voice mode
  const toggleVoiceMode = () => {
    setShowVoiceInterface(!showVoiceInterface);
  };

  // Function to navigate to profile
  const goToProfile = () => {
    setMenuVisible(false);
    navigation.navigate('Profile' as never);
  };

  // Function to navigate to feed
  const goToFeed = () => {
    setMenuVisible(false);
    navigation.navigate('Feed' as never);
  };

  // Function to navigate to mood engine
  const goToMoodEngine = () => {
    setMenuVisible(false);
    navigation.navigate('MoodEngine' as never);
  };

  // Retry mechanism for failed messages
  const retryMessage = useCallback(async () => {
    if (!draftMessage.trim() || retryState.attempts >= retryState.maxAttempts) {
      return;
    }

    setRetryState(prev => ({
      ...prev,
      isRetrying: true,
      attempts: prev.attempts + 1,
    }));

    setError(null);
    
    // Wait a bit before retrying (exponential backoff)
    const delay = Math.min(1000 * Math.pow(2, retryState.attempts), 5000);
    await new Promise(resolve => setTimeout(resolve, delay));

    await handleSendMessage(true); // Pass true to indicate this is a retry
  }, [draftMessage, retryState.attempts, retryState.maxAttempts]);
  
  // Fetch Maya's profile specifically using her system ID
  const fetchMayaProfile = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', MAYA_SYSTEM_USER_ID)
        .single();
        
      if (data) {
        console.log('Maya profile found with system ID:', data);
        setMayaProfile(data);
      } else if (error) {
        console.error('Error fetching Maya profile:', error);
      }
    } catch (error) {
      console.error('Exception fetching Maya profile:', error);
    }
  }, []);
  
  // Function to fetch profiles for user and Maya
  const fetchProfiles = useCallback(async (userId: string) => {
    try {
      // Fetch user profile
      const { data: userData, error: userError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();
      
      if (userData) {
        console.log('User profile found:', userData);
        setUserProfile(userData);
      } else if (userError) {
        console.error('Error fetching user profile:', userError);
        
        // Create a profile if none exists
        try {
          const { error: insertError } = await supabase
            .from('profiles')
            .insert({
              id: userId,
              name: user?.email?.split('@')[0] || 'User',
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            });
          
          if (insertError) {
            console.error('Error creating profile:', insertError);
          } else {
            console.log('User profile created successfully');
            // Fetch the newly created profile
            const { data: newUserData } = await supabase
              .from('profiles')
              .select('*')
              .eq('id', userId)
              .single();
              
            if (newUserData) {
              setUserProfile(newUserData);
            }
          }
        } catch (error) {
          console.error('Error in profile creation:', error);
        }
      }

      // Also fetch Maya's profile
      await fetchMayaProfile();
      
    } catch (error) {
      console.error('Error in fetchProfiles:', error);
    }
  }, [fetchMayaProfile]);
  
  // Create or get a chat room when user is authenticated
  useEffect(() => {
    async function getOrCreateRoom() {
      if (!user?.id) {
        console.log('No user ID yet, skipping room setup');
        return;
      }
      
      setError(null);
      
      try {
        console.log('Getting room for user ID:', user.id);
        
        // Look for an existing room
        const { data: rooms, error: roomError } = await supabase
          .from('rooms')
          .select('*')
          .eq('user_id', user.id)
          .order('last_message_at', { ascending: false })
          .limit(1);
        
        if (roomError) {
          console.error('Error fetching rooms:', roomError);
          setError(classifyError({ message: 'Failed to load chat rooms', originalError: roomError }));
          return;
        }
          
        if (rooms && rooms.length > 0 && rooms[0].id) {
          console.log('Found existing room:', rooms[0].id);
          setRoomId(rooms[0].id);
        } else {
          console.log('Creating new room for user:', user.id);
          
          // Create a new room
          const { data, error: createError } = await supabase
            .from('rooms')
            .insert({
              name: 'Chat with Maya',
              user_id: user.id
            })
            .select()
            .single();
            
          if (createError) {
            console.error('Error creating room:', createError);
            
            // Handle row-level security policy violation
            if (createError.code === '42501') {
              setError({
                type: ErrorType.AUTH,
                message: 'Authentication error',
                actionable: 'Unable to create chat room. Please log out and log back in to refresh your session. If the problem persists, please contact support.',
                retryable: false,
              });
            } else {
              setError(classifyError(createError));
            }
            return;
          }
            
          if (data && data.id) {
            console.log('Created new room:', data.id);
            setRoomId(data.id);
            
            // Add welcome message using the chat SDK
            try {
              const { error: welcomeError } = await sendMessage({
                roomId: data.id,
                userId: user.id,
                content: '*smiles warmly* Hello! I am Maya, your AI assistant. How can I help you today?',
                role: 'assistant',
                supabaseClient: supabase
              });
              
              if (welcomeError) {
                console.error('Error adding welcome message:', welcomeError);
              }
            } catch (error) {
              console.error('Exception adding welcome message:', error);
            }
          } else {
            console.error('Room created but no ID returned');
            setError({
              type: ErrorType.UNKNOWN,
              message: 'Setup error',
              actionable: 'Error setting up chat - please try again',
              retryable: true,
            });
          }
        }
      } catch (err) {
        console.error('Error in getOrCreateRoom:', err);
        setError({
          type: ErrorType.UNKNOWN,
          message: 'Chat setup failed',
          actionable: 'An error occurred setting up the chat',
          retryable: true,
        });
      }
      
      // Fetch profiles for avatar display
      fetchProfiles(user.id);
    }
    
    if (user?.id) {
      getOrCreateRoom();
    }
  }, [user?.id, fetchProfiles, classifyError]);
  
  // Use the chat SDK hook to get messages
  const {
    messages,
    loading,
    error: messagesError,
    subscriptionStatus,
    addLocalMessage,
    updateLocalMessage,
    removeLocalMessage,
    refetch
  } = useRoomMessages(roomId || '', {
    supabaseClient: supabase,
    limit: 50
  });
  
  // Set error from messages if present
  useEffect(() => {
    if (messagesError) {
      setError(classifyError(messagesError));
    }
  }, [messagesError, classifyError]);

  // Monitor subscription status and log warnings
  useEffect(() => {
    console.log('[ChatScreen] Realtime subscription status:', subscriptionStatus);

    if (subscriptionStatus === 'disconnected') {
      console.warn('[ChatScreen] ⚠️ Realtime subscription is DISCONNECTED - messages may not appear!');
    } else if (subscriptionStatus === 'connected') {
      console.log('[ChatScreen] ✅ Realtime subscription is CONNECTED');
    }
  }, [subscriptionStatus]);
  
  // ---- Add AppState Listener ----
  const appState = useRef(AppState.currentState);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', nextAppState => {
      if (
        appState.current.match(/inactive|background/) &&
        nextAppState === 'active'
      ) {
        console.log('[ChatScreen] App came to foreground - refetching messages...');
        // Refetch messages when app comes back to foreground
        refetch();
      }

      appState.current = nextAppState;
      console.log('[ChatScreen] AppState:', appState.current);
    });

    return () => {
      subscription.remove();
    };
  }, [refetch]);
  // ---- End AppState Listener ----
  
  // ---- Typing Indicator Animation ----
  useEffect(() => {
    if (waitingForMaya) {
      const createAnimation = (animatedValue: Animated.Value, delay: number) => {
        return Animated.loop(
          Animated.sequence([
            Animated.delay(delay),
            Animated.timing(animatedValue, {
              toValue: 1,
              duration: 400,
              useNativeDriver: true,
            }),
            Animated.timing(animatedValue, {
              toValue: 0.3,
              duration: 400,
              useNativeDriver: true,
            }),
            Animated.delay(400), // Wait a bit before restarting the loop for this dot
          ])
        );
      };

      const anim1 = createAnimation(dot1Opacity, 0);
      const anim2 = createAnimation(dot2Opacity, 200);
      const anim3 = createAnimation(dot3Opacity, 400);

      anim1.start();
      anim2.start();
      anim3.start();

      return () => {
        anim1.stop();
        anim2.stop();
        anim3.stop();
        // Reset opacities if needed when stopping
        dot1Opacity.setValue(0.3);
        dot2Opacity.setValue(0.3);
        dot3Opacity.setValue(0.3);
      };
    }
  }, [waitingForMaya, dot1Opacity, dot2Opacity, dot3Opacity]);
  // ---- End Typing Indicator Animation ----
  
  // Track when we last sent a message
  const lastUserMessageTimeRef = useRef<number>(0);

  // Listen for Maya's response to stop typing indicator
  useEffect(() => {
    if (!waitingForMaya) return;

    // Get the last message
    const lastMessage = messages[messages.length - 1];

    // Only stop typing if:
    // 1. Last message is from assistant
    // 2. Last message was created AFTER we started waiting for Maya
    if (lastMessage && lastMessage.role === 'assistant') {
      const messageTime = new Date(lastMessage.created_at as string).getTime();
      const waitStartTime = lastUserMessageTimeRef.current;

      if (messageTime > waitStartTime) {
        console.log('[ChatScreen] Received Maya response, stopping typing indicator');
        setWaitingForMaya(false);
        setTyping(false);
      }
    }

    // Auto-timeout after 90 seconds (generous for slow connections)
    const timeout = setTimeout(() => {
      if (waitingForMaya) {
        console.log('[ChatScreen] ⏱️ Typing indicator timeout after 90s');
        setWaitingForMaya(false);
        setTyping(false);
      }
    }, 90000);

    return () => clearTimeout(timeout);
  }, [messages, waitingForMaya]);
  
  // Function to format the timestamp
  const formatMessageTime = (timestamp: string): string => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };
  
  // Enhanced function to send a message with optional image attachments
  const handleSendMessage = async (isRetry: boolean = false) => {
    // Check if we have either text or images
    if ((!inputText.trim() && selectedImages.length === 0) || !roomId || !user?.id) return;

    const trimmedText = inputText.trim() || 'Sent an image';
    const tempId = Date.now().toString();
    const hasImages = selectedImages.length > 0;

    setSendingMessage(true);
    setError(null);

    try {
      console.log(`Sending message to room: ${roomId}${hasImages ? ` with ${selectedImages.length} images` : ''}`);

      // 1. OPTIMISTIC UPDATE - Show user message immediately
      addLocalMessage({
        id: tempId,
        room_id: roomId,
        user_id: user.id,
        role: 'user',
        content: trimmedText,
        created_at: new Date().toISOString(),
        isPending: true,
        metadata: hasImages ? { attachments: selectedImages.map(img => ({ type: 'image', url: img.uri, name: img.fileName })) } : undefined
      } as ChatMessage);

      let message: any;

      if (hasImages) {
        // Upload with images via FormData to maya-chat-v3 API
        console.log('Uploading message with images via FormData...');

        const formData = new FormData();
        formData.append('message', trimmedText);
        formData.append('roomId', roomId);
        formData.append('mobileAuthUserId', user.id);
        formData.append('userName', user?.email || 'User');

        // Add each image to FormData with proper file handling for React Native
        for (let index = 0; index < selectedImages.length; index++) {
          const image = selectedImages[index];
          const uriParts = image.uri.split('.');
          const fileType = uriParts[uriParts.length - 1];
          const fileName = image.fileName || `image_${index}.${fileType}`;

          // React Native requires this specific format for file uploads
          const file = {
            uri: image.uri,
            type: `image/${fileType}`,
            name: fileName,
          };

          formData.append(`file_${index}`, file as any);
        }

        // Get the API URL
        const API_URL = process.env.EXPO_PUBLIC_API_URL || 'https://www.mayascott.ai';

        console.log('[Mobile] Uploading to:', `${API_URL}/api/maya-chat-v3`);
        console.log('[Mobile] Image count:', selectedImages.length);
        console.log('[Mobile] FormData entries:', selectedImages.map((img, i) => `file_${i}: ${img.fileName || 'unknown'}`));

        const response = await fetch(`${API_URL}/api/maya-chat-v3`, {
          method: 'POST',
          headers: {
            'X-Maya-Mobile-App': 'true',
            // Don't set Content-Type - let FormData set it with boundary
          },
          body: formData,
        });

        console.log('[Mobile] Response status:', response.status);
        console.log('[Mobile] Response headers:', Object.fromEntries(response.headers.entries()));

        if (!response.ok) {
          throw new Error(`Upload failed with status ${response.status}`);
        }

        const result = await response.json();
        console.log('Upload successful:', result);

        // Message was inserted by API, get the message data from result
        message = result.userMessage;
      } else {
        // Send text-only message via Supabase
        const { message: dbMessage, error: sendError } = await sendMessage({
          roomId,
          userId: user.id,
          content: trimmedText,
          role: 'user',
          supabaseClient: supabase
        });

        if (sendError) {
          console.error('Error from sendMessage:', sendError);
          throw sendError;
        }

        message = dbMessage;
      }

      console.log('Message sent successfully!');

      // Update optimistic message with real ID
      if (message?.id) {
        updateLocalMessage(tempId, { id: message.id, isPending: false });
      }

      // Clear input, images, and draft only after successful send
      setInputText('');
      setSelectedImages([]);
      await clearDraftMessage();

      // Reset retry state on success
      setRetryState({
        isRetrying: false,
        attempts: 0,
        maxAttempts: 3,
      });

      // 3. Start showing typing indicator
      lastUserMessageTimeRef.current = Date.now();
      setWaitingForMaya(true);

      // 4. Trigger memory worker only for non-image messages (NON-BLOCKING - fire and forget)
      if (MEMORY_WORKER_ENABLED && !hasImages) {
        console.log('Triggering memory worker (non-blocking)...');

        fetch(`${MEMORY_WORKER_URL}/process-message`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            content: trimmedText,
            userId: user.id,
            roomId,
            messageId: message?.id
          })
        }).then(response => {
          if (response.ok) {
            console.log('Memory worker processing started');
          } else {
            console.warn('Memory worker returned error (non-fatal)');
          }
        }).catch(error => {
          // Non-fatal - Maya will still respond via maya-core
          console.warn('Memory worker connection error (non-fatal):', error);
        });
      }

      // ✅ NO TIMEOUT - realtime will show Maya's response when ready
      // User sees typing indicator, then message appears via realtime

    } catch (error) {
      console.error('Error sending message:', error);

      const errorInfo = classifyError(error);

      // Only show error for actual send failures, not timeout
      if (errorInfo.type !== ErrorType.TIMEOUT) {
        setError(errorInfo);
      }

      // Remove failed optimistic message
      updateLocalMessage(tempId, { error: true } as any);

      setWaitingForMaya(false);
      setTyping(false);
    } finally {
      setSendingMessage(false);

      // Focus input again
      if (inputRef.current) {
        inputRef.current.focus();
      }
    }
  };
  
  // Wrapper function for onPress handler
  const onSendPress = () => {
    handleSendMessage(false);
  };

  // Function to clear chat history
  const clearChat = async () => {
    // Simple guard - fail fast
    if (!roomId || !user?.id) {
      console.error('Cannot clear chat - missing IDs:', { roomId, userId: user?.id });
      Alert.alert('Error', 'Session not ready. Wait a moment and try again.');
      return;
    }
    
    const userId = user.id; // Safe to use since we checked above
    
    const confirmClear = await new Promise(resolve => {
      Alert.alert(
        "Clear Chat",
        "Are you sure you want to clear the chat history?",
        [
          { text: "Cancel", style: "cancel", onPress: () => resolve(false) },
          { text: "Clear", style: "destructive", onPress: () => resolve(true) }
        ]
      );
    });
    
    if (confirmClear) {
      try {
        console.log('Clearing chat for room:', roomId);
        
        // Delete existing messages
        const { error: deleteError } = await supabase
          .from('messages')
          .delete()
          .eq('room_id', roomId);
          
        if (deleteError) {
          throw deleteError;
        }
        
        // Add welcome message back
        await sendMessage({
          roomId,
          userId,
          content: 'Chat history cleared. How can I help you today?',
          role: 'assistant',
          supabaseClient: supabase
        });
        
        // Scroll to top
        if (flatListRef.current) {
          flatListRef.current.scrollToOffset({ offset: 0, animated: true });
        }
      } catch (error) {
        console.error('Error clearing chat:', error);
        Alert.alert('Error', 'Failed to clear chat history. Please try again.');
      }
    }
  };
  
  // ---- Add Pull-to-Refresh Logic ----
  const onRefresh = useCallback(async () => {
    console.log('[ChatScreen] Pull-to-refresh triggered');
    setIsRefreshing(true);

    // Use the refetch function from the hook
    try {
      await refetch();
      console.log('[ChatScreen] Refresh completed successfully');
    } catch (error) {
      console.error('[ChatScreen] Error during refresh:', error);
    } finally {
      setIsRefreshing(false);
    }
  }, [refetch]);
  // ---- End Pull-to-Refresh Logic ----
  
  // Render message item
  const renderMessageItem = ({ item }: { item: ChatMessage }) => {
    const isUserMessage = item.role === 'user';
    
    // Get avatar URL based on role - ensure it's always a string
    const avatarUrl: string = isUserMessage
      ? (userProfile?.avatar_url ?? DEFAULT_USER_AVATAR)
      : (mayaProfile?.avatar_url ?? DEFAULT_MAYA_AVATAR);
    
    // Get display name based on role
    const displayName = isUserMessage
      ? (userProfile?.name || user?.email?.split('@')[0] || 'You')
      : (mayaProfile?.name || 'Maya');
    
    // Format message content - show stripped content for assistant messages
    const displayContent = item.content;

    // Combine text styles for Markdown component
    const bodyStyle = {
      ...styles.messageText,
      ...(isUserMessage ? styles.userText : styles.mayaText),
      ...(item.isError && styles.errorText) 
    };
    
    // Define heading styles inheriting from bodyStyle but adding bold
    const headingStyle = {
      ...bodyStyle,
      fontWeight: 'bold' as const, 
    };
    
    // Check for attachments in metadata
    const attachments = item.metadata && typeof item.metadata === 'object' && 'attachments' in item.metadata
      ? (item.metadata as any).attachments
      : [];

    // Debug log for messages with attachments
    if (attachments.length > 0) {
      console.log('[ChatScreenNew] Message has attachments:', {
        messageId: item.id,
        content: item.content?.substring(0, 50),
        attachmentsCount: attachments.length,
        firstAttachment: attachments[0]
      });
    }

    return (
      <View style={[
        styles.messageContainer,
        isUserMessage ? styles.userMessageContainer : styles.assistantMessageContainer
      ]}>
        {/* Avatar */}
        {!isUserMessage && (
          <View style={styles.avatarContainer}>
            <Image
              source={{ uri: avatarUrl }}
              style={styles.avatar}
              defaultSource={{ uri: isUserMessage ? DEFAULT_USER_AVATAR : DEFAULT_MAYA_AVATAR }}
            />
          </View>
        )}

        <View style={styles.messageContentContainer}>
          {/* Message bubble */}
          <View style={[
            styles.messageBubble,
            isUserMessage ? styles.userBubble : styles.mayaBubble,
            item.isError && styles.errorBubble
          ]}>
            {/* Display images if available */}
            {attachments.length > 0 && (
              <View style={{ marginBottom: 8 }}>
                {attachments.map((attachment: any, index: number) => {
                  // Check if it's an image (type can be MIME type like "image/jpeg" or just "image")
                  const isImage = attachment.type?.startsWith('image/') ||
                                  attachment.type === 'image' ||
                                  attachment.mimeType?.startsWith('image/');

                  // Use publicUrl first (more reliable), fall back to url
                  const imageUri = attachment.publicUrl || attachment.url;

                  if (isImage && imageUri) {
                    return (
                      <View key={index} style={styles.messageImageContainer}>
                        <TouchableOpacity
                          activeOpacity={0.9}
                          onPress={() => setFullScreenImage(imageUri)}
                        >
                          <Image
                            source={{ uri: imageUri }}
                            style={styles.messageImage}
                            resizeMode="cover"
                            onError={(e) => console.log('[ChatScreenNew] Image load error:', e.nativeEvent.error, 'URI:', imageUri)}
                          />
                        </TouchableOpacity>
                        {/* Download button */}
                        <TouchableOpacity
                          style={styles.downloadButton}
                          onPress={() => saveImageToPhotos(imageUri)}
                        >
                          <Feather name="download" size={16} color="#FFF" />
                        </TouchableOpacity>
                      </View>
                    );
                  }
                  return null;
                })}
              </View>
            )}

            <Markdown style={{
              body: bodyStyle, // Use the combined style object
              // Apply the bold-only heading style
              heading1: headingStyle,
              heading2: headingStyle,
              heading3: headingStyle,
              heading4: headingStyle,
              heading5: headingStyle,
              heading6: headingStyle,
              // Optionally, adjust list item spacing too if needed
              // list_item: {
              //   marginTop: 2,
              //   marginBottom: 2,
              // },
            }}>
              {displayContent}
            </Markdown>
          </View>

          {/* Timestamp - now outside the bubble */}
          <Text style={[
            styles.timestamp,
            isUserMessage ? styles.timestampRight : styles.timestampLeft
          ]}>
            {formatMessageTime(item.created_at || new Date().toISOString())}
          </Text>
        </View>

        {/* Avatar (user) */}
        {isUserMessage && (
          <View style={styles.avatarContainer}>
            <Image
              source={{ uri: avatarUrl }}
              style={styles.avatar}
              defaultSource={{ uri: DEFAULT_USER_AVATAR }}
            />
          </View>
        )}
      </View>
    );
  };
  
  // The main render
  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity 
          style={styles.headerLeftSection}
          onPress={() => navigation.navigate('Main' as never)}
        >
          <View style={styles.mayaAvatarWrapper}>
            <View style={styles.mayaAvatarGradient}>
              <Image 
                source={{ uri: mayaProfile?.avatar_url || DEFAULT_MAYA_AVATAR }}
                style={styles.headerAvatar}
              />
            </View>
          </View>
          <Text style={styles.headerTitle}>
            {mayaProfile?.name || 'Maya'}
          </Text>
        </TouchableOpacity>
        <View style={styles.headerButtons}>
          <TouchableOpacity
            style={styles.headerButton}
            onPress={toggleVoiceMode}
          >
            <MaterialCommunityIcons 
              name={showVoiceInterface ? "phone-off" : "phone"} 
              size={24} 
              color={showVoiceInterface ? "#FFF" : "#9333EA"} 
            />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.headerButton}
            onPress={toggleHeart}
          >
            <MaterialCommunityIcons 
              name={heartActive ? "heart" : "heart-outline"} 
              size={24} 
              color="#9333EA" 
            />
          </TouchableOpacity>
          <TouchableOpacity 
            style={styles.headerButton}
            onPress={toggleMenu}
          >
            <Feather name="menu" size={24} color="#9333EA" />
          </TouchableOpacity>
        </View>
      </View>
      
      {/* Menu Modal */}
      <Modal
        animationType="fade"
        transparent={true}
        visible={menuVisible}
        onRequestClose={toggleMenu}
      >
        <TouchableOpacity 
          style={styles.menuOverlay}
          activeOpacity={1}
          onPress={toggleMenu}
        >
          <View style={styles.menuContainer}>
            <TouchableOpacity 
              style={styles.menuItem}
              onPress={goToProfile}
            >
              <Feather name="user" size={20} color="white" />
              <Text style={styles.menuItemText}>Profile</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={styles.menuItem}
              onPress={goToFeed}
            >
              <Feather name="book" size={20} color="white" />
              <Text style={styles.menuItemText}>Feed</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={styles.menuItem}
              onPress={goToMoodEngine}
            >
              <MaterialCommunityIcons name="brain" size={20} color="white" />
              <Text style={styles.menuItemText}>Mood Engine</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
      
      {/* Enhanced Error display with retry functionality */}
      {error && (
        <View style={[
          styles.errorContainer,
          error.type === ErrorType.WARNING ? styles.warningContainer : null
        ]}>
          <View style={styles.errorHeader}>
            <Text style={[
              styles.errorTitle,
              error.type === ErrorType.WARNING ? styles.warningText : styles.errorText
            ]}>
              {error.message}
            </Text>
            {error.retryable && retryState.attempts < retryState.maxAttempts && (
              <TouchableOpacity 
                style={styles.retryButton}
                onPress={retryMessage}
                disabled={retryState.isRetrying}
              >
                {retryState.isRetrying ? (
                  <ActivityIndicator size="small" color="#FFF" />
                ) : (
                  <Text style={styles.retryButtonText}>Retry</Text>
                )}
              </TouchableOpacity>
            )}
          </View>
          <Text style={[
            styles.errorActionable,
            error.type === ErrorType.WARNING ? styles.warningText : styles.errorText
          ]}>
            {error.actionable}
          </Text>
          {retryState.attempts > 0 && (
            <Text style={styles.retryInfo}>
              Retry attempt {retryState.attempts} of {retryState.maxAttempts}
            </Text>
          )}
          {!isConnected && (
            <Text style={styles.connectivityInfo}>
              📶 {connectionType === 'cellular' ? 'Poor cellular signal' : 'No connection'}
            </Text>
          )}
        </View>
      )}
      
      {/* Messages */}
      {loading && messages.length === 0 ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.userBubble} />
          <Text style={styles.loadingText}>Loading messages...</Text>
        </View>
      ) : (
        <FlatList
          ref={flatListRef}
          data={[...messages].reverse()}
          renderItem={renderMessageItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.messagesList}
          inverted={true}
          onContentSizeChange={() => {
            // Scroll to bottom on content change - this should still work correctly
            // For an inverted list, "end" is the visual bottom (the actual start of the data array)
            // if (!isRefreshing) flatListRef.current?.scrollToEnd({ animated: false });
          }}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>
                No messages yet. Start a conversation!
              </Text>
            </View>
          }
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={onRefresh}
              tintColor={COLORS.userBubble}
              colors={[COLORS.userBubble]}
            />
          }
        />
      )}
      
      {/* Typing indicator - Only show if waiting for Maya's response */}
      {waitingForMaya && (
        <View style={styles.typingContainer}>
          <View style={styles.typingBubble}>
            <Animated.View style={[styles.typingDot, { opacity: dot1Opacity }]} />
            <Animated.View style={[styles.typingDot, { opacity: dot2Opacity }]} />
            <Animated.View style={[styles.typingDot, { opacity: dot3Opacity }]} />
          </View>
          <Text style={styles.typingText}>Maya is thinking...</Text>
        </View>
      )}
      
      {/* Input area - Unified rounded bar like web */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 50 : 0}
        style={styles.inputContainer}
      >
        {/* Image Preview */}
        {selectedImages.length > 0 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.imagePreviewContainer}
          >
            {selectedImages.map((image, index) => (
              <View key={index} style={styles.imagePreviewWrapper}>
                <Image source={{ uri: image.uri }} style={styles.imagePreview} />
                <TouchableOpacity
                  style={styles.removeImageButton}
                  onPress={() => removeImage(index)}
                >
                  <Feather name="x" size={16} color="#FFF" />
                </TouchableOpacity>
              </View>
            ))}
          </ScrollView>
        )}

        {/* Unified Input Bar */}
        <View style={styles.unifiedInputBar}>
          {/* Plus Button with Attachment Menu */}
          <View style={styles.attachMenuContainer}>
            <TouchableOpacity
              style={styles.plusButton}
              onPress={() => setShowAttachMenu(!showAttachMenu)}
              disabled={sendingMessage || !roomId || !user?.id}
            >
              <Feather
                name="plus"
                size={22}
                color={sendingMessage || !roomId || !user?.id ? COLORS.placeholderText : '#FFF'}
                style={{ transform: [{ rotate: showAttachMenu ? '45deg' : '0deg' }] }}
              />
            </TouchableOpacity>

            {/* Attachment Menu Popup */}
            {showAttachMenu && (
              <View style={styles.attachMenuPopup}>
                <TouchableOpacity
                  style={styles.attachMenuItem}
                  onPress={() => { takePhoto(); setShowAttachMenu(false); }}
                >
                  <Feather name="camera" size={20} color={COLORS.sendButton} />
                  <Text style={styles.attachMenuText}>Camera</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.attachMenuItem}
                  onPress={() => { pickImages(); setShowAttachMenu(false); }}
                >
                  <Feather name="image" size={20} color={COLORS.sendButton} />
                  <Text style={styles.attachMenuText}>Photo</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>

          {/* Text Input */}
          <TextInput
            ref={inputRef}
            style={styles.unifiedInput}
            value={inputText}
            onChangeText={handleInputTextChange}
            placeholder={!roomId || !user?.id ? "Loading..." : "Message Maya..."}
            placeholderTextColor={COLORS.placeholderText}
            multiline={true}
            maxLength={2000}
            autoCapitalize="sentences"
            blurOnSubmit={false}
            editable={!sendingMessage && !!roomId && !!user?.id}
            onFocus={() => setShowAttachMenu(false)}
          />

          {/* Right Side Buttons */}
          <View style={styles.inputRightButtons}>
            {/* Voice Button */}
            <TouchableOpacity
              style={styles.inputIconButton}
              onPress={() => setShowVoiceInterface(true)}
              disabled={sendingMessage || !roomId || !user?.id}
            >
              <Feather
                name="mic"
                size={20}
                color={sendingMessage || !roomId || !user?.id ? COLORS.placeholderText : '#FFF'}
              />
            </TouchableOpacity>

            {/* Send Button */}
            <TouchableOpacity
              style={[
                styles.sendButton,
                ((!inputText.trim() && selectedImages.length === 0) || sendingMessage || !roomId || !user?.id) && styles.sendButtonDisabled
              ]}
              onPress={onSendPress}
              disabled={(!inputText.trim() && selectedImages.length === 0) || sendingMessage || !roomId || !user?.id}
            >
              {sendingMessage ? (
                <ActivityIndicator size="small" color="#FFF" />
              ) : (
                <Feather
                  name="send"
                  size={18}
                  color={(inputText.trim() || selectedImages.length > 0) && !sendingMessage && roomId && user?.id ? '#FFF' : 'rgba(255,255,255,0.5)'}
                />
              )}
            </TouchableOpacity>
          </View>
        </View>

        {(!user?.id || !roomId) && (
          <Text style={styles.sessionWarning}>
            Waiting for session to initialize...
          </Text>
        )}
      </KeyboardAvoidingView>
      
      {/* Full Screen Image Viewer Modal */}
      <Modal
        visible={!!fullScreenImage}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setFullScreenImage(null)}
      >
        <View style={styles.fullScreenImageOverlay}>
          {/* Close button */}
          <TouchableOpacity
            style={styles.fullScreenCloseButton}
            onPress={() => setFullScreenImage(null)}
          >
            <Feather name="x" size={28} color="#FFF" />
          </TouchableOpacity>

          {/* Download button */}
          <TouchableOpacity
            style={styles.fullScreenDownloadButton}
            onPress={() => fullScreenImage && saveImageToPhotos(fullScreenImage)}
            disabled={savingImage}
          >
            {savingImage ? (
              <ActivityIndicator size="small" color="#FFF" />
            ) : (
              <Feather name="download" size={24} color="#FFF" />
            )}
          </TouchableOpacity>

          {/* Full screen image */}
          {fullScreenImage && (
            <Image
              source={{ uri: fullScreenImage }}
              style={styles.fullScreenImage}
              resizeMode="contain"
            />
          )}
        </View>
      </Modal>

      {/* xAI Voice Chat - Ultra-low latency speech-to-speech */}
      <XaiVoiceChat
        visible={showVoiceInterface}
        onClose={() => setShowVoiceInterface(false)}
        mayaAvatar={mayaProfile?.avatar_url || undefined}
        onTranscript={(text) => console.log('[XaiVoice] User said:', text)}
        onResponse={(text) => console.log('[XaiVoice] Maya said:', text)}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: COLORS.header,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  headerLeftSection: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  mayaAvatarWrapper: {
    width: 44,
    height: 44,
    borderRadius: 22,
    marginRight: 12,
    alignItems: 'center',
    justifyContent: 'center',
    // Add shadow for better appearance
    shadowColor: '#9333EA',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 5,
    elevation: 5,
  },
  mayaAvatarGradient: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2.5,
    borderColor: '#9333EA', // Primary purple color
    // Create a gradient-like effect using different border colors
    borderRightColor: '#A855F7', // Medium purple
    borderBottomColor: '#C084FC', // Light purple
    padding: 0,
    overflow: 'hidden',
  },
  headerAvatar: {
    width: '100%',
    height: '100%',
    borderRadius: 18, // Slightly smaller to account for border
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
  },
  headerButtons: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerButton: {
    padding: 8,
    marginLeft: 8,
  },
  menuOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-start',
    alignItems: 'flex-end',
  },
  menuContainer: {
    backgroundColor: '#1E1E22',
    borderRadius: 10,
    marginTop: 60,
    marginRight: 20,
    paddingVertical: 10,
    paddingHorizontal: 5,
    minWidth: 150,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 15,
  },
  menuItemText: {
    color: 'white',
    fontSize: 16,
    marginLeft: 15,
  },
  clearButton: {
    marginRight: 12,
  },
  profileButton: {
    padding: 8,
  },
  messagesList: {
    padding: 16,
    paddingBottom: 48, // Extra padding at bottom
  },
  messageContainer: {
    flexDirection: 'row',
    marginBottom: 10,
    maxWidth: '100%',
  },
  messageContentContainer: {
    maxWidth: '75%',
    flexDirection: 'column',
  },
  userMessageContainer: {
    justifyContent: 'flex-end',
  },
  assistantMessageContainer: {
    justifyContent: 'flex-start',
  },
  avatarContainer: {
    marginHorizontal: 8,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#333',
  },
  messageBubble: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 18,
  },
  userBubble: {
    backgroundColor: COLORS.userBubble,
    borderBottomRightRadius: 4,
  },
  mayaBubble: {
    backgroundColor: COLORS.mayaBubble,
    borderBottomLeftRadius: 4,
  },
  errorBubble: {
    backgroundColor: COLORS.errorBackground,
    borderWidth: 1,
    borderColor: COLORS.errorText,
  },
  messageText: {
    fontSize: 16,
    lineHeight: 22,
  },
  userText: {
    color: COLORS.userText,
  },
  mayaText: {
    color: COLORS.mayaText,
  },
  errorText: {
    color: COLORS.errorText,
  },
  timestamp: {
    fontSize: 11,
    color: COLORS.timestamp,
    marginTop: 4,
    opacity: 0.7,
  },
  timestampRight: {
    alignSelf: 'flex-end',
    marginRight: 4,
  },
  timestampLeft: {
    alignSelf: 'flex-start',
    marginLeft: 4,
  },
  inputContainer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.05)',
    backgroundColor: COLORS.background,
  },
  inputInner: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    position: 'relative',
  },
  input: {
    flex: 1,
    backgroundColor: COLORS.inputBackground,
    borderRadius: 24,
    minHeight: 48,
    maxHeight: 120,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 14,
    paddingRight: 48,
    paddingLeft: 16, // Space for image picker button is handled by button itself
    color: COLORS.inputText,
    fontSize: 16,
    lineHeight: 20,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.sendButton,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: 'rgba(100, 50, 200, 0.5)',
  },
  // Unified Input Bar Styles (matching web)
  unifiedInputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    backgroundColor: COLORS.inputBackground,
    borderRadius: 24,
    paddingVertical: 6,
    paddingHorizontal: 6,
    gap: 4,
  },
  attachMenuContainer: {
    position: 'relative',
  },
  plusButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(147, 51, 234, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  attachMenuPopup: {
    position: 'absolute',
    bottom: 50,
    left: 0,
    backgroundColor: '#1A1A1E',
    borderRadius: 16,
    padding: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
    minWidth: 140,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  attachMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    gap: 12,
  },
  attachMenuText: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: '500',
  },
  unifiedInput: {
    flex: 1,
    minHeight: 40,
    maxHeight: 120,
    paddingHorizontal: 8,
    paddingVertical: 10,
    color: COLORS.inputText,
    fontSize: 16,
    lineHeight: 20,
  },
  inputRightButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  inputIconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    color: '#FFFFFF',
    fontSize: 16,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  emptyText: {
    color: '#FFFFFF',
    opacity: 0.6,
    textAlign: 'center',
    fontSize: 16,
  },
  typingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  typingBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 10,
    paddingVertical: 4,
    paddingHorizontal: 8,
    marginRight: 8,
  },
  typingDot: {
    height: 6,
    width: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.7)',
    marginHorizontal: 2,
    opacity: 0.6,
  },
  typingText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 12,
  },
  // Enhanced error display styles
  errorContainer: {
    backgroundColor: COLORS.errorBackground,
    padding: 12,
    margin: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.errorText,
  },
  warningContainer: {
    backgroundColor: COLORS.warningBackground,
    borderColor: COLORS.warningText,
  },
  errorHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  errorTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    flex: 1,
  },
  errorActionable: {
    fontSize: 12,
    opacity: 0.8,
  },
  warningText: {
    color: COLORS.warningText,
  },
  retryButton: {
    backgroundColor: COLORS.retryButton,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    marginLeft: 8,
  },
  retryButtonText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: 'bold',
  },
  retryInfo: {
    fontSize: 10,
    color: COLORS.timestamp,
    marginTop: 4,
  },
  connectivityInfo: {
    fontSize: 10,
    color: COLORS.warningText,
    marginTop: 2,
  },
  sessionWarning: {
    color: COLORS.timestamp,
    fontSize: 12,
    textAlign: 'center',
    marginTop: 8,
  },
  // Image picker and preview styles
  imagePickerButton: {
    padding: 8,
    marginRight: 8,
  },
  imagePreviewContainer: {
    maxHeight: 100,
    marginBottom: 8,
  },
  imagePreviewWrapper: {
    position: 'relative',
    marginRight: 8,
  },
  imagePreview: {
    width: 80,
    height: 80,
    borderRadius: 8,
    backgroundColor: COLORS.inputBackground,
  },
  removeImageButton: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    borderRadius: 12,
    width: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  messageImage: {
    width: '100%',
    maxWidth: 250,
    height: 200,
    borderRadius: 12,
  },
  messageImageContainer: {
    position: 'relative',
    marginBottom: 8,
  },
  downloadButton: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    borderRadius: 16,
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  // Full screen image viewer styles
  fullScreenImageOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.95)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  fullScreenCloseButton: {
    position: 'absolute',
    top: 50,
    right: 20,
    zIndex: 10,
    padding: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 20,
  },
  fullScreenDownloadButton: {
    position: 'absolute',
    top: 50,
    left: 20,
    zIndex: 10,
    padding: 12,
    backgroundColor: COLORS.sendButton,
    borderRadius: 24,
  },
  fullScreenImage: {
    width: '100%',
    height: '80%',
  },
});

export default ChatScreenNew; 