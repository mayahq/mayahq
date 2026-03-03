import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Image,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import { Ionicons } from '@expo/vector-icons';
import ModifiersModal, { Modifiers } from '../components/ModifiersModal';

const MEMORY_WORKER_API_URL = process.env.EXPO_PUBLIC_MAYA_API_ENDPOINT || 'https://mayahq-production.up.railway.app';

interface SelectedImage {
  uri: string;
  base64?: string;
}

interface BatchStatus {
  id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
  total_items: number;
  completed_items: number;
  failed_items: number;
}

export default function BatchUploadScreen({ navigation }: any) {
  const [selectedImages, setSelectedImages] = useState<SelectedImage[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [activeBatch, setActiveBatch] = useState<BatchStatus | null>(null);
  const [isPolling, setIsPolling] = useState(false);
  const [galleryPermission, requestGalleryPermission] = ImagePicker.useMediaLibraryPermissions();
  const [showModifiersModal, setShowModifiersModal] = useState(false);
  const [modifiers, setModifiers] = useState<Modifiers>({ instructions: '', visualElementIds: [] });

  // Poll for batch status when we have an active batch
  useEffect(() => {
    let intervalId: NodeJS.Timeout | null = null;

    if (activeBatch && (activeBatch.status === 'pending' || activeBatch.status === 'processing')) {
      setIsPolling(true);
      intervalId = setInterval(async () => {
        try {
          const response = await fetch(`${MEMORY_WORKER_API_URL}/api/v1/batch/${activeBatch.id}`);
          if (response.ok) {
            const data = await response.json();
            setActiveBatch(data.batch);

            // If complete, stop polling
            if (data.batch.status === 'completed' || data.batch.status === 'failed' || data.batch.status === 'cancelled') {
              setIsPolling(false);
              if (intervalId) clearInterval(intervalId);
            }
          }
        } catch (error) {
          console.error('[BatchUpload] Error polling batch status:', error);
        }
      }, 3000); // Poll every 3 seconds
    }

    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [activeBatch?.id, activeBatch?.status]);

  const handleSelectImages = async () => {
    if (!galleryPermission?.granted) {
      const permissionResult = await requestGalleryPermission();
      if (!permissionResult.granted) {
        Alert.alert('Permission Denied', 'Photo library permission is needed.');
        return;
      }
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      selectionLimit: 20,
      quality: 0.5,
    });

    if (!result.canceled && result.assets && result.assets.length > 0) {
      const newImages: SelectedImage[] = result.assets.map(asset => ({
        uri: asset.uri
      }));
      setSelectedImages(prev => [...prev, ...newImages].slice(0, 20)); // Max 20
    }
  };

  const handleRemoveImage = (index: number) => {
    setSelectedImages(prev => prev.filter((_, i) => i !== index));
  };

  const handleClearAll = () => {
    Alert.alert(
      'Clear All',
      'Remove all selected images?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Clear', style: 'destructive', onPress: () => setSelectedImages([]) }
      ]
    );
  };

  const handleStartBatch = async () => {
    if (selectedImages.length === 0) return;

    setIsUploading(true);

    try {
      // Convert all images to base64
      const imagesWithBase64 = await Promise.all(
        selectedImages.map(async (img) => {
          const base64 = await FileSystem.readAsStringAsync(img.uri, {
            encoding: FileSystem.EncodingType.Base64,
          });
          return {
            base64: `data:image/jpeg;base64,${base64}`,
            prompt: 'Place Maya naturally in this scene, matching the pose and vibe'
          };
        })
      );

      console.log(`[BatchUpload] Uploading ${imagesWithBase64.length} images...`);
      if (hasModifiers) {
        console.log('[BatchUpload] With modifiers:', modifiers);
      }

      const response = await fetch(`${MEMORY_WORKER_API_URL}/api/v1/batch/create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          images: imagesWithBase64,
          modifiers: hasModifiers ? modifiers : undefined,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Failed with status ${response.status}`);
      }

      const result = await response.json();
      console.log('[BatchUpload] Batch created:', result.batchId);

      // Clear selected images and set active batch
      setSelectedImages([]);
      setActiveBatch({
        id: result.batchId,
        status: 'pending',
        total_items: result.itemCount,
        completed_items: 0,
        failed_items: 0
      });

    } catch (error: any) {
      console.error('[BatchUpload] Error creating batch:', error);
      Alert.alert('Upload Failed', error.message || 'Failed to create batch. Please try again.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleCancelBatch = async () => {
    if (!activeBatch) return;

    Alert.alert(
      'Cancel Batch',
      'Cancel this batch? Already generated images will be kept.',
      [
        { text: 'No', style: 'cancel' },
        {
          text: 'Cancel Batch',
          style: 'destructive',
          onPress: async () => {
            try {
              await fetch(`${MEMORY_WORKER_API_URL}/api/v1/batch/${activeBatch.id}/cancel`, {
                method: 'POST',
              });
              setActiveBatch(prev => prev ? { ...prev, status: 'cancelled' } : null);
            } catch (error) {
              console.error('[BatchUpload] Error cancelling batch:', error);
            }
          }
        }
      ]
    );
  };

  const renderImageItem = ({ item, index }: { item: SelectedImage; index: number }) => (
    <View style={styles.imageItem}>
      <Image source={{ uri: item.uri }} style={styles.thumbnail} resizeMode="cover" />
      <TouchableOpacity
        style={styles.removeButton}
        onPress={() => handleRemoveImage(index)}
      >
        <Ionicons name="close-circle" size={24} color="#fff" />
      </TouchableOpacity>
      <View style={styles.indexBadge}>
        <Text style={styles.indexText}>{index + 1}</Text>
      </View>
    </View>
  );

  const progressPercent = activeBatch
    ? Math.round(((activeBatch.completed_items + activeBatch.failed_items) / activeBatch.total_items) * 100)
    : 0;

  const hasModifiers = modifiers.instructions || modifiers.visualElementIds.length > 0;

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.closeButton}>
          <Ionicons name="arrow-back" size={28} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Batch Upload</Text>
        {selectedImages.length > 0 && !activeBatch ? (
          <TouchableOpacity onPress={() => setShowModifiersModal(true)} style={styles.modifiersButton}>
            <Ionicons name="options-outline" size={24} color={hasModifiers ? '#A855F7' : '#fff'} />
            {hasModifiers && <View style={styles.modifiersBadge} />}
          </TouchableOpacity>
        ) : (
          <View style={styles.headerSpacer} />
        )}
      </View>

      {/* Active Batch Progress */}
      {activeBatch && (
        <View style={styles.batchProgress}>
          <View style={styles.batchHeader}>
            <Ionicons
              name={
                activeBatch.status === 'completed' ? 'checkmark-circle' :
                activeBatch.status === 'failed' ? 'close-circle' :
                activeBatch.status === 'cancelled' ? 'ban' :
                'hourglass'
              }
              size={24}
              color={
                activeBatch.status === 'completed' ? '#10B981' :
                activeBatch.status === 'failed' ? '#EF4444' :
                activeBatch.status === 'cancelled' ? '#6B7280' :
                '#A855F7'
              }
            />
            <Text style={styles.batchStatus}>
              {activeBatch.status === 'pending' && 'Waiting to process...'}
              {activeBatch.status === 'processing' && 'Generating images...'}
              {activeBatch.status === 'completed' && 'Batch complete!'}
              {activeBatch.status === 'failed' && 'Batch failed'}
              {activeBatch.status === 'cancelled' && 'Batch cancelled'}
            </Text>
            {isPolling && <ActivityIndicator size="small" color="#A855F7" />}
          </View>

          <View style={styles.progressBarContainer}>
            <View style={[styles.progressBar, { width: `${progressPercent}%` }]} />
          </View>

          <Text style={styles.progressText}>
            {activeBatch.completed_items} of {activeBatch.total_items} completed
            {activeBatch.failed_items > 0 && ` (${activeBatch.failed_items} failed)`}
          </Text>

          {(activeBatch.status === 'pending' || activeBatch.status === 'processing') && (
            <TouchableOpacity style={styles.cancelBatchButton} onPress={handleCancelBatch}>
              <Text style={styles.cancelBatchText}>Cancel Batch</Text>
            </TouchableOpacity>
          )}

          {(activeBatch.status === 'completed' || activeBatch.status === 'failed' || activeBatch.status === 'cancelled') && (
            <View style={styles.batchActions}>
              <TouchableOpacity
                style={styles.viewFeedButton}
                onPress={() => navigation.navigate('Home')}
              >
                <Ionicons name="grid" size={20} color="#fff" />
                <Text style={styles.viewFeedText}>View Feed</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.newBatchButton}
                onPress={() => setActiveBatch(null)}
              >
                <Ionicons name="add" size={20} color="#A855F7" />
                <Text style={styles.newBatchText}>New Batch</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      )}

      {/* Image Selection (only show if no active batch) */}
      {!activeBatch && (
        <>
          <View style={styles.content}>
            {selectedImages.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="images-outline" size={80} color="#4B5563" />
                <Text style={styles.emptyTitle}>Select Images</Text>
                <Text style={styles.emptySubtitle}>
                  Choose up to 20 images to generate Maya in each scene
                </Text>
                <TouchableOpacity style={styles.selectButton} onPress={handleSelectImages}>
                  <Ionicons name="add" size={24} color="#fff" />
                  <Text style={styles.selectButtonText}>Select from Gallery</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                <View style={styles.selectedHeader}>
                  <Text style={styles.selectedCount}>{selectedImages.length} of 20 selected</Text>
                  <TouchableOpacity onPress={handleClearAll}>
                    <Text style={styles.clearAllText}>Clear All</Text>
                  </TouchableOpacity>
                </View>
                <FlatList
                  data={selectedImages}
                  renderItem={renderImageItem}
                  keyExtractor={(_, index) => index.toString()}
                  numColumns={3}
                  contentContainerStyle={styles.imageGrid}
                />
                <TouchableOpacity
                  style={styles.addMoreButton}
                  onPress={handleSelectImages}
                  disabled={selectedImages.length >= 20}
                >
                  <Ionicons name="add" size={20} color={selectedImages.length >= 20 ? '#4B5563' : '#A855F7'} />
                  <Text style={[styles.addMoreText, selectedImages.length >= 20 && styles.addMoreTextDisabled]}>
                    Add More
                  </Text>
                </TouchableOpacity>
              </>
            )}
          </View>

          {/* Modifiers Preview */}
          {selectedImages.length > 0 && hasModifiers && (
            <TouchableOpacity style={styles.modifiersPreview} onPress={() => setShowModifiersModal(true)}>
              <Ionicons name="options" size={16} color="#A855F7" />
              <Text style={styles.modifiersPreviewText} numberOfLines={1}>
                {modifiers.instructions || `${modifiers.visualElementIds.length} element(s) selected`}
              </Text>
              <Ionicons name="chevron-forward" size={16} color="#6B7280" />
            </TouchableOpacity>
          )}

          {/* Start Batch Button */}
          {selectedImages.length > 0 && (
            <View style={styles.bottomActions}>
              <TouchableOpacity
                style={[styles.startButton, isUploading && styles.startButtonDisabled]}
                onPress={handleStartBatch}
                disabled={isUploading}
              >
                {isUploading ? (
                  <>
                    <ActivityIndicator size="small" color="#fff" />
                    <Text style={styles.startButtonText}>Uploading...</Text>
                  </>
                ) : (
                  <>
                    <Ionicons name="sparkles" size={24} color="#fff" />
                    <Text style={styles.startButtonText}>
                      Generate {selectedImages.length} Image{selectedImages.length !== 1 ? 's' : ''}
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          )}
        </>
      )}

      <ModifiersModal
        visible={showModifiersModal}
        onClose={() => setShowModifiersModal(false)}
        onApply={setModifiers}
        initialModifiers={modifiers}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#111827',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#374151',
  },
  closeButton: {
    padding: 8,
    width: 48,
  },
  headerTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  headerSpacer: {
    width: 48,
  },
  modifiersButton: {
    padding: 8,
    width: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modifiersBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#A855F7',
  },
  modifiersPreview: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1F2937',
    marginHorizontal: 16,
    marginBottom: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    gap: 8,
  },
  modifiersPreviewText: {
    flex: 1,
    color: '#9CA3AF',
    fontSize: 13,
  },
  content: {
    flex: 1,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  emptyTitle: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '600',
    marginTop: 20,
  },
  emptySubtitle: {
    color: '#9CA3AF',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 20,
  },
  selectButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#A855F7',
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 12,
    marginTop: 24,
    gap: 8,
  },
  selectButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  selectedHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  selectedCount: {
    color: '#9CA3AF',
    fontSize: 14,
  },
  clearAllText: {
    color: '#EF4444',
    fontSize: 14,
    fontWeight: '500',
  },
  imageGrid: {
    paddingHorizontal: 8,
  },
  imageItem: {
    flex: 1,
    margin: 4,
    aspectRatio: 1,
    borderRadius: 8,
    overflow: 'hidden',
    maxWidth: '31%',
  },
  thumbnail: {
    width: '100%',
    height: '100%',
  },
  removeButton: {
    position: 'absolute',
    top: 4,
    right: 4,
  },
  indexBadge: {
    position: 'absolute',
    bottom: 4,
    left: 4,
    backgroundColor: 'rgba(0,0,0,0.7)',
    borderRadius: 10,
    width: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  indexText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '600',
  },
  addMoreButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    gap: 4,
  },
  addMoreText: {
    color: '#A855F7',
    fontSize: 14,
    fontWeight: '500',
  },
  addMoreTextDisabled: {
    color: '#4B5563',
  },
  bottomActions: {
    padding: 16,
    paddingBottom: 24,
  },
  startButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E1306C',
    paddingVertical: 16,
    borderRadius: 12,
    gap: 8,
  },
  startButtonDisabled: {
    backgroundColor: '#374151',
  },
  startButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
  batchProgress: {
    backgroundColor: '#1F2937',
    margin: 16,
    padding: 16,
    borderRadius: 12,
  },
  batchHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  batchStatus: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    flex: 1,
  },
  progressBarContainer: {
    height: 8,
    backgroundColor: '#374151',
    borderRadius: 4,
    marginTop: 12,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    backgroundColor: '#A855F7',
    borderRadius: 4,
  },
  progressText: {
    color: '#9CA3AF',
    fontSize: 13,
    marginTop: 8,
  },
  cancelBatchButton: {
    alignSelf: 'flex-start',
    marginTop: 12,
  },
  cancelBatchText: {
    color: '#EF4444',
    fontSize: 14,
    fontWeight: '500',
  },
  batchActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
  },
  viewFeedButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#A855F7',
    paddingVertical: 12,
    borderRadius: 8,
    gap: 6,
  },
  viewFeedText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  newBatchButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1F2937',
    borderWidth: 1,
    borderColor: '#A855F7',
    paddingVertical: 12,
    borderRadius: 8,
    gap: 6,
  },
  newBatchText: {
    color: '#A855F7',
    fontSize: 14,
    fontWeight: '600',
  },
});
