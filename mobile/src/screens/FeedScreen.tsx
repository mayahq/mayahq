import React, { useEffect, useState, useCallback } from 'react'
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  Alert,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  StatusBar,
  Dimensions,
  Share,
  Modal,
  ActionSheetIOS,
  Platform,
  Linking,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useAuthContext } from '../auth/AuthProvider'
import { supabase } from '../lib/supabase/client'
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons'
// import * as Haptics from 'expo-haptics'
// import * as Clipboard from 'expo-clipboard'
import * as Sharing from 'expo-sharing'
import * as FileSystem from 'expo-file-system'
import FilterModal from '../components/FilterModal'
import RejectModal from '../components/RejectModal'
import EditModal from '../components/EditModal'
import CommentsSection from '../components/CommentsSection'
import AddComment from '../components/AddComment'
import ModifiersModal, { Modifiers } from '../components/ModifiersModal'
import { useNavigation } from '@react-navigation/native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { Video, ResizeMode } from 'expo-av'

// Define types
interface Profile {
  id: string;
  name?: string | null;
  avatar_url?: string | null;
}

interface FeedItem {
  id: string;
  created_at: string;
  updated_at: string;
  created_by_maya_profile_id: string;
  item_type: string;
  source_system: string;
  content_data: any;
  status: 'pending_review' | 'approved' | 'rejected' | 'approved_for_posting' | 'posted_social' | 'error_posting' | 'prompt_generated' | 'image_generated_pending_review' | 'series_generated';
  reviewed_by_user_id?: string | null;
  reviewed_at?: string | null;
  approved_at?: string | null;
  admin_review_notes?: string | null;
  original_context?: any | null;
  generated_series_data?: any[] | null;
  parent_feed_item_id?: string | null;
  creator_profile_name?: string | null;
  creator_profile_avatar_url?: string | null;
}

interface FeedItemComment {
  id: string;
  feed_item_id: string;
  user_id: string;
  comment_text: string;
  created_at: string;
  updated_at: string;
  user_profile: Profile | null;
}

interface FeedResponse {
  items: FeedItem[];
  total_count: number;
  page: number;
  limit: number;
  total_pages: number;
}

interface FilterOptions {
  status: string
  itemType: string
  sourceSystem: string
  dateFrom: Date | null
  dateTo: Date | null
}

// Constants
const MAYA_SYSTEM_USER_ID = '61770892-9e5b-46a5-b622-568be7066664';
const DEFAULT_MAYA_AVATAR = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA0MCA0MCIgZmlsbD0ibm9uZSI+PGNpcmNsZSBjeD0iMjAiIGN5PSIyMCIgcj0iMjAiIGZpbGw9IiMxZTFlMjIiLz48dGV4dCB4PSI1MCUiIHk9IjUwJSIgZG9taW5hbnQtYmFzZWxpbmU9Im1pZGRsZSIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZmlsbD0id2hpdGUiIGZvbnQtc2l6ZT0iMTYiIGZvbnQtZmFtaWx5PSJBcmlhbCwgc2Fucy1zZXJpZiI+TTwvdGV4dD48L3N2Zz4=';

export default function FeedScreen() {
  const { user } = useAuthContext()
  const navigation = useNavigation()
  
  // Feed state
  const [feedItems, setFeedItems] = useState<FeedItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [hasNextPage, setHasNextPage] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [totalCount, setTotalCount] = useState(0)

  // Filter state
  const [isFilterModalVisible, setIsFilterModalVisible] = useState(false)
  const [activeFilters, setActiveFilters] = useState<FilterOptions>({
    status: '',
    itemType: '',
    sourceSystem: '',
    dateFrom: null,
    dateTo: null,
  })

  // Action modals state
  const [selectedItem, setSelectedItem] = useState<FeedItem | null>(null)
  const [isRejectModalVisible, setIsRejectModalVisible] = useState(false)
  const [isEditModalVisible, setIsEditModalVisible] = useState(false)
  const [isProcessingAction, setIsProcessingAction] = useState(false)

  // Series state
  const [seriesViewMasterItem, setSeriesViewMasterItem] = useState<FeedItem | null>(null)
  const [seriesViewItems, setSeriesViewItems] = useState<FeedItem[]>([])
  const [isLoadingSeriesView, setIsLoadingSeriesView] = useState(false)

  // Comments state
  const [comments, setComments] = useState<{[itemId: string]: FeedItemComment[]}>({})
  const [commentsLoaded, setCommentsLoaded] = useState<{[itemId: string]: boolean}>({})
  const [isLoadingComments, setIsLoadingComments] = useState<{[itemId: string]: boolean}>({})
  const [isSubmittingComment, setIsSubmittingComment] = useState(false)
  const [expandedComments, setExpandedComments] = useState<{[itemId: string]: boolean}>({})

  // Like system state
  const [userLikedItems, setUserLikedItems] = useState<Set<string>>(new Set())
  const [isLoadingUserLikes, setIsLoadingUserLikes] = useState(false)
  const [isProcessingLike, setIsProcessingLike] = useState<{[itemId: string]: boolean}>({})

  // Share button loading state
  const [isSharingImage, setIsSharingImage] = useState<{[imageUrl: string]: boolean}>({})

  // Scene generation loading state
  const [isGeneratingScene, setIsGeneratingScene] = useState<{[itemId: string]: boolean}>({})

  // Remix state
  const [isRemixModalVisible, setIsRemixModalVisible] = useState(false)
  const [itemToRemix, setItemToRemix] = useState<FeedItem | null>(null)
  const [isRemixing, setIsRemixing] = useState<{[itemId: string]: boolean}>({})

  // Video generation state
  const [isGeneratingVideo, setIsGeneratingVideo] = useState<{[itemId: string]: boolean}>({})

  // Image aspect ratio state (measured from actual image dimensions)
  const [imageAspectRatios, setImageAspectRatios] = useState<{[url: string]: number}>({})

  // Social media scheduling state
  const [socialPlatforms, setSocialPlatforms] = useState<Array<{
    id: string;
    name: string;
    display_name: string;
    icon_name: string;
  }>>([])
  const [isLoadingSocialPlatforms, setIsLoadingSocialPlatforms] = useState(false)
  const [isSocialSchedulingModalVisible, setIsSocialSchedulingModalVisible] = useState(false)
  const [selectedPlatforms, setSelectedPlatforms] = useState<{[itemId: string]: string[]}>({})
  const [itemForSocialPosting, setItemForSocialPosting] = useState<FeedItem | null>(null)

  // Maya's profile state
  const [mayaProfile, setMayaProfile] = useState<Profile | null>(null)

  // API URLs
  const MEMORY_WORKER_API_URL = process.env.EXPO_PUBLIC_MAYA_API_ENDPOINT || process.env.EXPO_PUBLIC_MEMORY_WORKER_URL || 'https://mayahq-production.up.railway.app'
  const WEBSITE_API_URL = process.env.EXPO_PUBLIC_WEBSITE_URL || 'https://maya-hq.vercel.app'

  // Create a simple profile from user data
  const userProfile: Profile | null = user ? {
    id: user.id,
    name: user.user_metadata?.name || user.email?.split('@')[0] || 'User',
    avatar_url: user.user_metadata?.avatar_url || null
  } : null

  // Series functionality
  const isSeriesItem = (item: FeedItem): boolean => {
    return item.status === 'series_generated'
  }

  const getSeriesCount = (item: FeedItem): number => {
    // For now, show "Series" without count since we need to fetch from API
    return 0
  }

  const openSeriesView = async (item: FeedItem) => {
    console.log('Opening series view for item:', item.id)
    setSeriesViewMasterItem(item)
    setSeriesViewItems([])
    
    // Fetch series variations using the new API endpoint
    setIsLoadingSeriesView(true)
    try {
      const apiUrl = `${MEMORY_WORKER_API_URL}/api/v1/feed/items?parent_feed_item_id=${item.id}&limit=50`
      console.log('Fetching series variations from:', apiUrl)
      
      const response = await fetch(apiUrl)
      
      if (!response.ok) {
        throw new Error(`Failed to fetch series variations: ${response.status}`)
      }
      
      const data: FeedResponse = await response.json()
      const variations = (data.items || []).map(sanitizeFeedItem)
      
      console.log(`Found ${variations.length} series variations`)
      setSeriesViewItems(variations)
      
    } catch (error: any) {
      console.error('Error fetching series variations:', error)
      Alert.alert('Error', 'Failed to load series variations')
    } finally {
      setIsLoadingSeriesView(false)
    }
  }

  const closeSeries = () => {
    setSeriesViewMasterItem(null)
    setSeriesViewItems([])
  }

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

  // Load user likes from storage and Supabase
  const loadUserLikesFromStorage = useCallback(async () => {
    if (!user) return
    try {
      console.log('💾 Loading user likes from storage and Supabase...')
      
      // Load from AsyncStorage first (faster)
      const likedItemsKey = `liked_items_${user.id}`
      const existingLikes = await AsyncStorage.getItem(likedItemsKey)
      const localLikedItems = existingLikes ? JSON.parse(existingLikes) : []
      setUserLikedItems(new Set(localLikedItems))
      console.log('📱 Loaded', localLikedItems.length, 'likes from AsyncStorage')
      
      // Sync with Supabase
      const { data: supabaseLikes, error } = await (supabase as any)
        .from('feed_item_likes')
        .select('feed_item_id')
        .eq('user_id', user.id)

      if (error) {
        console.log('❌ Error loading likes from Supabase:', error)
        return
      }

      const serverLikedItemIds = (supabaseLikes || []).map((like: any) => like.feed_item_id)
      console.log('🗄️ Loaded', serverLikedItemIds.length, 'likes from Supabase')
      
      // Update state with server data
      setUserLikedItems(new Set(serverLikedItemIds))
      
      // Update AsyncStorage with server data
      await AsyncStorage.setItem(likedItemsKey, JSON.stringify(serverLikedItemIds))
      console.log('🔄 Synced likes between AsyncStorage and Supabase')
      
    } catch (error) {
      console.log('❌ Error loading likes:', error)
    }
  }, [user, supabase])

  // Sanitize feed item data to prevent text rendering errors
  const sanitizeFeedItem = (item: FeedItem): FeedItem => {
    return {
      ...item,
      creator_profile_name: item.creator_profile_name || null,
      source_system: String(item.source_system || ''),
      item_type: String(item.item_type || ''),
      status: item.status || 'pending_review',
      content_data: item.content_data ? {
        ...item.content_data,
        text: item.content_data.text || null,
        processed_content: item.content_data.processed_content || null,
        generated_image_prompt: item.content_data.generated_image_prompt || null,
        prompt: item.content_data.prompt || null,
        commit_info: item.content_data.commit_info ? {
          ...item.content_data.commit_info,
          message: item.content_data.commit_info.message || null,
          author: item.content_data.commit_info.author || null,
          repo: item.content_data.commit_info.repo || null,
          files_changed: item.content_data.commit_info.files_changed ?? null,
          url: item.content_data.commit_info.url || null,
        } : null,
        source_metadata: item.content_data.source_metadata ? {
          ...item.content_data.source_metadata,
          score: item.content_data.source_metadata.score ?? null,
          comment_count: item.content_data.source_metadata.comment_count ?? null,
        } : null,
      } : null
    }
  }

  // Fetch feed items
  const fetchFeedItems = useCallback(async (pageToFetch = 1, isRefresh = false) => {
    if (!supabase) return

    if (isRefresh) {
      setRefreshing(true)
      setCurrentPage(1)
    } else if (pageToFetch === 1) {
      setIsLoading(true)
    } else {
      setLoadingMore(true)
    }

    try {
      const queryParams = new URLSearchParams({
        page: pageToFetch.toString(),
        limit: '20',
      })

      // Add filter parameters
      if (activeFilters.status) queryParams.append('status', activeFilters.status)
      if (activeFilters.itemType) queryParams.append('item_type', activeFilters.itemType)
      if (activeFilters.sourceSystem) queryParams.append('source_system', activeFilters.sourceSystem)
      if (activeFilters.dateFrom) queryParams.append('date_from', activeFilters.dateFrom.toISOString().split('T')[0])
      if (activeFilters.dateTo) queryParams.append('date_to', activeFilters.dateTo.toISOString().split('T')[0])

      const apiUrl = `${MEMORY_WORKER_API_URL}/api/v1/feed/items?${queryParams.toString()}`
      console.log('📡 Fetching feed from:', apiUrl)
      
      const response = await fetch(apiUrl)
      console.log('📡 Feed API response status:', response.status)
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      const data: FeedResponse = await response.json()
      console.log('📋 Feed API response structure:', {
        hasItems: !!data.items,
        itemsType: typeof data.items,
        itemsLength: data.items?.length || 'N/A',
        totalCount: data.total_count,
        page: data.page,
        totalPages: data.total_pages
      })
      
      // Sanitize the feed items before setting state
      const sanitizedItems = (data.items || []).map(sanitizeFeedItem)
      console.log('✅ Sanitized items count:', sanitizedItems.length)
      
      if (isRefresh || pageToFetch === 1) {
        setFeedItems(sanitizedItems)
      } else {
        setFeedItems(prev => [...prev, ...sanitizedItems])
      }
      
      setTotalPages(data.total_pages || 1)
      setCurrentPage(data.page || 1)
      setTotalCount(data.total_count || 0)
      setHasNextPage(data.page < data.total_pages)

    } catch (error: any) {
      console.error('Error fetching feed items:', error)
      Alert.alert('Error', 'Failed to load feed items')
    } finally {
      setIsLoading(false)
      setRefreshing(false)
      setLoadingMore(false)
    }
  }, [supabase, MEMORY_WORKER_API_URL, activeFilters])

  // Load more items for infinite scroll
  const loadMoreItems = useCallback(() => {
    if (loadingMore || !hasNextPage) return
    
    const nextPage = currentPage + 1
    fetchFeedItems(nextPage)
  }, [loadingMore, hasNextPage, currentPage, fetchFeedItems])

  // Handle scroll for infinite scroll
  const handleScroll = useCallback((event: any) => {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent
    const paddingToBottom = 20 // Distance from bottom to trigger load more
    
    if (contentOffset.y + layoutMeasurement.height + paddingToBottom >= contentSize.height) {
      loadMoreItems()
    }
  }, [loadMoreItems])

  // Share functionality
  const handleShare = async (mediaUrl: string, caption: string, isVideo: boolean = false) => {
    setIsSharingImage(prev => ({ ...prev, [mediaUrl]: true }))

    try {
      const ext = isVideo ? '.mp4' : '.jpg'
      const fileUri = FileSystem.documentDirectory + `temp_media_${Date.now()}${ext}`
      console.log(`Downloading ${isVideo ? 'video' : 'image'} to:`, fileUri)

      const downloadResult = await FileSystem.downloadAsync(mediaUrl, fileUri)
      console.log('Download result:', downloadResult)

      // Check if sharing is available
      const isAvailable = await Sharing.isAvailableAsync()
      if (!isAvailable) {
        Alert.alert('Error', 'Sharing is not available on this device')
        return
      }

      // Share the downloaded file
      await Sharing.shareAsync(downloadResult.uri, {
        mimeType: isVideo ? 'video/mp4' : 'image/jpeg',
        dialogTitle: caption || 'Maya HQ',
        UTI: isVideo ? 'public.mpeg-4' : 'public.jpeg'
      })
      
      console.log('Media shared successfully')

    } catch (error) {
      console.error('Error sharing media:', error)

      // Fallback to URL sharing if file sharing fails
      try {
        await Share.share({
          url: mediaUrl,
          message: caption,
          title: 'Maya HQ'
        })
      } catch (fallbackError) {
        console.error('Fallback share failed:', fallbackError)
        Alert.alert(
          'Share',
          'Sharing failed. You can copy the URL to share manually.',
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Copy URL',
              onPress: () => {
                Alert.alert('URL', mediaUrl, [
                  { text: 'OK', style: 'default' }
                ])
              }
            }
          ]
        )
      }
    } finally {
      setIsSharingImage(prev => ({ ...prev, [mediaUrl]: false }))
    }
  }

  const saveImageToPhotos = async (imageUrl: string) => {
    try {
      // In a real app, you'd use @react-native-async-storage/async-storage and react-native-image-picker
      // For now, we'll show a message
      Alert.alert('Save Image', 'Image saving feature requires additional permissions. Opening URL for manual save.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Open URL', onPress: () => Linking.openURL(imageUrl) }
      ])
    } catch (error) {
      console.error('Error saving image:', error)
      Alert.alert('Error', 'Failed to save image')
    }
  }

  const shareToLightroom = async (imageUrl: string) => {
    try {
      // Try to open Lightroom app
      const lightroomUrl = `lightroom://`
      const supported = await Linking.canOpenURL(lightroomUrl)
      
      if (supported) {
        Alert.alert(
          'Share to Lightroom', 
          'Opening Lightroom app. You can then import the image from the URL.',
          [
            { text: 'Cancel', style: 'cancel' },
            { 
              text: 'Open Lightroom', 
              onPress: async () => {
                await Linking.openURL(lightroomUrl)
                // Also copy the URL for easy pasting
                await copyImageUrl(imageUrl)
              }
            }
          ]
        )
      } else {
        Alert.alert('Lightroom Not Found', 'Adobe Lightroom app is not installed.')
      }
    } catch (error) {
      console.error('Error opening Lightroom:', error)
      Alert.alert('Error', 'Failed to open Lightroom')
    }
  }

  const shareImage = async (imageUrl: string, caption: string) => {
    try {
      await Share.share({
        message: caption,
        url: imageUrl,
      })
    } catch (error) {
      console.error('Error sharing:', error)
      Alert.alert('Error', 'Failed to share image')
    }
  }

  const copyImageUrl = async (imageUrl: string) => {
    try {
      // In a real app, you'd use @react-native-clipboard/clipboard
      // For now, show the URL in an alert
      Alert.alert('Image URL', imageUrl, [
        { text: 'OK', style: 'default' }
      ])
    } catch (error) {
      console.error('Error copying URL:', error)
      Alert.alert('Error', 'Failed to copy URL')
    }
  }

  // Copy prompt text to clipboard
  const copyPromptText = async (promptText: string) => {
    try {
      // Show the prompt in a copyable alert for now
      Alert.alert(
        'Prompt Copied! 📋',
        promptText,
        [
          { text: 'OK', style: 'default' }
        ]
      )
      console.log('Prompt copied:', promptText)
    } catch (error) {
      console.error('Error copying prompt:', error)
      Alert.alert('Error', 'Failed to copy prompt')
    }
  }

  // Handle generate Maya in scene (for inspo images)
  const handleGenerateScene = async (item: FeedItem) => {
    if (isGeneratingScene[item.id]) return

    setIsGeneratingScene(prev => ({ ...prev, [item.id]: true }))
    console.log('🎨 Starting scene generation for item:', item.id)

    try {
      const response = await fetch(
        `${MEMORY_WORKER_API_URL}/api/v1/feed/items/${item.id}/generate-scene-replication`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          }
        }
      )

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || `Failed with status ${response.status}`)
      }

      const result = await response.json()
      console.log('✅ Scene generation successful:', result)

      Alert.alert(
        '✨ Maya Generated!',
        result.caption || "Maya's version is ready!",
        [
          {
            text: 'View Series',
            onPress: () => {
              // Refresh and open series view
              fetchFeedItems(1, true)
              // The parent item will now have status 'series_generated'
            }
          },
          { text: 'OK', style: 'default' }
        ]
      )

      // Refresh the feed to show updated status
      fetchFeedItems(1, true)

    } catch (error: any) {
      console.error('❌ Scene generation failed:', error)
      Alert.alert(
        'Generation Failed',
        error.message || 'Failed to generate Maya in scene. Please try again.',
        [{ text: 'OK', style: 'default' }]
      )
    } finally {
      setIsGeneratingScene(prev => ({ ...prev, [item.id]: false }))
    }
  }

  // Handle generate video from feed item image
  const handleGenerateVideo = async (item: FeedItem) => {
    if (isGeneratingVideo[item.id]) return

    setIsGeneratingVideo(prev => ({ ...prev, [item.id]: true }))

    try {
      const session = await supabase.auth.getSession()
      const token = session?.data?.session?.access_token

      const response = await fetch(
        `${MEMORY_WORKER_API_URL}/api/v1/feed/items/${item.id}/generate-video`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
          },
        }
      )

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || `Failed with status ${response.status}`)
      }

      Alert.alert(
        '🎬 Video Queued!',
        'Video generation started. It\'ll appear in your feed when ready.',
        [{ text: 'OK', style: 'default' }]
      )
    } catch (error: any) {
      console.error('❌ Video generation failed:', error)
      Alert.alert(
        'Video Generation Failed',
        error.message || 'Failed to start video generation.',
        [{ text: 'OK', style: 'default' }]
      )
    } finally {
      setIsGeneratingVideo(prev => ({ ...prev, [item.id]: false }))
    }
  }

  // Open remix modal for a feed item
  const openRemixModal = (item: FeedItem) => {
    setItemToRemix(item)
    setIsRemixModalVisible(true)
  }

  // Handle remix with modifiers
  const handleRemix = async (modifiers: Modifiers) => {
    if (!itemToRemix) return

    const itemId = itemToRemix.id
    setIsRemixing(prev => ({ ...prev, [itemId]: true }))
    console.log('🔄 Starting remix for item:', itemId, 'with modifiers:', modifiers)

    try {
      const response = await fetch(
        `${MEMORY_WORKER_API_URL}/api/v1/feed/items/${itemId}/remix`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ modifiers })
        }
      )

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || `Failed with status ${response.status}`)
      }

      const result = await response.json()
      console.log('✅ Remix successful:', result)

      Alert.alert(
        '✨ Remixed!',
        result.caption || "New version created!",
        [
          {
            text: 'View in Feed',
            onPress: () => {
              fetchFeedItems(1, true)
            }
          },
          { text: 'OK', style: 'default' }
        ]
      )

      // Refresh the feed to show the new remixed item
      fetchFeedItems(1, true)

    } catch (error: any) {
      console.error('❌ Remix failed:', error)
      Alert.alert(
        'Remix Failed',
        error.message || 'Failed to remix image. Please try again.',
        [{ text: 'OK', style: 'default' }]
      )
    } finally {
      setIsRemixing(prev => ({ ...prev, [itemId]: false }))
      setItemToRemix(null)
    }
  }

  // Handle like toggle
  const handleLikeToggle = async (itemId: string, isCurrentlyLiked: boolean) => {
    console.log('🔍 Like button tapped:', { itemId, isCurrentlyLiked, userExists: !!user })
    
    if (!user) {
      console.log('❌ No user found - authentication required')
      Alert.alert('Error', 'Authentication required')
      return
    }

    console.log('✅ User authenticated, starting like toggle...')

    // Optimistic update
    setUserLikedItems(prevLikes => {
      const newLikes = new Set(prevLikes)
      if (isCurrentlyLiked) {
        newLikes.delete(itemId)
        console.log('👎 Optimistically removing like')
      } else {
        newLikes.add(itemId)
        console.log('👍 Optimistically adding like')
      }
      return newLikes
    })

    try {
      console.log('🔑 Getting auth session...')
      // Get auth token
      const { data: { session } } = await supabase.auth.getSession()

      if (!session?.user) {
        console.log('❌ No session found')
        Alert.alert('Error', 'Authentication error. Please log in again.')
        // Revert optimistic update
        setUserLikedItems(prevLikes => {
          const newLikes = new Set(prevLikes)
          if (isCurrentlyLiked) {
            newLikes.add(itemId)
          } else {
            newLikes.delete(itemId)
          }
          return newLikes
        })
        return
      }

      console.log('📋 Using Supabase directly for likes...')

      if (isCurrentlyLiked) {
        // Remove like
        console.log('👎 Removing like from Supabase...')
        const { error } = await (supabase as any)
          .from('feed_item_likes')
          .delete()
          .eq('feed_item_id', itemId)
          .eq('user_id', session.user.id)

        if (error) {
          console.log('❌ Supabase delete error:', error)
          throw new Error(`Failed to unlike item: ${error.message}`)
        }
      } else {
        // Add like
        console.log('👍 Adding like to Supabase...')
        const { error } = await (supabase as any)
          .from('feed_item_likes')
          .insert({
            feed_item_id: itemId,
            user_id: session.user.id,
            created_at: new Date().toISOString()
          })

        if (error) {
          console.log('❌ Supabase insert error:', error)
          throw new Error(`Failed to like item: ${error.message}`)
        }
      }

      console.log('✅ Supabase like operation successful!')

      // Save to AsyncStorage for offline persistence
      const likedItemsKey = `liked_items_${user.id}`
      const existingLikes = await AsyncStorage.getItem(likedItemsKey)
      const likedItems = existingLikes ? JSON.parse(existingLikes) : []
      
      if (isCurrentlyLiked) {
        const updatedLikes = likedItems.filter((id: string) => id !== itemId)
        await AsyncStorage.setItem(likedItemsKey, JSON.stringify(updatedLikes))
      } else {
        if (!likedItems.includes(itemId)) {
          likedItems.push(itemId)
          await AsyncStorage.setItem(likedItemsKey, JSON.stringify(likedItems))
        }
      }

      console.log('💾 Saved like state to AsyncStorage')

    } catch (error: any) {
      console.error(`❌ Error toggling like for item ${itemId}:`, error)
      Alert.alert('Error', error.message || 'Failed to update like status')
      
      // Revert optimistic update
      setUserLikedItems(prevLikes => {
        const newLikes = new Set(prevLikes)
        if (isCurrentlyLiked) {
          newLikes.add(itemId)
        } else {
          newLikes.delete(itemId)
        }
        return newLikes
      })
      console.log('↩️ Reverted optimistic update due to error')
    }
  }

  // Handle approve action
  const handleApprove = async (item: FeedItem) => {
    if (!user) {
      Alert.alert('Error', 'Authentication required')
      return
    }

    setIsProcessingAction(true)

    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token

      if (!token) {
        Alert.alert('Error', 'Authentication error. Please log in again.')
        return
      }

      const response = await fetch(`${MEMORY_WORKER_API_URL}/api/v1/feed/items/${item.id}/approve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || 'Failed to approve item.')
      }

      Alert.alert('Success', `Item approved successfully.`)
      
      // Refresh the feed to show updated status
      if (seriesViewMasterItem) {
        openSeriesView(seriesViewMasterItem) // Refresh series view
      } else {
        fetchFeedItems(1, true) // Refresh main feed
      }

    } catch (error: any) {
      console.error('Error approving item:', error)
      Alert.alert('Error', error.message || 'Failed to approve item')
    } finally {
      setIsProcessingAction(false)
    }
  }

  // Handle reject action
  const handleReject = (item: FeedItem) => {
    setSelectedItem(item)
    setIsRejectModalVisible(true)
  }

  // Handle reject submit
  const handleRejectSubmit = async (itemId: string, rejectionNotes: string) => {
    if (!user) return

    setIsProcessingAction(true)

    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token

      if (!token) {
        Alert.alert('Error', 'Authentication error. Please log in again.')
        return
      }

      const response = await fetch(`${MEMORY_WORKER_API_URL}/api/v1/feed/items/${itemId}/reject`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ admin_review_notes: rejectionNotes })
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || 'Failed to reject item.')
      }

      Alert.alert('Success', `Item rejected.`)
      setIsRejectModalVisible(false)
      setSelectedItem(null)
      
      // Refresh the feed
      if (seriesViewMasterItem) {
        openSeriesView(seriesViewMasterItem)
      } else {
        fetchFeedItems(1, true)
      }

    } catch (error: any) {
      console.error('Error rejecting item:', error)
      Alert.alert('Error', error.message || 'Failed to reject item')
    } finally {
      setIsProcessingAction(false)
    }
  }

  // Handle edit action
  const handleEdit = (item: FeedItem) => {
    setSelectedItem(item)
    setIsEditModalVisible(true)
  }

  // Handle edit submit
  const handleEditSubmit = async (itemId: string, editedContentData: any) => {
    if (!user) return

    setIsProcessingAction(true)

    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token

      if (!token) {
        Alert.alert('Error', 'Authentication error. Please log in again.')
        return
      }

      const response = await fetch(`${MEMORY_WORKER_API_URL}/api/v1/feed/items/${itemId}/content`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ content_data: editedContentData })
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || 'Failed to save edited content.')
      }

      Alert.alert('Success', 'Content updated successfully!')
      setIsEditModalVisible(false)
      setSelectedItem(null)
      
      // Refresh the feed
      if (seriesViewMasterItem) {
        openSeriesView(seriesViewMasterItem)
      } else {
        fetchFeedItems(1, true)
      }

    } catch (error: any) {
      console.error('Error saving edited content:', error)
      Alert.alert('Error', error.message || 'Failed to save changes')
    } finally {
      setIsProcessingAction(false)
    }
  }

  // Fetch comments for item
  const fetchCommentsForItem = useCallback(async (itemId: string) => {
    if (!supabase || commentsLoaded[itemId]) return

    setIsLoadingComments(prev => ({ ...prev, [itemId]: true }))

    try {
      const response = await fetch(`${MEMORY_WORKER_API_URL}/api/v1/feed/items/${itemId}/comments`)
      
      if (!response.ok) {
        throw new Error('Failed to fetch comments')
      }

      const data: FeedItemComment[] = await response.json()
      setComments(prev => ({ ...prev, [itemId]: data || [] }))
      setCommentsLoaded(prev => ({ ...prev, [itemId]: true }))

    } catch (error: any) {
      console.error('Error fetching comments:', error)
      Alert.alert('Error', 'Failed to load comments')
      setComments(prev => ({ ...prev, [itemId]: [] }))
    } finally {
      setIsLoadingComments(prev => ({ ...prev, [itemId]: false }))
    }
  }, [supabase, MEMORY_WORKER_API_URL, commentsLoaded])

  // Handle add comment
  const handleAddComment = async (feedItemId: string, commentText: string) => {
    if (!user || !commentText.trim()) {
      Alert.alert('Error', 'Comment cannot be empty')
      return
    }

    setIsSubmittingComment(true)

    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token

      if (!token) {
        Alert.alert('Error', 'Authentication error. Please log in again.')
        return
      }

      const response = await fetch(`${MEMORY_WORKER_API_URL}/api/v1/feed/items/${feedItemId}/comments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ comment_text: commentText.trim() })
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || 'Failed to add comment.')
      }

      const newComment: FeedItemComment = await response.json()
      
      // Add the new comment to state
      setComments(prev => ({
        ...prev,
        [feedItemId]: [...(prev[feedItemId] || []), newComment]
      }))

      Alert.alert('Success', 'Comment added!')

    } catch (error: any) {
      console.error('Error adding comment:', error)
      Alert.alert('Error', error.message || 'Failed to add comment')
    } finally {
      setIsSubmittingComment(false)
    }
  }

  // Toggle comments section
  const toggleComments = (itemId: string) => {
    setExpandedComments(prev => ({
      ...prev,
      [itemId]: !prev[itemId]
    }))
    
    // Fetch comments if not loaded yet
    if (!commentsLoaded[itemId]) {
      fetchCommentsForItem(itemId)
    }
  }

  // Fetch social media platforms
  const fetchSocialPlatforms = useCallback(async () => {
    if (!supabase) return
    setIsLoadingSocialPlatforms(true)
    try {
      // Use type assertion since social_media_platforms table may not be in type definitions yet
      const { data, error } = await (supabase as any)
        .from('social_media_platforms')
        .select('*')
        .eq('is_active', true)
        .order('name')

      if (error) {
        console.error('Error fetching social platforms:', error)
        return
      }

      const platformsWithIcons = data.map((platform: any) => ({
        id: platform.id,
        name: platform.name,
        display_name: platform.display_name,
        icon_name: getPlatformIconName(platform.name)
      }))

      setSocialPlatforms(platformsWithIcons)
    } catch (error: any) {
      console.error('Error fetching social platforms:', error)
    } finally {
      setIsLoadingSocialPlatforms(false)
    }
  }, [supabase])

  // Get platform icon name for Ionicons
  const getPlatformIconName = (platformName: string) => {
    switch (platformName) {
      case 'twitter':
        return 'logo-twitter'
      case 'instagram':
        return 'logo-instagram'
      case 'linkedin':
        return 'logo-linkedin'
      case 'facebook':
        return 'logo-facebook'
      default:
        return 'share-outline'
    }
  }

  // Handle social media platform selection
  const togglePlatformSelection = (itemId: string, platformId: string) => {
    setSelectedPlatforms(prev => {
      const currentSelections = prev[itemId] || []
      const isSelected = currentSelections.includes(platformId)
      
      if (isSelected) {
        return {
          ...prev,
          [itemId]: currentSelections.filter(id => id !== platformId)
        }
      } else {
        return {
          ...prev,
          [itemId]: [...currentSelections, platformId]
        }
      }
    })
  }

  // Schedule social media posts
  const scheduleSocialPosts = async (item: FeedItem, platformIds: string[]) => {
    if (platformIds.length === 0) {
      Alert.alert('Error', 'Please select at least one platform')
      return
    }
    
    setIsProcessingAction(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token

      if (!token) {
        Alert.alert('Error', 'Authentication error. Please log in again.')
        return
      }
      
      // For now, let's create a simple scheduling implementation using Supabase directly
      // since the website API isn't available
      
      console.log('Scheduling social posts for platforms:', platformIds)
      console.log('Item:', item.id)
      
      // Create queue entries directly in Supabase
      const queueEntries = platformIds.map(platformId => ({
        feed_item_id: item.id,
        platform_id: platformId,
        status: 'pending',
        scheduled_for: new Date().toISOString(),
        content_data: {
          text: item.content_data?.processed_content || item.content_data?.text || '',
          image_url: item.content_data?.image_url || null,
          original_feed_item: {
            id: item.id,
            source_system: item.source_system,
            item_type: item.item_type,
            full_content_data: item.content_data
          }
        },
        post_metadata: {
          created_by_user_id: session.user.id,
          created_from_mobile: true
        },
        attempts: 0,
        max_attempts: 3
      }))

      console.log('Creating queue entries:', queueEntries)

      // Insert queue entries directly into Supabase
      const { data: insertedEntries, error: insertError } = await (supabase as any)
        .from('social_media_posting_queue')
        .insert(queueEntries)
        .select()

      if (insertError) {
        console.error('Error inserting queue entries:', insertError)
        throw new Error(`Failed to schedule posts: ${insertError.message}`)
      }

      console.log('Successfully inserted entries:', insertedEntries)

      // Update feed item status to indicate it's been scheduled for posting
      const { error: updateError } = await (supabase as any)
        .from('feed_items')
        .update({ status: 'approved_for_posting' })
        .eq('id', item.id)

      if (updateError) {
        console.warn('Error updating feed item status:', updateError)
        // Don't fail the request since the queue entries were created successfully
      }

      Alert.alert('Success', `Social media posts scheduled successfully for ${platformIds.length} platform(s)!`)
      setIsSocialSchedulingModalVisible(false)
      setSelectedPlatforms(prev => ({ ...prev, [item.id]: [] }))
      
      // Refresh the feed to show updated status
      if (seriesViewMasterItem) {
        openSeriesView(seriesViewMasterItem)
      } else {
        fetchFeedItems(1, true)
      }

    } catch (error: any) {
      console.error('Error scheduling social posts:', error)
      Alert.alert(
        'Scheduling Error', 
        `Failed to schedule posts: ${error.message}\n\nThis might be a temporary issue with the server. Please try again later.`
      )
    } finally {
      setIsProcessingAction(false)
    }
  }

  // Open social scheduling modal
  const openSocialSchedulingModal = (item: FeedItem) => {
    console.log('📱 Opening social scheduling modal for item:', item.id)
    console.log('📋 Current selectedPlatforms for item:', selectedPlatforms[item.id] || 'undefined')
    
    setItemForSocialPosting(item)
    
    // Ensure selectedPlatforms is initialized for this item
    if (!selectedPlatforms[item.id]) {
      console.log('🔧 Initializing selectedPlatforms for item:', item.id)
      setSelectedPlatforms(prev => ({
        ...prev,
        [item.id]: []
      }))
    }
    
    setIsSocialSchedulingModalVisible(true)
    console.log('✅ Social scheduling modal opened')
  }

  // Handle refresh
  const handleRefresh = () => {
    fetchFeedItems(1, true)
  }

  // Handle filters
  const handleFiltersApply = (newFilters: FilterOptions) => {
    setActiveFilters(newFilters)
    setCurrentPage(1)
  }

  // Get active filter count
  const getActiveFilterCount = () => {
    let count = 0
    if (activeFilters.status) count++
    if (activeFilters.itemType) count++
    if (activeFilters.sourceSystem) count++
    if (activeFilters.dateFrom) count++
    if (activeFilters.dateTo) count++
    return count
  }

  // Get status color
  const getStatusColor = (status: FeedItem['status']) => {
    switch (status) {
      case 'pending_review':
      case 'prompt_generated':
      case 'image_generated_pending_review':
        return '#F59E0B'
      case 'approved':
      case 'posted_social':
      case 'series_generated':
        return '#10B981'
      case 'rejected':
      case 'error_posting':
        return '#EF4444'
      default:
        return '#6B7280'
    }
  }

  // Get source system color
  const getSourceSystemColor = (sourceSystem: string) => {
    switch (sourceSystem) {
      case 'MoodEngine':
        return '#A855F7'
      case 'ComfyUI':
        return '#EF4444'
      case 'SeriesGenerator':
        return '#10B981'
      case 'ImageStudio':
        return '#F59E0B'
      case 'n8n_maya_processor':
        return '#6366F1'
      case 'InstagramInspo':
        return '#E1306C' // Instagram pink
      case 'SceneReplication':
        return '#A855F7' // Purple for Maya-generated
      default:
        return '#6B7280'
    }
  }

  // Get source system display name
  const getSourceSystemDisplay = (sourceSystem: string) => {
    switch (sourceSystem) {
      case 'n8n_maya_processor':
        return 'n8n'
      case 'MoodEngine':
        return 'Mood'
      case 'ComfyUI':
        return 'ComfyUI'
      case 'SeriesGenerator':
        return 'Series'
      case 'ImageStudio':
        return 'Studio'
      case 'InstagramInspo':
        return 'Inspo'
      case 'SceneReplication':
        return 'Maya AI'
      default:
        return sourceSystem
    }
  }

  // Get status display name
  const getStatusDisplay = (status: FeedItem['status']) => {
    switch (status) {
      case 'pending_review':
      case 'image_generated_pending_review':
        return 'PENDING REVIEW'
      case 'prompt_generated':
        return 'PROMPT GENERATED'
      case 'series_generated':
        return 'SERIES GENERATED'
      case 'approved':
        return 'APPROVED'
      case 'rejected':
        return 'REJECTED'
      case 'approved_for_posting':
        return 'APPROVED FOR POSTING'
      case 'posted_social':
        return 'POSTED'
      case 'error_posting':
        return 'ERROR'
      default:
        return (status as string).replace('_', ' ').toUpperCase()
    }
  }

  // Format time ago
  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString)
    const now = new Date()
    const diffInMs = now.getTime() - date.getTime()
    const diffInMins = Math.floor(diffInMs / (1000 * 60))
    const diffInHours = Math.floor(diffInMs / (1000 * 60 * 60))
    const diffInDays = Math.floor(diffInMs / (1000 * 60 * 60 * 24))

    if (diffInMins < 60) {
      return `${diffInMins}m ago`
    } else if (diffInHours < 24) {
      return `${diffInHours}h ago`
    } else {
      return `${diffInDays}d ago`
    }
  }

  // Initialize
  useEffect(() => {
    fetchMayaProfile()
    loadUserLikesFromStorage()
    fetchFeedItems(1)
    fetchSocialPlatforms()
  }, [fetchMayaProfile, loadUserLikesFromStorage, fetchFeedItems, fetchSocialPlatforms])

  // Add debug logging for arrays
  useEffect(() => {
    console.log('📊 State arrays:', {
      feedItems: feedItems?.length || 'undefined',
      seriesViewItems: seriesViewItems?.length || 'undefined', 
      socialPlatforms: socialPlatforms?.length || 'undefined',
      commentsKeys: Object.keys(comments || {}).length
    })
  }, [feedItems, seriesViewItems, socialPlatforms, comments])

  // Prefetch image dimensions for dynamic aspect ratios
  useEffect(() => {
    feedItems.forEach(item => {
      const url = item.content_data?.image_url
      if (url && !imageAspectRatios[url]) {
        Image.getSize(
          url,
          (width, height) => {
            if (width && height) {
              setImageAspectRatios(prev => ({ ...prev, [url]: width / height }))
            }
          },
          () => {} // silently ignore failures — will fall back to 4:5
        )
      }
    })
  }, [feedItems])

  // Safe text rendering helper to prevent any text rendering errors
  const safeText = (value: any, fallback: string = ''): string => {
    if (value === null || value === undefined) return fallback
    return String(value)
  }

  // Safe conditional rendering helper
  const safeRender = (condition: any, content: React.ReactNode) => {
    // Only render if condition is truthy and not just a number 0
    if (condition && condition !== 0 && condition !== false) {
      return content
    }
    return null
  }

  // Render feed item
  const renderFeedItem = (item: FeedItem) => {
    const hasImage = item.content_data?.image_url
    const hasVideo = item.content_data?.video_url
    const isImageType = item.item_type.includes('image')
    const canGenerateVideo = hasImage && item.item_type?.startsWith('image_') && !isGeneratingVideo[item.id]
    const isTextType = item.item_type.includes('text')
    const isGitHubCommit = item.item_type === 'text_from_github_commit'
    const isN8nProcessed = item.source_system === 'n8n_maya_processor'

    const renderContent = () => {
      // Handle GitHub commits
      if (isGitHubCommit && item.content_data?.commit_info) {
        const commitInfo = item.content_data.commit_info
        return (
          <View style={styles.contentContainer}>
            <View style={styles.processedContentContainer}>
              <View style={styles.mayaLabel}>
                <Text style={styles.mayaLabelText}>📱 GitHub Update</Text>
              </View>
              <Text style={styles.processedContent}>
                {safeText(item.content_data.text || 'New GitHub activity detected')}
              </Text>
            </View>
            
            <View style={styles.githubCommitContainer}>
              <View style={styles.githubHeader}>
                <Ionicons name="logo-github" size={16} color="#fff" />
                <Text style={styles.githubTitle}>Commit Details</Text>
              </View>
              
              {safeRender(commitInfo.message, (
                <Text style={styles.githubCommitMessage}>
                  {safeText(commitInfo.message).split('\n')[0].substring(0, 100)}
                  {safeText(commitInfo.message).length > 100 ? '...' : ''}
                </Text>
              ))}
              
              <View style={styles.githubMetaRow}>
                {safeRender(commitInfo.author, (
                  <Text style={styles.githubMeta}>👤 {safeText(commitInfo.author)}</Text>
                ))}
                {safeRender(commitInfo.repo, (
                  <Text style={styles.githubMeta}>📂 {safeText(commitInfo.repo)}</Text>
                ))}
              </View>
              
              {safeRender(commitInfo.files_changed !== undefined, (
                <Text style={styles.githubMeta}>
                  📝 {safeText(commitInfo.files_changed)} files changed
                </Text>
              ))}
              
              {safeRender(commitInfo.url, (
                <TouchableOpacity 
                  style={styles.githubLinkButton}
                  onPress={() => {
                    Alert.alert('GitHub Link', safeText(commitInfo.url))
                  }}
                >
                  <Ionicons name="open-outline" size={14} color="#6B46C1" />
                  <Text style={styles.githubLinkText}>View on GitHub</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )
      }

      // Handle n8n processed content
      if (isN8nProcessed && item.content_data?.processed_content) {
        return (
          <View style={styles.contentContainer}>
            <View style={styles.mayaTakeContainer}>
              <View style={styles.mayaTakeHeader}>
                <Text style={styles.mayaTakeLabel}>✨ Maya's Take</Text>
                <View style={styles.aiProcessedBadge}>
                  <Text style={styles.aiProcessedText}>AI</Text>
                </View>
              </View>
              <Text style={styles.mayaTakeContent}>
                {safeText(item.content_data.processed_content)}
              </Text>
            </View>
            
            {safeRender(item.content_data.original_title, (
              <View style={styles.originalSourceContainer}>
                <Text style={styles.originalSourceTitle}>Original Source</Text>
                <Text style={styles.originalSourceText}>
                  {safeText(item.content_data.original_title)}
                </Text>
                
                {safeRender(item.content_data.source_metadata, (
                  <View style={styles.sourceMetaRow}>
                    {safeRender(item.content_data.source_metadata.score, (
                      <Text style={styles.sourceMeta}>
                        ⭐ {safeText(item.content_data.source_metadata.score)}
                      </Text>
                    ))}
                    {safeRender(item.content_data.source_metadata.comment_count, (
                      <Text style={styles.sourceMeta}>
                        💬 {safeText(item.content_data.source_metadata.comment_count)}
                      </Text>
                    ))}
                  </View>
                ))}
                
                {safeRender(item.content_data.source_url, (
                  <TouchableOpacity 
                    style={styles.sourceUrlButton}
                    onPress={() => {
                      Alert.alert('Source Link', safeText(item.content_data.source_url))
                    }}
                  >
                    <Ionicons name="link-outline" size={14} color="#6B46C1" />
                    <Text style={styles.sourceUrlText}>View Original →</Text>
                  </TouchableOpacity>
                ))}
              </View>
            ))}
          </View>
        )
      }

      // Handle regular content — IG-style single-line caption
      const captionText = item.content_data?.generated_image_prompt
        || item.content_data?.prompt
        || item.content_data?.caption
        || item.content_data?.processed_content
        || item.content_data?.text

      if (isTextType && !isGitHubCommit && !isN8nProcessed) {
        // Text-only items still show full content
        return (
          <View style={styles.contentContainer}>
            {safeRender(item.content_data?.processed_content, (
              <View style={styles.mayaTakeContainer}>
                <View style={styles.mayaTakeHeader}>
                  <Text style={styles.mayaTakeLabel}>✨ Maya's Take</Text>
                </View>
                <Text style={styles.mayaTakeContent}>
                  {safeText(item.content_data.processed_content)}
                </Text>
              </View>
            ))}
            {safeRender(item.content_data?.text, (
              <View style={styles.processedContentContainer}>
                <Text style={styles.processedContent}>
                  {safeText(item.content_data.text)}
                </Text>
              </View>
            ))}
          </View>
        )
      }

      // Image items — just a caption line like web/IG
      if (!captionText) return null
      return null // caption rendered below in the card body
    }

    return (
      <View key={item.id} style={styles.feedItemContainer}>
        <View style={styles.feedItemHeader}>
          <View style={styles.creatorInfo}>
            {item.creator_profile_avatar_url ? (
              <Image
                source={{ uri: item.creator_profile_avatar_url }}
                style={styles.avatar}
              />
            ) : (
              <View style={styles.avatarPlaceholder}>
                <Text style={styles.avatarText}>
                  {safeText(item.creator_profile_name || 'M').charAt(0).toUpperCase()}
                </Text>
              </View>
            )}
            <View style={styles.creatorDetails}>
              <Text style={styles.creatorName}>
                {safeText(String(item.creator_profile_name || 'Maya'))}
              </Text>
              <View style={styles.metaRow}>
                <View style={[styles.statusBadge, { backgroundColor: getStatusColor(item.status) }]}>
                  <Text style={styles.statusText}>
                    {safeText(getStatusDisplay(item.status))}
                  </Text>
                </View>
                <View style={[styles.sourceBadge, { backgroundColor: getSourceSystemColor(item.source_system) }]}>
                  <Text style={styles.sourceText}>
                    {safeText(getSourceSystemDisplay(item.source_system))}
                  </Text>
                </View>
                <Text style={styles.timeAgo}>{safeText(formatTimeAgo(item.created_at))}</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Video playback for video items */}
        {safeRender(!!hasVideo, (
          <View style={styles.imageContainer}>
            <Video
              source={{ uri: item.content_data.video_url }}
              posterSource={item.content_data.thumbnail_url ? { uri: item.content_data.thumbnail_url } : undefined}
              shouldPlay
              isMuted
              isLooping
              resizeMode={ResizeMode.COVER}
              style={styles.feedVideo}
            />
          </View>
        ))}

        {/* Image display for non-video items */}
        {safeRender(!hasVideo && hasImage, (
          <View style={styles.imageContainer}>
            <TouchableOpacity style={styles.imageWrapper}>
              <Image
                source={{ uri: item.content_data.image_url }}
                style={[
                  styles.feedImage,
                  { aspectRatio: imageAspectRatios[item.content_data.image_url] || 4 / 5 },
                ]}
                resizeMode="cover"
              />
            </TouchableOpacity>

            {/* Image overlay buttons container */}
            <View style={styles.imageOverlayButtons}>
              {/* Maya Version button for inspo images */}
              {item.item_type === 'image_inspo' && item.status !== 'series_generated' && (
                <TouchableOpacity
                  style={[styles.imageOverlayButton, styles.mayaVersionButton]}
                  onPress={() => handleGenerateScene(item)}
                  disabled={isGeneratingScene[item.id]}
                >
                  {isGeneratingScene[item.id] ? (
                    <ActivityIndicator size={16} color="#fff" />
                  ) : (
                    <Ionicons name="sparkles" size={18} color="#fff" />
                  )}
                </TouchableOpacity>
              )}

              {/* View Maya's Version button for replicated inspo */}
              {item.item_type === 'image_inspo' && item.status === 'series_generated' && (
                <TouchableOpacity
                  style={[styles.imageOverlayButton, styles.viewMayaVersionButton]}
                  onPress={() => openSeriesView(item)}
                >
                  <Ionicons name="images" size={18} color="#fff" />
                </TouchableOpacity>
              )}
            </View>

          </View>
        ))}

        {/* Text-only items still get full renderContent */}
        {safeRender(isTextType, renderContent())}

        {/* Action Bar - IG style */}
        <View style={styles.actionBar}>
          <View style={styles.actionBarLeft}>
            <TouchableOpacity
              style={styles.actionBarIcon}
              onPress={() => handleLikeToggle(item.id, userLikedItems.has(item.id))}
            >
              <MaterialCommunityIcons
                name={userLikedItems.has(item.id) ? "heart" : "heart-outline"}
                size={24}
                color={userLikedItems.has(item.id) ? "#EF4444" : "#F3F4F6"}
              />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionBarIcon}
              onPress={() => toggleComments(item.id)}
            >
              <Ionicons name="chatbubble-outline" size={22} color="#F3F4F6" />
              {(comments[item.id]?.length || 0) > 0 && (
                <Text style={styles.actionBarCount}>{comments[item.id]?.length}</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionBarIcon}
              onPress={() => {
                const shareUrl = hasVideo ? item.content_data.video_url : item.content_data.image_url;
                if (shareUrl) {
                  handleShare(
                    shareUrl,
                    item.content_data?.processed_content || item.content_data?.caption || 'Maya HQ',
                    !!hasVideo
                  );
                }
              }}
              disabled={(() => {
                const shareUrl = hasVideo ? item.content_data.video_url : item.content_data.image_url;
                return shareUrl ? !!isSharingImage[shareUrl] : true;
              })()}
            >
              {(() => {
                const shareUrl = hasVideo ? item.content_data.video_url : item.content_data.image_url;
                return shareUrl && isSharingImage[shareUrl] ? (
                  <ActivityIndicator size={18} color="#F3F4F6" />
                ) : (
                  <Ionicons name="paper-plane-outline" size={22} color="#F3F4F6" />
                );
              })()}
            </TouchableOpacity>
          </View>

          <View style={styles.actionBarRight}>
            {canGenerateVideo && (
              <TouchableOpacity
                style={styles.actionBarIcon}
                onPress={() => handleGenerateVideo(item)}
                disabled={isGeneratingVideo[item.id]}
              >
                {isGeneratingVideo[item.id] ? (
                  <ActivityIndicator size={18} color="#A855F7" />
                ) : (
                  <Ionicons name="videocam-outline" size={22} color="#F3F4F6" />
                )}
              </TouchableOpacity>
            )}

            {item.item_type === 'image_generated' && (
              <TouchableOpacity
                style={styles.actionBarIcon}
                onPress={() => openRemixModal(item)}
                disabled={isRemixing[item.id]}
              >
                {isRemixing[item.id] ? (
                  <ActivityIndicator size={18} color="#3B82F6" />
                ) : (
                  <Ionicons name="repeat" size={22} color="#F3F4F6" />
                )}
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Caption - IG style: "Creator Name caption text..." */}
        {(() => {
          const captionLine = item.content_data?.generated_image_prompt
            || item.content_data?.prompt
            || item.content_data?.caption
            || item.content_data?.processed_content
            || item.content_data?.text
          if (!captionLine || isTextType) return null
          return (
            <View style={styles.captionRow}>
              <Text style={styles.captionText} numberOfLines={1}>
                <Text style={styles.captionName}>{safeText(item.creator_profile_name || 'Maya')} </Text>
                {safeText(captionLine)}
              </Text>
            </View>
          )
        })()}

        {safeRender(item.status === 'pending_review' || item.status === 'image_generated_pending_review', (
          <View style={styles.actionsRow}>
            <TouchableOpacity 
              style={[styles.actionButton, styles.approveButton]}
              onPress={() => handleApprove(item)}
              disabled={isProcessingAction}
            >
              <Ionicons name="checkmark" size={16} color="#fff" />
              <Text style={styles.actionButtonText}>Approve</Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={[styles.actionButton, styles.rejectButton]}
              onPress={() => handleReject(item)}
              disabled={isProcessingAction}
            >
              <Ionicons name="close" size={16} color="#fff" />
              <Text style={styles.actionButtonText}>Reject</Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={[styles.actionButton, styles.editButton]}
              onPress={() => handleEdit(item)}
              disabled={isProcessingAction}
            >
              <Ionicons name="create" size={16} color="#fff" />
              <Text style={styles.actionButtonText}>Edit</Text>
            </TouchableOpacity>
          </View>
        ))}

        {safeRender(expandedComments[item.id], (
          <View style={styles.commentsSection}>
            {safeRender(isLoadingComments[item.id], (
              <View style={styles.loadingComments}>
                <ActivityIndicator size="small" color="#A855F7" />
                <Text style={styles.loadingCommentsText}>Loading comments...</Text>
              </View>
            ))}
            {safeRender(comments[item.id] && comments[item.id].length > 0, (
              <ScrollView style={styles.commentsList} nestedScrollEnabled>
                {(comments[item.id] || []).map(comment => (
                  <View key={comment.id} style={styles.commentItem}>
                    <View style={styles.commentHeader}>
                      {comment.user_profile?.avatar_url ? (
                        <Image
                          source={{ uri: comment.user_profile.avatar_url }}
                          style={styles.commentAvatar}
                        />
                      ) : (
                        <View style={styles.commentAvatarPlaceholder}>
                          <Text style={styles.commentAvatarText}>
                            {safeText(comment.user_profile?.name || 'U').charAt(0).toUpperCase()}
                          </Text>
                        </View>
                      )}
                      <View style={styles.commentContent}>
                        <Text style={styles.commentAuthor}>
                          {safeText(comment.user_profile?.name || 'Anonymous')}
                        </Text>
                        <Text style={styles.commentText}>{safeText(comment.comment_text)}</Text>
                        <Text style={styles.commentTime}>
                          {safeText(formatTimeAgo(comment.created_at))}
                        </Text>
                      </View>
                    </View>
                  </View>
                ))}
              </ScrollView>
            ))}
            {safeRender(user, (
              <AddComment
                feedItemId={item.id}
                onAddComment={handleAddComment}
                isSubmitting={isSubmittingComment}
                userProfile={userProfile}
              />
            ))}
          </View>
        ))}
      </View>
    )
  }

  // Render loading state
  const renderLoadingState = () => (
    <View style={styles.loadingState}>
      <ActivityIndicator size="large" color="#6B46C1" />
      <Text style={styles.loadingText}>Loading feed...</Text>
    </View>
  )

  // Render empty state
  const renderEmptyState = () => (
    <View style={styles.emptyState}>
      <Ionicons name="document-outline" size={64} color="#9CA3AF" />
      <Text style={styles.emptyStateTitle}>No Feed Items</Text>
      <Text style={styles.emptyStateSubtitle}>
        {safeText(getActiveFilterCount() > 0 
          ? 'No items match your current filters.'
          : 'No content found. Try refreshing.')}
      </Text>
    </View>
  )

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle="light-content" backgroundColor="#111827" />
      
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeftSection}>
          {safeRender(seriesViewMasterItem, (
            <TouchableOpacity 
              style={styles.backButton}
              onPress={closeSeries}
            >
              <Ionicons name="arrow-back" size={24} color="#A855F7" />
            </TouchableOpacity>
          ))}
          <View style={styles.mayaAvatarWrapper}>
            <Image
              source={{ uri: mayaProfile?.avatar_url || DEFAULT_MAYA_AVATAR }}
              style={styles.headerAvatar}
            />
          </View>
          <Text style={styles.headerTitle}>
            {safeRender(seriesViewMasterItem, 'Series Gallery') || 'Maya HQ'}
          </Text>
        </View>
        <View style={styles.headerButtons}>
          <TouchableOpacity 
            style={styles.headerButton}
            onPress={() => setIsFilterModalVisible(true)}
          >
            <Ionicons name="filter" size={24} color="#A855F7" />
            {safeRender(getActiveFilterCount() > 0, (
              <View style={styles.filterBadge}>
                <Text style={styles.filterBadgeText}>{safeText(String(getActiveFilterCount()))}</Text>
              </View>
            ))}
          </TouchableOpacity>
          <TouchableOpacity 
            style={styles.headerButton}
            onPress={() => navigation.navigate('ComfyUISwipe' as never)}
          >
            <Ionicons name="images" size={24} color="#F59E0B" />
          </TouchableOpacity>
          <TouchableOpacity 
            style={styles.chatButton}
            onPress={() => navigation.navigate('Chat' as never)}
          >
            <Ionicons name="chatbubble-outline" size={24} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Content */}
      {safeRender(seriesViewMasterItem, (
        /* Series View */
        <View style={styles.seriesContainer}>
          <View style={styles.seriesHeader}>
            <Text style={styles.seriesTitle}>Series Gallery</Text>
            <Text style={styles.seriesSubtitle}>
              {safeText(seriesViewMasterItem?.creator_profile_name || 'Maya')} • {safeText(String(seriesViewItems.length))} variations
            </Text>
          </View>
          
          {safeRender(isLoadingSeriesView, (
            renderLoadingState()
          ))}
          {safeRender(!isLoadingSeriesView, (
            <ScrollView 
              style={styles.seriesScrollView}
              contentInsetAdjustmentBehavior="never"
              contentContainerStyle={{ paddingBottom: 84 }}
              showsVerticalScrollIndicator={false}
            >
              {/* Master Item */}
              {seriesViewMasterItem && renderFeedItem(seriesViewMasterItem)}
              
              {/* Series Variations */}
              {(seriesViewItems || []).map(item => (
                <React.Fragment key={item.id}>
                  {renderFeedItem(item)}
                </React.Fragment>
              ))}
              
              {safeRender((seriesViewItems || []).length === 0 && !isLoadingSeriesView, (
                <View style={styles.emptyState}>
                  <Ionicons name="images-outline" size={64} color="#9CA3AF" />
                  <Text style={styles.emptyStateTitle}>No Variations Found</Text>
                  <Text style={styles.emptyStateSubtitle}>
                    This series doesn't have any variations yet.
                  </Text>
                </View>
              ))}
            </ScrollView>
          ))}
        </View>
      ))}
      {safeRender(!seriesViewMasterItem, (
        /* Main Feed */
        <ScrollView
          style={styles.scrollView}
          contentInsetAdjustmentBehavior="never"
          contentContainerStyle={{ paddingBottom: 84 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
          }
          showsVerticalScrollIndicator={false}
          onScroll={handleScroll}
          scrollEventThrottle={16}
        >
          {safeRender(isLoading, (
            renderLoadingState()
          ))}
          {safeRender((feedItems || []).length === 0, (
            renderEmptyState()
          ))}
          {safeRender(!isLoading && (feedItems || []).length > 0, (
            <>
              {(feedItems || []).map(item => (
                <React.Fragment key={item.id}>
                  {renderFeedItem(item)}
                </React.Fragment>
              ))}
              
              {/* Loading more indicator */}
              {safeRender(loadingMore, (
                <View style={styles.loadingMore}>
                  <ActivityIndicator size="small" color="#A855F7" />
                  <Text style={styles.loadingMoreText}>Loading more...</Text>
                </View>
              ))}
              
              {/* End of results indicator */}
              {safeRender(!hasNextPage && (feedItems || []).length > 0, (
                <View style={styles.endOfResults}>
                  <Text style={styles.endOfResultsText}>You've reached the end!</Text>
                </View>
              ))}
            </>
          ))}
        </ScrollView>
      ))}

      {/* Modals */}
      <FilterModal
        visible={isFilterModalVisible}
        onClose={() => setIsFilterModalVisible(false)}
        onApplyFilters={handleFiltersApply}
        currentFilters={activeFilters}
      />

      <RejectModal
        visible={isRejectModalVisible}
        onClose={() => {
          setIsRejectModalVisible(false)
          setSelectedItem(null)
        }}
        onReject={handleRejectSubmit}
        isProcessing={isProcessingAction}
        item={selectedItem}
      />

      <EditModal
        visible={isEditModalVisible}
        onClose={() => {
          setIsEditModalVisible(false)
          setSelectedItem(null)
        }}
        onSave={handleEditSubmit}
        isProcessing={isProcessingAction}
        item={selectedItem}
      />

      {/* Remix Modifiers Modal */}
      <ModifiersModal
        visible={isRemixModalVisible}
        onClose={() => {
          setIsRemixModalVisible(false)
          setItemToRemix(null)
        }}
        onApply={handleRemix}
      />

      {/* Social Media Scheduling Modal */}
      <Modal
        visible={isSocialSchedulingModalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setIsSocialSchedulingModalVisible(false)}
      >
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity 
              onPress={() => setIsSocialSchedulingModalVisible(false)}
              style={styles.modalCloseButton}
            >
              <Ionicons name="close" size={24} color="#fff" />
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Schedule Social Posts</Text>
            <View style={styles.placeholder} />
          </View>

          {itemForSocialPosting && (
            <ScrollView style={styles.modalContent}>
              {/* Content Preview */}
              <View style={styles.contentPreview}>
                <Text style={styles.contentPreviewTitle}>✨ Content to Post</Text>
                <Text style={styles.contentPreviewText}>
                  {safeText(itemForSocialPosting.content_data?.processed_content || 
                   itemForSocialPosting.content_data?.text || 
                   'No content available')}
                </Text>
                {itemForSocialPosting.content_data?.image_url && (
                  <Image 
                    source={{ uri: itemForSocialPosting.content_data.image_url }}
                    style={styles.contentPreviewImage}
                  />
                )}
              </View>

              {/* Platform Selection */}
              <View style={styles.platformSelection}>
                <Text style={styles.platformSelectionTitle}>Select Platforms</Text>
                
                {safeRender(isLoadingSocialPlatforms, (
                  <View style={styles.loadingPlatforms}>
                    <ActivityIndicator size="small" color="#A855F7" />
                    <Text style={styles.loadingPlatformsText}>Loading platforms...</Text>
                  </View>
                ))}
                {safeRender(!isLoadingSocialPlatforms && (socialPlatforms || []).length === 0, (
                  <Text style={styles.noPlatformsText}>No social platforms available</Text>
                ))}
                {safeRender(!isLoadingSocialPlatforms && (socialPlatforms || []).length > 0, (
                  <View style={styles.platformGrid}>
                    {(socialPlatforms || []).map(platform => {
                      const isSelected = selectedPlatforms[itemForSocialPosting.id]?.includes(platform.id)
                      return (
                        <TouchableOpacity
                          key={platform.id}
                          style={[
                            styles.platformButton,
                            isSelected && styles.platformButtonSelected
                          ]}
                          onPress={() => togglePlatformSelection(itemForSocialPosting.id, platform.id)}
                          disabled={isProcessingAction}
                        >
                          <Ionicons 
                            name={platform.icon_name as any} 
                            size={24} 
                            color={isSelected ? "#fff" : "#9CA3AF"} 
                          />
                          <Text style={[
                            styles.platformButtonText,
                            isSelected && styles.platformButtonTextSelected
                          ]}>
                            {safeText(platform.display_name)}
                          </Text>
                        </TouchableOpacity>
                      )
                    })}
                  </View>
                ))}
                
                {/* Selected count */}
                {safeRender((selectedPlatforms[itemForSocialPosting.id] || []).length > 0, (
                  <Text style={styles.selectedCount}>
                    {safeText(String((selectedPlatforms[itemForSocialPosting.id] || []).length))} platform(s) selected
                  </Text>
                ))}
              </View>

              {/* Schedule Button */}
              <View style={styles.modalFooter}>
                <TouchableOpacity 
                  style={[
                    styles.scheduleButton,
                    (!(selectedPlatforms[itemForSocialPosting.id] || []).length || isProcessingAction) && 
                    styles.scheduleButtonDisabled
                  ]}
                  onPress={() => scheduleSocialPosts(itemForSocialPosting, selectedPlatforms[itemForSocialPosting.id] || [])}
                  disabled={!(selectedPlatforms[itemForSocialPosting.id] || []).length || isProcessingAction}
                >
                  {isProcessingAction ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <>
                      <Ionicons name="send" size={16} color="#fff" />
                      <Text style={styles.scheduleButtonText}>
                        Schedule Posts ({safeText(String((selectedPlatforms[itemForSocialPosting.id] || []).length))})
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </ScrollView>
          )}
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  )
}

// Styles
const styles = {
  container: {
    flex: 1,
    backgroundColor: '#111827',
  },
  header: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#374151',
  },
  headerLeftSection: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
  },
  backButton: {
    marginRight: 12,
    padding: 8,
  },
  mayaAvatarWrapper: {
    marginRight: 12,
  },
  headerAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '600' as const,
    color: '#fff',
  },
  headerButtons: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
  },
  headerButton: {
    padding: 8,
    marginRight: 8,
    position: 'relative' as const,
  },
  chatButton: {
    padding: 8,
  },
  filterBadge: {
    position: 'absolute' as const,
    top: 4,
    right: 4,
    backgroundColor: '#EF4444',
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
  },
  filterBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '600' as const,
  },
  scrollView: {
    flex: 1,
  },
  seriesContainer: {
    flex: 1,
  },
  seriesHeader: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#374151',
  },
  seriesTitle: {
    fontSize: 18,
    fontWeight: '600' as const,
    color: '#fff',
  },
  seriesSubtitle: {
    fontSize: 14,
    color: '#9CA3AF',
    marginTop: 4,
  },
  seriesScrollView: {
    flex: 1,
  },
  feedItemContainer: {
    backgroundColor: '#1F2937',
    marginBottom: 12,
    borderRadius: 12,
    overflow: 'hidden' as const,
  },
  feedItemHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    padding: 16,
  },
  creatorInfo: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: 12,
  },
  avatarPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#374151',
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    marginRight: 12,
  },
  avatarText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600' as const,
  },
  creatorDetails: {
    flex: 1,
  },
  creatorName: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600' as const,
  },
  metaRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    marginTop: 4,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    marginRight: 8,
  },
  statusText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '600' as const,
  },
  sourceBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    marginRight: 8,
  },
  sourceText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '600' as const,
  },
  timeAgo: {
    color: '#9CA3AF',
    fontSize: 12,
  },
  imageContainer: {
    position: 'relative' as const,
  },
  imageWrapper: {
    flex: 1,
  },
  feedImage: {
    width: '100%' as any,
  },
  feedVideo: {
    width: '100%' as any,
    aspectRatio: 4 / 5,
  },
  shareButton: {
    position: 'absolute' as const,
    top: 12,
    right: 12,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    borderRadius: 20,
    width: 40,
    height: 40,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
  },
  imageOverlayButtons: {
    position: 'absolute' as const,
    top: 12,
    right: 12,
    flexDirection: 'row' as const,
    gap: 8,
  },
  imageOverlayButton: {
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    borderRadius: 20,
    width: 40,
    height: 40,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
  },
  mayaVersionButton: {
    backgroundColor: 'rgba(225, 48, 108, 0.85)',
  },
  viewMayaVersionButton: {
    backgroundColor: 'rgba(168, 85, 247, 0.85)',
  },
  contentContainer: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 0,
  },
  processedContentContainer: {
    marginBottom: 4,
  },
  mayaLabel: {
    marginBottom: 8,
  },
  mayaLabelText: {
    color: '#A855F7',
    fontSize: 14,
    fontWeight: '600' as const,
  },
  processedContent: {
    color: '#fff',
    fontSize: 14,
    lineHeight: 20,
  },
  mayaTakeContainer: {
    marginBottom: 4,
    backgroundColor: '#2D1B69',
    borderWidth: 1,
    borderColor: '#6B46C1',
    borderRadius: 8,
    padding: 12,
    shadowColor: '#6B46C1',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  mayaTakeHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    marginBottom: 8,
  },
  mayaTakeLabel: {
    color: '#A855F7',
    fontSize: 14,
    fontWeight: '600' as const,
  },
  mayaTakeContent: {
    color: '#E5E7EB',
    fontSize: 14,
    lineHeight: 20,
  },
  promptContainer: {
    marginBottom: 4,
    padding: 12,
    backgroundColor: '#374151',
    borderRadius: 8,
  },
  promptHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    marginBottom: 4,
  },
  promptLabel: {
    color: '#9CA3AF',
    fontSize: 12,
    fontWeight: '600' as const,
    marginBottom: 4,
  },
  promptText: {
    color: '#D1D5DB',
    fontSize: 13,
    lineHeight: 18,
  },
  actionBar: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 4,
  },
  actionBarLeft: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 14,
  },
  actionBarRight: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 12,
  },
  actionBarIcon: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 4,
    padding: 2,
  },
  captionRow: {
    paddingHorizontal: 12,
    paddingTop: 4,
    paddingBottom: 10,
  },
  captionText: {
    color: '#E5E7EB',
    fontSize: 13,
  },
  captionName: {
    fontWeight: '600' as const,
    color: '#F3F4F6',
  },
  actionBarCount: {
    color: '#F3F4F6',
    fontSize: 13,
  },
  loadingState: {
    flex: 1,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    padding: 40,
  },
  loadingText: {
    color: '#9CA3AF',
    fontSize: 16,
    marginTop: 12,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    padding: 40,
  },
  emptyStateTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600' as const,
    marginTop: 16,
  },
  emptyStateSubtitle: {
    color: '#9CA3AF',
    fontSize: 14,
    textAlign: 'center' as const,
    marginTop: 8,
    lineHeight: 20,
  },
  actionsRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 16,
    gap: 8,
  },
  actionButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    gap: 4,
    flex: 1,
    justifyContent: 'center' as const,
  },
  approveButton: {
    backgroundColor: '#059669',
  },
  rejectButton: {
    backgroundColor: '#DC2626',
  },
  editButton: {
    backgroundColor: '#7C3AED',
  },
  actionButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600' as const,
  },
  commentsSection: {
    marginTop: 12,
  },
  loadingComments: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    marginBottom: 8,
  },
  loadingCommentsText: {
    color: '#9CA3AF',
    fontSize: 14,
    marginLeft: 8,
  },
  commentsList: {
    flex: 1,
  },
  commentItem: {
    marginBottom: 12,
  },
  commentHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
  },
  commentAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: 12,
  },
  commentAvatarPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#374151',
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    marginRight: 12,
  },
  commentAvatarText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600' as const,
  },
  commentContent: {
    flex: 1,
  },
  commentAuthor: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600' as const,
  },
  commentText: {
    color: '#9CA3AF',
    fontSize: 13,
    lineHeight: 18,
  },
  commentTime: {
    color: '#9CA3AF',
    fontSize: 12,
  },
  noCommentsText: {
    color: '#9CA3AF',
    fontSize: 14,
    textAlign: 'center' as const,
    marginTop: 8,
  },
  loadingMore: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    padding: 12,
  },
  loadingMoreText: {
    color: '#9CA3AF',
    fontSize: 14,
    marginLeft: 8,
  },
  endOfResults: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    padding: 12,
  },
  endOfResultsText: {
    color: '#9CA3AF',
    fontSize: 14,
  },
  githubCommitContainer: {
    marginTop: 12,
    padding: 12,
    backgroundColor: '#374151',
    borderRadius: 8,
  },
  githubHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    marginBottom: 8,
  },
  githubTitle: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600' as const,
  },
  githubCommitMessage: {
    color: '#fff',
    fontSize: 13,
    lineHeight: 18,
  },
  githubMetaRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    marginTop: 4,
  },
  githubMeta: {
    color: '#9CA3AF',
    fontSize: 12,
  },
  githubLinkButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    marginTop: 8,
  },
  githubLinkText: {
    color: '#6B46C1',
    fontSize: 12,
    marginLeft: 4,
  },
  aiProcessedBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 3,
    backgroundColor: '#6B46C1',
  },
  aiProcessedText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '500' as const,
  },
  originalSourceContainer: {
    marginTop: 12,
    padding: 12,
    backgroundColor: '#1F2937',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#374151',
  },
  originalSourceTitle: {
    color: '#9CA3AF',
    fontSize: 12,
    fontWeight: '600' as const,
    marginBottom: 4,
  },
  originalSourceText: {
    color: '#D1D5DB',
    fontSize: 13,
    lineHeight: 18,
  },
  sourceMetaRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    marginTop: 8,
    gap: 12,
  },
  sourceMeta: {
    color: '#9CA3AF',
    fontSize: 12,
  },
  sourceUrlButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    marginTop: 8,
  },
  sourceUrlText: {
    color: '#6B46C1',
    fontSize: 12,
    marginLeft: 4,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: '#111827',
  },
  modalHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    padding: 16,
  },
  modalCloseButton: {
    padding: 8,
  },
  modalTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600' as const,
    marginLeft: 16,
  },
  placeholder: {
    flex: 1,
  },
  modalContent: {
    flex: 1,
    padding: 16,
  },
  contentPreview: {
    marginBottom: 16,
  },
  contentPreviewTitle: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600' as const,
    marginBottom: 8,
  },
  contentPreviewText: {
    color: '#9CA3AF',
    fontSize: 13,
    lineHeight: 18,
  },
  contentPreviewImage: {
    flex: 1,
    height: 200,
    borderRadius: 8,
    marginBottom: 16,
  },
  platformSelection: {
    marginBottom: 16,
  },
  platformSelectionTitle: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600' as const,
    marginBottom: 8,
  },
  loadingPlatforms: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    marginBottom: 8,
  },
  loadingPlatformsText: {
    color: '#9CA3AF',
    fontSize: 14,
    marginLeft: 8,
  },
  noPlatformsText: {
    color: '#9CA3AF',
    fontSize: 14,
    textAlign: 'center' as const,
    marginTop: 8,
  },
  platformGrid: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 8,
  },
  platformButton: {
    padding: 8,
    borderWidth: 1,
    borderColor: '#374151',
    borderRadius: 8,
  },
  platformButtonSelected: {
    borderColor: '#A855F7',
  },
  platformButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600' as const,
  },
  platformButtonTextSelected: {
    color: '#A855F7',
  },
  selectedCount: {
    color: '#9CA3AF',
    fontSize: 12,
    textAlign: 'center' as const,
    marginTop: 8,
  },
  modalFooter: {
    marginTop: 16,
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#374151',
  },
  scheduleButton: {
    backgroundColor: '#10B981',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center' as const,
  },
  scheduleButtonDisabled: {
    backgroundColor: '#374151',
  },
  scheduleButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600' as const,
  },
} 