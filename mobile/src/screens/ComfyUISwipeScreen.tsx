import React, { useState, useEffect, useRef, useCallback } from 'react'
import {
  View,
  Text,
  Dimensions,
  Animated,
  Image,
  StyleSheet,
  Alert,
  ActivityIndicator,
  TouchableOpacity,
  StatusBar,
} from 'react-native'
import { PanGestureHandler, State } from 'react-native-gesture-handler'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useNavigation } from '@react-navigation/native'
import Constants from 'expo-constants'
import { supabase } from '../lib/supabase/client'

const { width: screenWidth, height: screenHeight } = Dimensions.get('window')
const CARD_HEIGHT = screenHeight * 0.8 // Increased from 0.7 to 0.8 to make larger
const SWIPE_THRESHOLD = screenWidth * 0.4

// Constants
const MAYA_SYSTEM_USER_ID = '61770892-9e5b-46a5-b622-568be7066664';
const DEFAULT_MAYA_AVATAR = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA0MCA0MCIgZmlsbD0ibm9uZSI+PGNpcmNsZSBjeD0iMjAiIGN5PSIyMCIgcj0iMjAiIGZpbGw9IiMxZTFlMjIiLz48dGV4dCB4PSI1MCUiIHk9IjUwJSIgZG9taW5hbnQtYmFzZWxpbmU9Im1pZGRsZSIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZmlsbD0id2hpdGUiIGZvbnQtc2l6ZT0iMTYiIGZvbnQtZmFtaWx5PSJBcmlhbCwgc2Fucy1zZXJpZiI+TTwvdGV4dD48L3N2Zz4=';

interface ComfyUIImage {
  id: string
  image_url: string
  style: string
  model_used: string
  nsfw_safe: boolean
  comfyui_prompt?: string
  metadata: any
  created_at: string
}

interface Profile {
  id: string;
  name?: string | null;
  avatar_url?: string | null;
}

interface SwipeCardProps {
  image: ComfyUIImage
  isTopCard: boolean
  onSwipe: (imageId: string, direction: 'left' | 'right') => void
  zIndex: number
  scale: number
}

const SwipeCard: React.FC<SwipeCardProps> = ({ 
  image, 
  isTopCard, 
  onSwipe, 
  zIndex, 
  scale 
}) => {
  const pan = useRef(new Animated.ValueXY()).current
  const rotation = useRef(new Animated.Value(0)).current

  const resetCard = () => {
    Animated.spring(pan, {
      toValue: { x: 0, y: 0 },
      useNativeDriver: false,
    }).start()
    
    Animated.spring(rotation, {
      toValue: 0,
      useNativeDriver: false,
    }).start()
  }

  const handleGestureEvent = Animated.event(
    [{ nativeEvent: { translationX: pan.x, translationY: pan.y } }],
    { 
      useNativeDriver: false,
      listener: (event: any) => {
        // Update rotation based on horizontal movement
        const { translationX } = event.nativeEvent
        const rotationValue = translationX / screenWidth * 30 // Max 30 degrees
        rotation.setValue(rotationValue)
      }
    }
  )

  const handleStateChange = (event: any) => {
    if (event.nativeEvent.oldState === State.ACTIVE) {
      const { translationX } = event.nativeEvent
      
      if (Math.abs(translationX) > SWIPE_THRESHOLD) {
        // Swipe detected
        const direction = translationX > 0 ? 'right' : 'left'
        const destinationX = direction === 'right' ? screenWidth : -screenWidth
        
        Animated.timing(pan, {
          toValue: { x: destinationX, y: 0 },
          duration: 300,
          useNativeDriver: false,
        }).start(() => {
          onSwipe(image.id, direction)
        })
      } else {
        // Reset card position
        resetCard()
      }
    }
  }

  const getStatusColor = (nsfw_safe: boolean) => {
    return nsfw_safe ? '#10B981' : '#EF4444' // Green for safe, red for NSFW
  }

  const getStatusText = (nsfw_safe: boolean) => {
    return nsfw_safe ? 'SFW' : 'NSFW'
  }

  return (
    <PanGestureHandler
      onGestureEvent={isTopCard ? handleGestureEvent : undefined}
      onHandlerStateChange={isTopCard ? handleStateChange : undefined}
      enabled={isTopCard}
    >
      <Animated.View
        style={[
          styles.card,
          {
            zIndex,
            transform: [
              { translateX: isTopCard ? pan.x : 0 },
              { translateY: isTopCard ? pan.y : 0 },
              { rotate: isTopCard ? rotation.interpolate({
                inputRange: [-30, 0, 30],
                outputRange: ['-30deg', '0deg', '30deg'],
                extrapolate: 'clamp',
              }) : '0deg' },
              { scale },
            ],
          },
        ]}
      >
        {/* Image */}
        <Image source={{ uri: image.image_url }} style={styles.cardImage} />
        
        {/* Overlay Gradient */}
        <View style={styles.cardOverlay} />
        
        {/* Content */}
        <View style={styles.cardContent}>
          {/* Top Status Badges */}
          <View style={styles.topBadges}>
            <View style={[styles.badge, { backgroundColor: getStatusColor(image.nsfw_safe) }]}>
              <Text style={styles.badgeText}>{getStatusText(image.nsfw_safe)}</Text>
            </View>
            <View style={[styles.badge, styles.modelBadge]}>
              <Text style={styles.badgeText}>{image.model_used}</Text>
            </View>
          </View>
          
          {/* Bottom Info */}
          <View style={styles.bottomInfo}>
            <Text style={styles.styleText}>{image.style}</Text>
            {image.comfyui_prompt && (
              <Text style={styles.promptText} numberOfLines={3}>
                {image.comfyui_prompt}
              </Text>
            )}
            <Text style={styles.timeText}>
              {new Date(image.created_at).toLocaleDateString()}
            </Text>
          </View>
        </View>
        
        {/* Swipe Indicators */}
        {isTopCard && (
          <>
            <Animated.View
              style={[
                styles.swipeIndicator,
                styles.likeIndicator,
                {
                  opacity: pan.x.interpolate({
                    inputRange: [0, SWIPE_THRESHOLD],
                    outputRange: [0, 1],
                    extrapolate: 'clamp',
                  }),
                },
              ]}
            >
              <Text style={styles.swipeText}>APPROVE</Text>
            </Animated.View>
            
            <Animated.View
              style={[
                styles.swipeIndicator,
                styles.passIndicator,
                {
                  opacity: pan.x.interpolate({
                    inputRange: [-SWIPE_THRESHOLD, 0],
                    outputRange: [1, 0],
                    extrapolate: 'clamp',
                  }),
                },
              ]}
            >
              <Text style={styles.swipeText}>DELETE</Text>
            </Animated.View>
          </>
        )}
      </Animated.View>
    </PanGestureHandler>
  )
}

export default function ComfyUISwipeScreen() {
  const navigation = useNavigation()
  const [images, setImages] = useState<ComfyUIImage[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [isProcessing, setIsProcessing] = useState(false)
  const [mayaProfile, setMayaProfile] = useState<Profile | null>(null)

  // API Configuration
  const SERIES_GENERATOR_URL = Constants.expoConfig?.extra?.seriesGeneratorUrl || 'http://localhost:8009'

  // Fetch Maya's profile
  const fetchMayaProfile = useCallback(async () => {
    if (!supabase) return
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', MAYA_SYSTEM_USER_ID)
        .single();
        
      if (data) {
        setMayaProfile(data);
      }
    } catch (error) {
      console.error('Error fetching Maya profile:', error);
    }
  }, [supabase])

  useEffect(() => {
    console.log('🔧 ComfyUI using API URL:', SERIES_GENERATOR_URL)
    fetchMayaProfile()
    fetchImages()
  }, [fetchMayaProfile])

  const fetchImages = async () => {
    try {
      setIsLoading(true)
      console.log('Fetching ComfyUI images from:', `${SERIES_GENERATOR_URL}/comfyui-images`)
      
      const response = await fetch(`${SERIES_GENERATOR_URL}/comfyui-images?limit=10`)
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }
      
      const data = await response.json()
      console.log('Fetched ComfyUI images:', data.length)
      
      setImages(data)
      setCurrentIndex(0)
    } catch (error) {
      console.error('Error fetching ComfyUI images:', error)
      Alert.alert('Error', 'Failed to load images. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  const handleSwipe = async (imageId: string, direction: 'left' | 'right') => {
    if (isProcessing) return
    
    setIsProcessing(true)
    
    try {
      const action = direction === 'right' ? 'approve' : 'delete'
      console.log(`Swiping ${action} on image:`, imageId)
      
      const response = await fetch(`${SERIES_GENERATOR_URL}/comfyui-swipe`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          comfyui_image_id: imageId,
          action: action,
        }),
      })
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }
      
      const result = await response.json()
      console.log('Swipe result:', result)
      
      // Move to next card
      setCurrentIndex(prev => prev + 1)
      
      // Show success message
      const message = direction === 'right' 
        ? 'Image approved and added to feed!' 
        : 'Image deleted'
      
      // You could add a toast notification here instead of alert
      console.log(message)
      
      // If we're running low on images, fetch more
      if (currentIndex + 1 >= images.length - 2) {
        fetchImages()
      }
      
    } catch (error) {
      console.error('Error processing swipe:', error)
      Alert.alert('Error', 'Failed to process action. Please try again.')
      
      // Reset the current index to retry
      setCurrentIndex(prev => Math.max(0, prev))
    } finally {
      setIsProcessing(false)
    }
  }

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <StatusBar barStyle="light-content" backgroundColor="#111827" />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#A855F7" />
          <Text style={styles.loadingText}>Loading ComfyUI images...</Text>
        </View>
      </SafeAreaView>
    )
  }

  if (images.length === 0) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <StatusBar barStyle="light-content" backgroundColor="#111827" />
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity 
            style={styles.headerLeftSection}
            onPress={() => navigation.navigate('Main' as never)}
            activeOpacity={0.7}
          >
            <View style={styles.mayaAvatarWrapper}>
              <View style={styles.mayaAvatarGradient}>
                <Image
                  source={{ uri: mayaProfile?.avatar_url || DEFAULT_MAYA_AVATAR }}
                  style={styles.headerAvatar}
                />
              </View>
            </View>
            <Text style={styles.headerTitle}>Maya HQ</Text>
          </TouchableOpacity>
          <View style={styles.headerButtons}>
            <TouchableOpacity 
              style={styles.chatButton}
              onPress={() => navigation.navigate('Chat' as never)}
            >
              <Ionicons name="chatbubble-outline" size={24} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>
        <View style={styles.emptyContainer}>
          <Ionicons name="images-outline" size={64} color="#9CA3AF" />
          <Text style={styles.emptyTitle}>No images to review</Text>
          <Text style={styles.emptySubtitle}>All ComfyUI images have been processed</Text>
          <TouchableOpacity style={styles.refreshButton} onPress={fetchImages}>
            <Text style={styles.refreshButtonText}>Check for new images</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    )
  }

  if (currentIndex >= images.length) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <StatusBar barStyle="light-content" backgroundColor="#111827" />
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity 
            style={styles.headerLeftSection}
            onPress={() => navigation.navigate('Main' as never)}
            activeOpacity={0.7}
          >
            <View style={styles.mayaAvatarWrapper}>
              <View style={styles.mayaAvatarGradient}>
                <Image
                  source={{ uri: mayaProfile?.avatar_url || DEFAULT_MAYA_AVATAR }}
                  style={styles.headerAvatar}
                />
              </View>
            </View>
            <Text style={styles.headerTitle}>Maya HQ</Text>
          </TouchableOpacity>
          <View style={styles.headerButtons}>
            <TouchableOpacity 
              style={styles.chatButton}
              onPress={() => navigation.navigate('Chat' as never)}
            >
              <Ionicons name="chatbubble-outline" size={24} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>
        <View style={styles.emptyContainer}>
          <Ionicons name="checkmark-circle" size={64} color="#10B981" />
          <Text style={styles.emptyTitle}>All done!</Text>
          <Text style={styles.emptySubtitle}>You've reviewed all available images</Text>
          <TouchableOpacity style={styles.refreshButton} onPress={fetchImages}>
            <Text style={styles.refreshButtonText}>Load more images</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle="light-content" backgroundColor="#111827" />
      
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity 
          style={styles.headerLeftSection}
          onPress={() => navigation.navigate('Main' as never)}
          activeOpacity={0.7}
        >
          <View style={styles.mayaAvatarWrapper}>
            <View style={styles.mayaAvatarGradient}>
              <Image
                source={{ uri: mayaProfile?.avatar_url || DEFAULT_MAYA_AVATAR }}
                style={styles.headerAvatar}
              />
            </View>
          </View>
          <Text style={styles.headerTitle}>Maya HQ</Text>
        </TouchableOpacity>
        <View style={styles.headerButtons}>
          <Text style={styles.counterText}>
            {currentIndex + 1} / {images.length}
          </Text>
          <TouchableOpacity 
            style={styles.chatButton}
            onPress={() => navigation.navigate('Chat' as never)}
          >
            <Ionicons name="chatbubble-outline" size={24} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Cards Stack */}
      <View style={styles.cardStack}>
        {images.slice(currentIndex, currentIndex + 3).map((image, index) => {
          const actualIndex = currentIndex + index
          const isTopCard = index === 0
          const zIndex = 3 - index
          const scale = 1 - (index * 0.05)
          
          return (
            <SwipeCard
              key={`${image.id}-${actualIndex}`}
              image={image}
              isTopCard={isTopCard}
              onSwipe={handleSwipe}
              zIndex={zIndex}
              scale={scale}
            />
          )
        })}
      </View>

      {/* Processing Indicator */}
      {isProcessing && (
        <View style={styles.processingOverlay}>
          <ActivityIndicator size="large" color="#A855F7" />
          <Text style={styles.processingText}>Processing...</Text>
        </View>
      )}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#111827',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#374151',
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
  counterText: {
    fontSize: 14,
    color: '#9CA3AF',
    marginRight: 16,
  },
  chatButton: {
    padding: 8,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#9CA3AF',
    fontSize: 16,
    marginTop: 12,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  emptyTitle: {
    fontSize: 24,
    fontWeight: '600',
    color: '#fff',
    marginTop: 16,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 16,
    color: '#9CA3AF',
    marginTop: 8,
    textAlign: 'center',
  },
  refreshButton: {
    backgroundColor: '#A855F7',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    marginTop: 24,
  },
  refreshButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  cardStack: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 84, // Same as FeedScreen - accounts for app-level bottom navigation
  },
  card: {
    position: 'absolute',
    width: screenWidth - 32,
    height: CARD_HEIGHT,
    borderRadius: 16,
    backgroundColor: '#1F2937',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  cardImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  cardOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
  },
  cardContent: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    padding: 16,
    justifyContent: 'space-between',
  },
  topBadges: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  badge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
  },
  modelBadge: {
    backgroundColor: '#A855F7',
  },
  badgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  bottomInfo: {
    alignItems: 'flex-start',
  },
  styleText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 8,
  },
  promptText: {
    color: '#E5E7EB',
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 8,
  },
  timeText: {
    color: '#9CA3AF',
    fontSize: 12,
  },
  swipeIndicator: {
    position: 'absolute',
    top: '50%',
    transform: [{ translateY: -25 }],
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 3,
  },
  likeIndicator: {
    right: 20,
    borderColor: '#10B981',
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
  },
  passIndicator: {
    left: 20,
    borderColor: '#EF4444',
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
  },
  swipeText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
  processingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  processingText: {
    color: '#fff',
    fontSize: 16,
    marginTop: 12,
  },
}) 