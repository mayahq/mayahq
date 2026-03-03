import React, { useState, useEffect } from 'react'
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  Image,
  ScrollView,
  Dimensions,
  ActivityIndicator,
  Alert,
  Share,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import * as FileSystem from 'expo-file-system'

const { width: screenWidth, height: screenHeight } = Dimensions.get('window')

interface FeedItem {
  id: string;
  created_at: string;
  updated_at: string;
  item_type: string;
  source_system: string;
  content_data: any;
  status: string;
  parent_feed_item_id?: string | null;
  creator_profile_name?: string | null;
}

interface SeriesGalleryModalProps {
  visible: boolean;
  onClose: () => void;
  masterItem: FeedItem | null;
  seriesItems: FeedItem[];
  isLoading: boolean;
  onShare?: (imageUrl: string, title?: string) => void;
}

export default function SeriesGalleryModal({
  visible,
  onClose,
  masterItem,
  seriesItems,
  isLoading,
  onShare,
}: SeriesGalleryModalProps) {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [isSharingImage, setIsSharingImage] = useState<{[imageUrl: string]: boolean}>({})

  // Create unique items array with proper keys
  // For inspo images: show generated (children) FIRST, original (parent) LAST
  // For other series: show master (parent) FIRST, variations (children) after
  const allItems = React.useMemo(() => {
    const items: FeedItem[] = []
    const isInspoType = masterItem?.item_type === 'image_inspo'

    if (isInspoType) {
      // For inspo images: Generated images first, original last
      // Add series items (generated) first
      seriesItems.forEach((item, index) => {
        if (item.content_data?.image_url) {
          items.push({
            ...item,
            id: `series_${item.id}_${index}`, // Ensure unique key
          })
        }
      })

      // Add master item (original inspo) last
      if (masterItem && masterItem.content_data?.image_url) {
        items.push({
          ...masterItem,
          id: `master_${masterItem.id}`, // Ensure unique key
        })
      }
    } else {
      // Standard behavior: Master item first, variations after
      if (masterItem && masterItem.content_data?.image_url) {
        items.push({
          ...masterItem,
          id: `master_${masterItem.id}`, // Ensure unique key
        })
      }

      // Add series items with unique keys
      seriesItems.forEach((item, index) => {
        if (item.content_data?.image_url) {
          items.push({
            ...item,
            id: `series_${item.id}_${index}`, // Ensure unique key
          })
        }
      })
    }

    return items
  }, [masterItem, seriesItems])

  const currentItem = allItems[currentIndex]

  console.log('SeriesGalleryModal render:', {
    visible,
    masterItem: masterItem ? {
      id: masterItem.id,
      has_image: !!masterItem.content_data?.image_url,
      image_url: masterItem.content_data?.image_url,
      has_processed_content: !!masterItem.content_data?.processed_content
    } : null,
    seriesItems: seriesItems.map(item => ({
      id: item.id,
      has_image: !!item.content_data?.image_url,
      image_url: item.content_data?.image_url,
      has_prompt: !!item.content_data?.generated_image_prompt
    })),
    allItems_length: allItems.length,
    allItems_with_images: allItems.filter(item => item.content_data?.image_url).length,
    currentIndex,
    currentItem: currentItem ? {
      id: currentItem.id,
      has_image: !!currentItem.content_data?.image_url,
      image_url: currentItem.content_data?.image_url
    } : null
  })

  // Reset current index when modal opens/closes or items change
  React.useEffect(() => {
    if (visible) {
      setCurrentIndex(0)
    }
  }, [visible, allItems.length])

  // Handle image sharing
  const handleShare = async (imageUrl: string, itemTitle?: string) => {
    if (isSharingImage[imageUrl]) return
    
    setIsSharingImage(prev => ({ ...prev, [imageUrl]: true }))
    
    try {
      const timestamp = Date.now()
      const fileExtension = imageUrl.includes('.png') ? '.png' : '.jpg'
      const fileName = `maya_series_${timestamp}${fileExtension}`
      const localUri = `${FileSystem.documentDirectory}${fileName}`
      
      const { uri: downloadedUri } = await FileSystem.downloadAsync(imageUrl, localUri)
      
      const shareOptions = {
        url: downloadedUri,
        title: itemTitle ? `Share: ${itemTitle}` : 'Share Series Image from Maya HQ',
        message: itemTitle || 'Check out this amazing series image from Maya HQ!',
      }
      
      await Share.share(shareOptions)
      
      // Clean up after 10 seconds
      setTimeout(async () => {
        try {
          await FileSystem.deleteAsync(downloadedUri, { idempotent: true })
        } catch (cleanupError) {
          console.log('Could not clean up temporary file:', cleanupError)
        }
      }, 10000)
      
    } catch (error) {
      console.error('Error sharing series image:', error)
      Alert.alert('Share Error', 'Failed to download and share image. Please check your connection and try again.')
    } finally {
      setIsSharingImage(prev => ({ ...prev, [imageUrl]: false }))
    }
  }

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

  const goToNext = () => {
    if (currentIndex < allItems.length - 1) {
      setCurrentIndex(currentIndex + 1)
    }
  }

  const goToPrevious = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1)
    }
  }

  const renderImageCard = (item: FeedItem, index: number) => {
    const isActive = index === currentIndex
    const hasImage = item.content_data?.image_url

    console.log(`Rendering image card ${index}:`, {
      id: item.id,
      hasImage,
      image_url: item.content_data?.image_url,
      content_data: item.content_data
    })

    if (!hasImage) {
      console.log(`No image for card ${index}, skipping render`)
      return null
    }

    return (
      <View
        key={item.id}
        style={[
          styles.imageCard,
          { 
            width: screenWidth,
            opacity: isActive ? 1 : 0.3,
            transform: [{ scale: isActive ? 1 : 0.95 }]
          }
        ]}
      >
        <Image
          source={{ uri: item.content_data.image_url }}
          style={styles.seriesImage}
          resizeMode="cover"
        />
        
        {/* Share Button Overlay */}
        <TouchableOpacity 
          style={styles.shareButton}
          onPress={() => handleShare(
            item.content_data.image_url, 
            `Series ${index + 1} - ${item.content_data?.generated_image_prompt || 'Maya HQ'}`
          )}
          disabled={isSharingImage[item.content_data.image_url]}
        >
          {isSharingImage[item.content_data.image_url] ? (
            <ActivityIndicator size={16} color="#fff" />
          ) : (
            <Ionicons name="share-outline" size={20} color="#fff" />
          )}
        </TouchableOpacity>

        {/* Image Info Overlay */}
        <View style={styles.imageInfo}>
          <Text style={styles.imageIndex}>
            {index + 1} of {allItems.length}
          </Text>
          <Text style={styles.imageTime}>
            {formatTimeAgo(item.created_at)}
          </Text>
        </View>
      </View>
    )
  }

  if (!visible) return null

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity 
            style={styles.closeButton} 
            onPress={() => {
              console.log('Close button pressed!')
              onClose()
            }}
            hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }}
            activeOpacity={0.7}
          >
            <Ionicons name="close" size={28} color="#fff" />
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <Text style={styles.title}>Series Gallery</Text>
            <Text style={styles.subtitle}>
              {masterItem?.creator_profile_name || 'Maya'} • {allItems.length} images
            </Text>
          </View>
          <TouchableOpacity 
            style={styles.closeButton} 
            onPress={() => {
              console.log('Secondary close button pressed!')
              onClose()
            }}
            hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }}
            activeOpacity={0.7}
          >
            <Text style={{ color: '#fff', fontSize: 16, fontWeight: '600' }}>Done</Text>
          </TouchableOpacity>
        </View>

        {isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#A855F7" />
            <Text style={styles.loadingText}>Loading series...</Text>
          </View>
        ) : allItems.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="images-outline" size={64} color="#9CA3AF" />
            <Text style={styles.emptyTitle}>No Images Found</Text>
            <Text style={styles.emptySubtitle}>
              This series doesn't have any valid images to display.
            </Text>
            <TouchableOpacity 
              style={styles.debugButton}
              onPress={() => {
                console.log('Debug info:')
                console.log('Master item:', masterItem)
                console.log('Series items:', seriesItems)
                console.log('All items:', allItems)
              }}
            >
              <Text style={styles.debugButtonText}>Debug Info (Check Console)</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.content}>
            {/* Image Gallery */}
            <ScrollView
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              onMomentumScrollEnd={(event) => {
                const newIndex = Math.round(
                  event.nativeEvent.contentOffset.x / screenWidth
                )
                console.log('ScrollView momentum ended:', {
                  contentOffsetX: event.nativeEvent.contentOffset.x,
                  screenWidth,
                  newIndex,
                  allItemsLength: allItems.length
                })
                if (newIndex >= 0 && newIndex < allItems.length) {
                  setCurrentIndex(newIndex)
                }
              }}
              contentContainerStyle={styles.scrollContainer}
              snapToInterval={screenWidth}
              decelerationRate="fast"
            >
              {allItems.map((item, index) => {
                console.log(`Mapping item ${index} for ScrollView:`, {
                  id: item.id,
                  original_id: item.id.replace(/^(master_|series_)/, '').replace(/_\d+$/, ''),
                  has_image: !!item.content_data?.image_url,
                  image_url: item.content_data?.image_url,
                  content_data_keys: Object.keys(item.content_data || {})
                })
                return renderImageCard(item, index)
              })}
            </ScrollView>

            {/* Navigation Arrows */}
            {allItems.length > 1 && (
              <>
                {currentIndex > 0 && (
                  <TouchableOpacity 
                    style={[styles.navButton, styles.prevButton]}
                    onPress={goToPrevious}
                  >
                    <Ionicons name="chevron-back" size={24} color="#fff" />
                  </TouchableOpacity>
                )}
                
                {currentIndex < allItems.length - 1 && (
                  <TouchableOpacity 
                    style={[styles.navButton, styles.nextButton]}
                    onPress={goToNext}
                  >
                    <Ionicons name="chevron-forward" size={24} color="#fff" />
                  </TouchableOpacity>
                )}
              </>
            )}

            {/* Current Image Details */}
            {currentItem && (
              <View style={styles.detailsContainer}>
                {/* For inspo images: show caption for original, or Maya's caption for generated */}
                {masterItem?.item_type === 'image_inspo' ? (
                  <>
                    {/* Check if this is the original inspo (has source_account) or Maya's version */}
                    {currentItem.content_data?.source_account ? (
                      <View style={styles.processedContentContainer}>
                        <Text style={styles.mayaLabel}>📸 Original Inspo</Text>
                        {currentItem.content_data?.caption && (
                          <Text style={styles.processedContent}>
                            {currentItem.content_data.caption}
                          </Text>
                        )}
                        <Text style={[styles.promptText, { marginTop: 8 }]}>
                          @{currentItem.content_data.source_account}
                        </Text>
                      </View>
                    ) : (
                      <View style={styles.processedContentContainer}>
                        <Text style={styles.mayaLabel}>✨ Maya's Version</Text>
                        {currentItem.content_data?.caption && (
                          <Text style={styles.processedContent}>
                            {currentItem.content_data.caption}
                          </Text>
                        )}
                      </View>
                    )}
                  </>
                ) : (
                  <>
                    {/* Standard series display */}
                    {(currentItem.content_data?.processed_content || currentItem.content_data?.generated_image_prompt) && (
                      <View style={styles.processedContentContainer}>
                        <Text style={styles.mayaLabel}>
                          {currentItem.content_data?.processed_content ? "✨ Maya's Take" : "🎨 Generated Prompt"}
                        </Text>
                        <Text style={styles.processedContent}>
                          {currentItem.content_data?.processed_content || currentItem.content_data?.generated_image_prompt}
                        </Text>
                      </View>
                    )}

                    {/* Show the original prompt if this is a variation with a different generated prompt */}
                    {currentItem.content_data?.generated_image_prompt && currentItem.content_data?.processed_content && (
                      <View style={styles.promptContainer}>
                        <Text style={styles.promptLabel}>Generated Prompt:</Text>
                        <Text style={styles.promptText}>
                          {currentItem.content_data.generated_image_prompt}
                        </Text>
                      </View>
                    )}
                  </>
                )}
              </View>
            )}
          </View>
        )}
      </SafeAreaView>
    </Modal>
  )
}

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
    backgroundColor: '#111827',
    zIndex: 1000,
  },
  closeButton: {
    padding: 12,
    zIndex: 1001,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 24,
    minWidth: 48,
    minHeight: 48,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center' as const,
  },
  headerRight: {
    width: 40, // Balance the close button
  },
  title: {
    color: '#F9FAFB',
    fontSize: 18,
    fontWeight: '600' as const,
  },
  subtitle: {
    color: '#9CA3AF',
    fontSize: 14,
    marginTop: 2,
  },
  content: {
    flex: 1,
    position: 'relative' as const,
  },
  scrollContainer: {
    alignItems: 'center' as const,
  },
  imageCard: {
    borderRadius: 12,
    overflow: 'hidden' as const,
    position: 'relative' as const,
    paddingHorizontal: 16, // Add padding for visual spacing
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
  },
  seriesImage: {
    width: screenWidth - 32,
    height: (screenWidth - 32) * 0.75,
    borderRadius: 12,
  },
  shareButton: {
    position: 'absolute' as const,
    top: 8,
    right: 8,
    padding: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    borderRadius: 16,
  },
  imageInfo: {
    position: 'absolute' as const,
    top: 8,
    left: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  imageIndex: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600' as const,
  },
  imageTime: {
    color: '#D1D5DB',
    fontSize: 10,
  },
  navButton: {
    position: 'absolute' as const,
    top: (screenHeight - 200) / 2, // Center vertically accounting for header/footer
    marginTop: -20,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
  },
  prevButton: {
    left: 24,
  },
  nextButton: {
    right: 24,
  },
  detailsContainer: {
    padding: 16,
    backgroundColor: '#1F2937',
    borderTopWidth: 1,
    borderTopColor: '#374151',
  },
  processedContentContainer: {
    marginBottom: 12,
  },
  mayaLabel: {
    color: '#A855F7',
    fontSize: 14,
    fontWeight: '600' as const,
    marginBottom: 4,
  },
  processedContent: {
    color: '#F3F4F6',
    fontSize: 14,
    lineHeight: 20,
  },
  promptContainer: {
    marginBottom: 12,
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
  loadingContainer: {
    flex: 1,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    gap: 12,
  },
  loadingText: {
    color: '#9CA3AF',
    fontSize: 16,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    paddingHorizontal: 32,
  },
  emptyTitle: {
    color: '#F9FAFB',
    fontSize: 18,
    fontWeight: '600' as const,
    marginTop: 16,
    marginBottom: 8,
  },
  emptySubtitle: {
    color: '#9CA3AF',
    fontSize: 14,
    textAlign: 'center' as const,
    lineHeight: 20,
  },
  debugButton: {
    padding: 12,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    borderRadius: 8,
    marginTop: 16,
  },
  debugButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600' as const,
  },
} 